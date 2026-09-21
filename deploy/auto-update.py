#!/usr/bin/env python3
"""Poll GitHub for a CI-approved main commit and invoke the trusted installer."""
import argparse
import json
import os
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


class SupersededError(GateError):
    """The event was replaced by a newer main revision; this is neutral."""
    pass


def github_json(path: str) -> object:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "empact-auto-deploy",
    }
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = "Bearer " + token
    request = urllib.request.Request(
        API + path,
        headers=headers,
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


def compare_status(base: str, head: str) -> str:
    """Return GitHub's relation of base to head, failing closed on bad input."""
    if not SHA_RE.fullmatch(base) or not SHA_RE.fullmatch(head):
        raise GateError("GitHub compare requires full 40-character SHAs")
    data = github_json(f"/repos/{REPOSITORY}/compare/{base}...{head}")
    status = data.get("status") if isinstance(data, dict) else None
    if status not in ("ahead", "behind", "diverged", "identical"):
        raise GateError("GitHub compare did not return a valid status")
    return status


def ensure_ancestor(base: Optional[str], head: str, description: str) -> None:
    if base is None:
        return
    if not SHA_RE.fullmatch(base):
        raise GateError("installed revision is not a full 40-character SHA")
    if compare_status(base, head) not in ("ahead", "identical"):
        raise GateError(description)


def current_revision(path: Path) -> Optional[str]:
    try:
        target = path.resolve(strict=True)
    except FileNotFoundError:
        return None
    return target.name


def start_gate(sha: str, current: Optional[str]) -> None:
    """Validate the pinned start state before any expensive installer work."""
    if not SHA_RE.fullmatch(sha):
        raise GateError("deployment target must be a full 40-character SHA")
    if latest_main_sha() != sha:
        raise SupersededError("main no longer matches the expected deployment SHA")
    approved_run(sha)
    ensure_ancestor(current, sha, "installed revision is not an ancestor of the deployment target")


def finish_gate(sha: str, current: Optional[str]) -> None:
    """Validate the pinned target after build, before install/publication."""
    if not SHA_RE.fullmatch(sha):
        raise GateError("deployment target must be a full 40-character SHA")
    main_sha = latest_main_sha()
    approved_run(sha)
    if compare_status(sha, main_sha) not in ("ahead", "identical"):
        raise GateError("deployment target is no longer an ancestor of current main")
    if current is None:
        raise GateError("installed revision is unavailable for finish gate")
    ensure_ancestor(current, sha, "installed revision is newer than the deployment target")


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
    parser.add_argument("--expected-sha", help="check the locked start gate for this SHA (check-only)")
    parser.add_argument("--pinned-sha", help="check the post-build finish gate for this SHA (check-only)")
    args = parser.parse_args()
    try:
        expected_sha = getattr(args, "expected_sha", None)
        pinned_sha = getattr(args, "pinned_sha", None)
        if expected_sha and pinned_sha:
            raise GateError("--expected-sha and --pinned-sha are mutually exclusive")
        if (expected_sha or pinned_sha) and not args.check_only:
            raise GateError("pinned gate modes require --check-only")
        if expected_sha and not SHA_RE.fullmatch(expected_sha):
            raise GateError("deployment target must be a full 40-character SHA")
        if pinned_sha and not SHA_RE.fullmatch(pinned_sha):
            raise GateError("deployment target must be a full 40-character SHA")
        if expected_sha:
            start_gate(expected_sha, current_revision(Path(args.current)))
            return 0
        if pinned_sha:
            finish_gate(pinned_sha, current_revision(Path(args.current)))
            return 0
        sha = latest_main_sha()
        current = current_revision(Path(args.current))
        # A check-only poll must always inspect the current CI result before
        # taking the already-deployed shortcut.
        run = approved_run(sha)
        if current == sha:
            print(f"skip: {sha} is already deployed (code pointer only; public health is checked by the installer)")
            return 0
        print(f"approved: {sha} via run {run.get('id', 'unknown')}")
        if args.check_only:
            return 0
        deploy(sha, Path(args.installer))
        print(f"deployed: {sha}")
        return 0
    except SupersededError as error:
        print(f"auto-deploy superseded: {error}", file=sys.stderr)
        return 3
    except (GateError, OSError, subprocess.CalledProcessError) as error:
        print(f"auto-deploy skipped: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
