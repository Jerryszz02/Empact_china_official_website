#!/usr/bin/env python3
"""Actions-side target selection and independent public release verification."""
import argparse
import importlib.util
import json
import os
import re
from pathlib import Path
import subprocess
import sys
import threading
import urllib.error
import urllib.request

spec = importlib.util.spec_from_file_location("auto_update", Path(__file__).with_name("auto-update.py"))
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
spec = importlib.util.spec_from_file_location("runtime_artifact", Path(__file__).with_name("runtime-artifact.py"))
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)

PUBLIC_ORIGIN = "https://empact.cn"
PAGES = {
    "/": "Empact",
    "/youth/": "青少年",
    "/contact/": "咨询与合作",
    "/youth/international-talent-model/": "复合身份认同力",
}


def select_target(sha, runs):
    if not isinstance(sha, str) or not gate.SHA_RE.fullmatch(sha):
        raise ValueError("main must resolve to a full commit SHA")
    candidates = [run for run in runs if (
        run.get("head_sha") == sha and run.get("head_branch") == "main"
        and run.get("event") == "push"
    )]
    candidates.sort(key=lambda run: (int(run["id"]), int(run.get("run_attempt", 0))), reverse=True)
    if not candidates:
        return None
    latest = candidates[0]
    if latest.get("status") != "completed" or latest.get("conclusion") != "success":
        return None
    return latest


def output(name, value):
    with open(os.environ["GITHUB_OUTPUT"], "a") as handle:
        handle.write("{}={}\n".format(name, value))


def check_connection():
    names = {
        "DEPLOY_SSH_KEY": "EMPACT_DEPLOY_SSH_KEY (Actions secret)",
        "DEPLOY_KNOWN_HOSTS": "EMPACT_DEPLOY_KNOWN_HOSTS (Actions secret)",
        "DEPLOY_HOST": "EMPACT_DEPLOY_HOST (Actions variable)",
    }
    errors = ["Missing " + label for key, label in names.items()
              if not os.environ.get(key, "").strip()]
    host = os.environ.get("DEPLOY_HOST", "")
    if host and not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9.-]*", host):
        errors.append("Invalid EMPACT_DEPLOY_HOST: expected a hostname or IPv4 address")
    if errors:
        message = "Deployment connection is not configured:\n" + "\n".join(errors)
        if os.environ.get("GITHUB_STEP_SUMMARY"):
            with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as handle:
                handle.write("## Deployment configuration failure\n\n" + message +
                             "\n\nCorrect the named repository settings before retrying.\n")
        raise ValueError(message)


def select():
    # Select when the serialized job actually starts, not from a potentially
    # out-of-order workflow_run event that waited behind another deployment.
    sha = gate.latest_main_sha()
    data = gate.github_json(
        "/repos/{}/actions/workflows/{}/runs?branch=main&event=push&head_sha={}&per_page=20".format(
            gate.REPOSITORY, gate.WORKFLOW, sha
        )
    )
    run = select_target(sha, data.get("workflow_runs", []))
    output("sha", sha)
    output("ready", "true" if run else "false")
    if run:
        output("run_id", str(run["id"]))
        output("run_attempt", str(run["run_attempt"]))
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as handle:
        handle.write("Target main revision: `{}`\n\n".format(sha))
        if run:
            handle.write("CI approved: [run {}](https://github.com/{}/actions/runs/{})\n\n".format(
                run["id"], gate.REPOSITORY, run["id"]
            ))
        else:
            handle.write("Skipped: current main has no successful latest push CI run. Its successful completion will trigger another deployment.\n")


def runtime_metadata(sha, kind="runtime", run=None):
    if run is None:
        run = gate.approved_run(sha)
    name = (runtime.artifact_name(sha, run["run_attempt"]) if kind == "runtime" else
            runtime.artifact_name(sha, run["run_attempt"], kind=kind))
    data = gate.github_json("/repos/{}/actions/runs/{}/artifacts?name={}&per_page=100".format(
        gate.REPOSITORY, run["id"], name))
    artifacts = data.get("artifacts", [])
    if data.get("total_count") != 1 or len(artifacts) != 1:
        raise ValueError("Exactly one approved {} artifact is required; rerun Website checks if it expired.".format(kind))
    artifact = artifacts[0]
    if kind == "runtime":
        return runtime.validate_artifact(sha, artifact.get("id"), artifact, run, gate.REPOSITORY)
    return runtime.validate_artifact(sha, artifact.get("id"), artifact, run, gate.REPOSITORY, kind=kind)


