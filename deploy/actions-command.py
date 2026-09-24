#!/usr/bin/python3 -I
"""Restricted SSH entrypoint: accept one approved GitHub artifact and release it.

Install root-owned and allow sudo with no command-line arguments. The SSH key's
forced command must invoke this file; it never evaluates SSH_ORIGINAL_COMMAND.
"""
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time
from datetime import datetime

ROOT = Path("/srv/empact")
STAGING = ROOT / "staging"
MIN_FREE_BYTES = 3 * 1024 ** 3
MIN_FREE_INODES = 150000
PRUNE = Path("/usr/local/lib/empact/prune-build-cache.py")
UPLOAD_BUDGET_SECONDS = 30 * 60
PROGRESS_INTERVAL_BYTES = 32 * 1024 * 1024


def _load(name, alias):
    spec = importlib.util.spec_from_file_location(alias, Path(__file__).with_name(name))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


gate = _load("auto-update.py", "empact_auto_update")
runtime = _load("runtime-artifact.py", "empact_runtime_artifact")


def read_sha(stream):
    value = stream.readline(42)
    if not re.fullmatch(r"[0-9a-f]{40}\n", value):
        raise ValueError("expected exactly one full lowercase commit SHA and newline")
    return value.rstrip("\n")


def read_request(stream):
    line = stream.readline(160)
    if not line.endswith(b"\n") or len(line) > 159:
        raise ValueError("expected a short JSON deployment request")

    def unique_object(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("duplicate deployment request key")
            result[key] = value
        return result

    try:
        request = json.loads(line.decode("ascii"), object_pairs_hook=unique_object)
    except (UnicodeError, json.JSONDecodeError) as error:
        raise ValueError("invalid deployment request") from error
    if (not isinstance(request, dict) or set(request) != {"sha", "artifactId"} or
            not isinstance(request["sha"], str) or not gate.SHA_RE.fullmatch(request["sha"]) or
            not isinstance(request["artifactId"], int) or isinstance(request["artifactId"], bool) or
            request["artifactId"] < 1):
        raise ValueError("deployment request accepts only a SHA and artifact ID")
    return request


def approved_metadata(sha, artifact_id):
    gate.start_gate(sha, gate.current_revision(ROOT / "code/current"))
    run = gate.approved_run(sha)
    artifact = gate.github_json("/repos/{}/actions/artifacts/{}".format(gate.REPOSITORY, artifact_id))
    return runtime.validate_artifact(sha, artifact_id, artifact, run, gate.REPOSITORY)


def check_capacity(root, incoming_size):
    usage = os.statvfs(str(root))
    if (usage.f_bavail * usage.f_frsize < MIN_FREE_BYTES + incoming_size or
            usage.f_favail < MIN_FREE_INODES):
        raise ValueError("insufficient disk headroom for artifact reception and deployment")


def upload_log(message):
    # SSH may disconnect while the trusted receiver still needs to remove its
    # partial archive. Diagnostics must never interrupt that cleanup.
    try:
        print(message, file=sys.stderr, flush=True)
    except (OSError, ValueError):
        pass


def stage_artifact(sha, metadata, stream, staging=STAGING):
    staging = Path(staging)
    if staging.is_symlink() or not staging.is_dir() or os.stat(str(staging)).st_uid != 0:
        raise ValueError("trusted staging directory missing")
    final_zip = staging / ("artifact-" + sha + ".zip")
    final_metadata = staging / ("artifact-" + sha + ".json")
    temporary = staging / (".artifact-" + sha + "." + str(os.getpid()) + ".tmp")
    for path in (final_zip, final_metadata, temporary):
        if path.exists() or path.is_symlink():
            raise ValueError("artifact staging path already exists")
    digest = hashlib.sha256()
    expected_size = metadata["size"]
    remaining = expected_size
    received = 0
    next_report = PROGRESS_INTERVAL_BYTES
    started = time.monotonic()
    installed_zip = False
    try:
        upload_log("Receiving artifact: 0/{} bytes".format(expected_size))
        descriptor = os.open(str(temporary), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "wb") as output:
            while remaining:
                chunk = stream.read(min(1024 * 1024, remaining))
                if not chunk:
                    raise ValueError("short artifact upload")
                output.write(chunk)
                received += len(chunk)
                remaining -= len(chunk)
                digest.update(chunk)
                if received >= next_report:
                    upload_log("Artifact received: {}/{} bytes in {:.1f}s".format(
                        received, expected_size, time.monotonic() - started))
                    next_report += PROGRESS_INTERVAL_BYTES
            upload_log("Artifact received: {}/{} bytes in {:.1f}s; awaiting input EOF".format(
                received, expected_size, time.monotonic() - started))
            if stream.read(1):
                raise ValueError("artifact upload has trailing bytes")
            output.flush()
            os.fsync(output.fileno())
        if "sha256:" + digest.hexdigest() != metadata["expectedDigest"]:
            raise ValueError("artifact upload digest mismatch")
        os.replace(str(temporary), str(final_zip))
        installed_zip = True
        with open(str(final_metadata), "x") as output:
            json.dump(metadata, output, sort_keys=True)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(str(final_metadata), 0o600)
        return final_zip
    except BaseException:
        upload_log("Artifact reception failed after {}/{} bytes in {:.1f}s".format(
            received, expected_size, time.monotonic() - started))
        if temporary.exists():
            temporary.unlink()
        if installed_zip:
            final_zip.unlink()
        if final_metadata.exists() and not final_metadata.is_symlink():
            final_metadata.unlink()
        raise


def prepare_artifact(request, stream, deploy_lock):
    sha = request["sha"]
    metadata = approved_metadata(sha, request["artifactId"])
    # A retired rollback and abandoned candidate are removed while both locks
    # are held, before the ZIP consumes any server storage.
    subprocess.run([str(PRUNE), sha, "--phase", "prepare", "--discard-candidate",
                    "--apply", "--lock-fd", str(deploy_lock.fileno())],
                   pass_fds=(deploy_lock.fileno(),), check=True)
    check_capacity(ROOT, metadata["size"])
    return stage_artifact(sha, metadata, stream)


def upload_timeout(signum, frame):
    raise TimeoutError("artifact upload timed out after {} seconds".format(UPLOAD_BUDGET_SECONDS))


def deploy(sha):
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise ValueError("invalid deployment SHA")
    unit = "empact-release@{}.service".format(sha)
    state = subprocess.check_output([
        "/usr/bin/systemctl", "show", unit,
        "--property=ActiveState", "--property=SubState",
    ], universal_newlines=True)
    properties = dict(line.split("=", 1) for line in state.splitlines() if "=" in line)
    if properties.get("ActiveState") not in ("inactive", "failed"):
        if properties.get("SubState") != "exited":
            raise ValueError("this revision is still deploying; inspect its unit before retrying")
        # A disconnected prior caller may have left a completed unit retained.
        subprocess.run(["/usr/bin/systemctl", "stop", unit], check=True)
    since = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    print("Starting {}. Server logs follow when the release finishes.".format(unit), flush=True)
    # systemd owns the deployment, so losing this SSH connection cannot kill a
    # release in the middle of switching pointers. Its own timeout still applies.
    started = subprocess.run(["/usr/bin/systemctl", "start", unit])
    subprocess.run([
        "/usr/bin/journalctl", "--unit", unit, "--since", since,
        "--no-pager", "--output=cat",
    ])
    state = subprocess.check_output([
        "/usr/bin/systemctl", "show", unit,
        "--property=Result", "--property=ExecMainStatus",
    ], universal_newlines=True)
    properties = dict(line.split("=", 1) for line in state.splitlines() if "=" in line)
    # RemainAfterExit retains the exact exit status until it has been read here;
    # otherwise systemd can unload a successful unit (including exit 3) first.
    subprocess.run(["/usr/bin/systemctl", "stop", unit], check=True)
    status = properties.get("ExecMainStatus")
    if started.returncode == 0 and properties.get("Result") == "success":
        if status == "3":
            return 3  # Superseded before deployment began, no release occurred.
        if status == "0":
            return 0
    print("Deployment failed: {}".format(properties), file=sys.stderr)
    return 1


def main():
    try:
        if len(sys.argv) != 1:
            raise ValueError("command-line arguments are not accepted")
        if os.geteuid() != 0:
            raise ValueError("restricted deployment entrypoint must run as root")
        signal.signal(signal.SIGALRM, upload_timeout)
        signal.alarm(UPLOAD_BUDGET_SECONDS)
        request = read_request(sys.stdin.buffer)
        with open("/run/lock/empact-actions.lock", "w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with open("/run/lock/empact-deploy.lock", "w") as deploy_lock:
                fcntl.flock(deploy_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                prepare_artifact(request, sys.stdin.buffer, deploy_lock)
            signal.alarm(0)
            return deploy(request["sha"])
    except gate.SupersededError as error:
        upload_log(str(error))
        return 3
    except (ValueError, OSError, gate.GateError, subprocess.CalledProcessError) as error:
        upload_log(str(error))
        return 1
    finally:
        signal.alarm(0)


if __name__ == "__main__":
    sys.exit(main())
