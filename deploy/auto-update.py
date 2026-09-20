#!/usr/bin/env python3
"""Poll GitHub for a CI-approved main commit and invoke the trusted installer."""
import argparse
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Dict, Optional

REPOSITORY = "Jerryszz02/Empact_china_official_website"
WORKFLOW = "ci.yml"
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
API = "https://api.github.com"


class GateError(RuntimeError):
    pass


def github_json(path: str) -> object:
    request = urllib.request.Request(
        API + path,
        headers={"Accept": "application/vnd.github+json", "User-Agent": "empact-auto-deploy"},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            if response.status != 200:
                raise GateError(f"GitHub API returned HTTP {response.status}: {path}")
            return json.load(response)
    except (urllib.error.URLError, TimeoutError) as error:
        raise GateError(f"GitHub API unavailable: {error}") from error


def latest_main_sha() -> str:
    data = github_json(f"/repos/{REPOSITORY}/git/ref/heads/main")
    sha = data.get("object", {}).get("sha") if isinstance(data, dict) else None
    if not isinstance(sha, str) or not SHA_RE.fullmatch(sha):
        raise GateError("GitHub main ref did not return a full 40-character SHA")
    return sha


def approved_run(sha: str) -> Dict[str, object]:
    data = github_json(
        f"/repos/{REPOSITORY}/actions/workflows/{WORKFLOW}/runs?branch=main&event=push&head_sha={sha}&per_page=20"
    )
    runs = data.get("workflow_runs", []) if isinstance(data, dict) else []
    candidates = [
        run
        for run in runs
        if isinstance(run, dict)
        and run.get("head_sha") == sha
        and run.get("event") == "push"
        and run.get("head_branch") == "main"
    ]
    if not candidates:
        raise GateError(f"no {WORKFLOW} push run for {sha}")
    candidates.sort(
        key=lambda run: (int(run.get("id", 0)), int(run.get("run_attempt", 0))),
        reverse=True,
    )
    latest = candidates[0]
    if latest.get("status") != "completed" or latest.get("conclusion") != "success":
        raise GateError(f"latest {WORKFLOW} attempt for {sha} is not successful")
    return latest


def current_revision(path: Path) -> Optional[str]:
    try:
        target = path.resolve(strict=True)
    except FileNotFoundError:
        return None
    return target.name


def deploy(sha: str, installer: Path) -> None:
    if not SHA_RE.fullmatch(sha):
        raise GateError("deployment target must be a full 40-character SHA")
    # The ref is read again immediately before invoking the privileged installer.
    if latest_main_sha() != sha:
        raise GateError("main advanced while the deployment gate was being checked")
    approved_run(sha)
    subprocess.run([str(installer), sha], check=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check-only", action="store_true", help="evaluate gates without deploying")
    parser.add_argument("--current", default="/srv/empact/code/current")
    parser.add_argument("--installer", default="/usr/local/lib/empact/deploy.sh")
    parser.add_argument("--expected-sha", help=argparse.SUPPRESS)
    args = parser.parse_args()
    try:
        sha = latest_main_sha()
        expected_sha = args.expected_sha
        if expected_sha and expected_sha != sha:
            raise GateError("main no longer matches the expected deployment SHA")
        current = current_revision(Path(args.current))
        if current == sha:
            print(f"skip: {sha} is already deployed (code pointer only; public health is checked by the installer)")
            return 0
        run = approved_run(sha)
        print(f"approved: {sha} via run {run.get('id', 'unknown')}")
        if args.check_only:
            return 0
        deploy(sha, Path(args.installer))
        print(f"deployed: {sha}")
        return 0
    except (GateError, OSError, subprocess.CalledProcessError) as error:
        print(f"auto-deploy skipped: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