def deployment_artifacts(sha):
    run = gate.approved_run(sha)
    application = runtime_metadata(sha, kind="runtime", run=run)
    dependencies = runtime_metadata(sha, kind="dependencies", run=run)
    if application["artifactId"] == dependencies["artifactId"]:
        raise ValueError("application and dependency artifacts must differ")
    return application, dependencies


def download_runtime(sha, destination):
    metadata = runtime_metadata(sha)
    # gh handles GitHub authentication and the short-lived download redirect.
    # The token stays on the runner; ECS receives only these verified ZIP bytes.
    destination = Path(destination)
    created = False
    try:
        with destination.open("xb") as output_file:
            created = True
            subprocess.run(["gh", "api", "/repos/{}/actions/artifacts/{}/zip".format(
                gate.REPOSITORY, metadata["artifactId"])], stdout=output_file, check=True)
        if destination.stat().st_size != metadata["size"] or runtime._sha256(destination) != metadata["expectedDigest"]:
            raise ValueError("Downloaded runtime artifact size or digest mismatch")
    except BaseException:
        if created and destination.is_file():
            destination.unlink()
        raise
    output("artifact_id", str(metadata["artifactId"]))
    print("Verified runtime artifact {} from CI run {} attempt {}".format(
        metadata["artifactId"], metadata["runId"], metadata["runAttempt"]))
    return metadata


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


def signed_download_url(artifact_id):
    token = os.environ.get("GITHUB_TOKEN", "")
    if not token or not isinstance(artifact_id, int) or artifact_id < 1:
        raise ValueError("GitHub artifact URL request is not configured")
    request = urllib.request.Request(
        "https://api.github.com/repos/{}/actions/artifacts/{}/zip".format(gate.REPOSITORY, artifact_id),
        headers={"Accept": "application/vnd.github+json", "Authorization": "Bearer " + token,
                 "User-Agent": "empact-actions-deploy"},
    )
    opener = urllib.request.build_opener(NoRedirect)
    try:
        response = opener.open(request, timeout=20)
    except urllib.error.HTTPError as error:
        try:
            if error.code != 302:
                raise ValueError("GitHub artifact redirect returned HTTP {}".format(error.code)) from None
            location = error.headers.get("Location")
        finally:
            error.close()
    except (urllib.error.URLError, TimeoutError):
        raise ValueError("GitHub artifact redirect request failed") from None
    else:
        response.close()
        raise ValueError("GitHub artifact API did not return a redirect")
    try:
        return runtime.validate_download_url(location)
    except (ValueError, TypeError):
        raise ValueError("GitHub artifact redirect URL failed validation") from None


def _forward_stderr(stream):
    for line in iter(stream.readline, b""):
        try:
            sys.stderr.write(line.decode("utf-8", errors="replace"))
            sys.stderr.flush()
        except (OSError, ValueError):
            pass


def _close_input(process):
    if process.stdin and not process.stdin.closed:
        try:
            process.stdin.close()
        except (OSError, ValueError):
            pass


def _stop_process(process):
    _close_input(process)
    try:
        return process.wait(timeout=15)
    except subprocess.TimeoutExpired:
        process.terminate()
        try:
            return process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            return process.wait(timeout=5)


