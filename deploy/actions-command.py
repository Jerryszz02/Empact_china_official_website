#!/usr/bin/python3 -I
"""Restricted SSH entrypoint: accept one SHA, run only the installed release unit.

Install root-owned and allow sudo with no command-line arguments. The SSH key's
forced command must invoke this file; it never evaluates SSH_ORIGINAL_COMMAND.
"""
import re
import fcntl
import subprocess
import sys
from datetime import datetime


def read_sha(stream):
    value = stream.readline(42)
    if not re.fullmatch(r"[0-9a-f]{40}\n", value):
        raise ValueError("expected exactly one full lowercase commit SHA and newline")
    return value.rstrip("\n")


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
        sha = read_sha(sys.stdin)
        with open("/run/lock/empact-actions.lock", "w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return deploy(sha)
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
