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


def download_runtime(sha, destination):
    run = gate.approved_run(sha)
    name = runtime.artifact_name(sha, run["run_attempt"])
    data = gate.github_json("/repos/{}/actions/runs/{}/artifacts?name={}&per_page=100".format(
        gate.REPOSITORY, run["id"], name))
    artifacts = data.get("artifacts", [])
    if data.get("total_count") != 1 or len(artifacts) != 1:
        raise ValueError("Exactly one approved runtime artifact is required; rerun Website checks if it expired.")
    artifact = artifacts[0]
    metadata = runtime.validate_artifact(sha, artifact.get("id"), artifact, run, gate.REPOSITORY)
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
    verification = commands.add_parser("verify")
    verification.add_argument("sha")
    args = parser.parse_args()
    if args.command == "check-connection":
        check_connection()
    elif args.command == "select":
        select()
    elif args.command == "download-runtime":
        download_runtime(args.sha, args.destination)
    elif args.command == "verify":
        release = verify(args.sha)
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as handle:
            handle.write("Public verification passed for `{}`. CMS content version: `{}`.\n\n".format(
                args.sha, release.get("version", "unknown")
            ))
    else:
        parser.error("select, check-connection, download-runtime or verify is required")


if __name__ == "__main__":
    main()