def deploy_runtime(sha):
    if not isinstance(sha, str) or not gate.SHA_RE.fullmatch(sha):
        raise ValueError("deployment target must be a full SHA")
    host = os.environ.get("DEPLOY_HOST", "")
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9.-]*", host):
        raise ValueError("Invalid EMPACT_DEPLOY_HOST: expected a hostname or IPv4 address")
    connection = Path(os.environ["RUNNER_TEMP"]) / "empact-ssh"
    key = connection / "key"
    known_hosts = connection / "known_hosts"
    if not key.is_file() or not known_hosts.is_file():
        raise ValueError("restricted deployment connection files are missing")
    application, dependencies = deployment_artifacts(sha)
    artifact_id = application["artifactId"]
    dependency_id = dependencies["artifactId"]
    command = ["ssh", "-T", "-i", str(key),
               "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes",
               "-o", "StrictHostKeyChecking=yes", "-o", "UserKnownHostsFile=" + str(known_hosts),
               "-o", "ConnectTimeout=15", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=4",
               "empact-deploy@" + host, "deploy"]
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    stderr_reader = threading.Thread(target=_forward_stderr, args=(process.stderr,), daemon=True)
    stderr_reader.start()
    app_ready_line = "EMPACT_ARTIFACT_READY {} {}".format(sha, artifact_id).encode("ascii") + b"\n"
    dependency_ready_line = "EMPACT_ARTIFACT_READY {} {}".format(sha, dependency_id).encode("ascii") + b"\n"
    complete_line = "EMPACT_ARTIFACTS_COMPLETE {}".format(sha).encode("ascii") + b"\n"
    app_ready = False
    dependency_ready = False
    complete = False
    try:
        request = json.dumps({"sha": sha, "artifactId": artifact_id,
                              "dependencyArtifactId": dependency_id, "transport": "https-layers"},
                             separators=(",", ":")).encode("ascii") + b"\n"
        process.stdin.write(request)
        process.stdin.flush()
        for line in iter(process.stdout.readline, b""):
            if line.startswith(b"EMPACT_ARTIFACT_READY "):
                if complete:
                    raise ValueError("restricted server returned an unexpected READY response")
                if line == app_ready_line and not app_ready:
                    requested_id = artifact_id
                    app_ready = True
                elif line == dependency_ready_line and app_ready and not dependency_ready:
                    requested_id = dependency_id
                    dependency_ready = True
                else:
                    raise ValueError("restricted server returned an unexpected READY response")
                url = signed_download_url(requested_id)
                try:
                    url_line = url.encode("ascii") + b"\n"
                except UnicodeError:
                    raise ValueError("GitHub artifact redirect URL failed validation") from None
                process.stdin.write(url_line)
                process.stdin.flush()
            elif line.startswith(b"EMPACT_ARTIFACTS_COMPLETE "):
                if complete or not app_ready or line != complete_line:
                    raise ValueError("restricted server returned an unexpected COMPLETE response")
                complete = True
                _close_input(process)
            elif line.startswith(b"EMPACT_ARTIFACT_") or line.startswith(b"EMPACT_ARTIFACTS_"):
                raise ValueError("restricted server returned an unknown artifact control response")
            else:
                sys.stdout.write(line.decode("utf-8", errors="replace"))
                sys.stdout.flush()
        result = process.wait()
        if not complete:
            if result == 3 and not app_ready:
                return 3
            raise ValueError("restricted server exited without artifact COMPLETE (status {})".format(result))
        return result
    except BaseException as error:
        result = _stop_process(process)
        if not app_ready and isinstance(error, OSError) and result == 3:
            return 3
        raise
    finally:
        _close_input(process)
        process.stdout.close()
        process.stderr.close()
        stderr_reader.join(timeout=5)


def fetch(path):
    request = urllib.request.Request(PUBLIC_ORIGIN + path, headers={"Cache-Control": "no-cache"})
    with urllib.request.urlopen(request, timeout=20) as response:
        if response.status != 200:
            raise ValueError("public check returned HTTP {}: {}".format(response.status, path))
        if response.geturl() != PUBLIC_ORIGIN + path:
            raise ValueError("unexpected redirect during public check: " + path)
        return response.read().decode("utf-8")


def verify(sha):
    if not gate.SHA_RE.fullmatch(sha):
        raise ValueError("invalid deployment SHA")
    for phase in ("before", "after"):
        release = json.loads(fetch("/release.json"))
        if release.get("codeRevision") != sha or release.get("mode") != "production":
            raise ValueError("public revision does not match deployed target: " + sha)
        if phase == "before":
            for path, marker in PAGES.items():
                html = fetch(path)
                if marker not in html or "<html" not in html.lower():
                    raise ValueError("public page is missing expected content: " + path)
                print("Verified public page: " + path)
    print("Verified public codeRevision: " + sha)
    return release


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command")
    commands.add_parser("select")
    commands.add_parser("check-connection")
    artifact = commands.add_parser("download-runtime")
    artifact.add_argument("sha")
    artifact.add_argument("destination")
    deployment = commands.add_parser("deploy-runtime")
    deployment.add_argument("sha")
    verification = commands.add_parser("verify")
    verification.add_argument("sha")
    args = parser.parse_args()
    if args.command == "check-connection":
        check_connection()
    elif args.command == "select":
        select()
    elif args.command == "download-runtime":
        download_runtime(args.sha, args.destination)
    elif args.command == "deploy-runtime":
        sys.exit(deploy_runtime(args.sha))
    elif args.command == "verify":
        release = verify(args.sha)
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as handle:
            handle.write("Public verification passed for `{}`. CMS content version: `{}`.\n\n".format(
                args.sha, release.get("version", "unknown")
            ))
    else:
        parser.error("select, check-connection, download-runtime, deploy-runtime or verify is required")


if __name__ == "__main__":
    main()
