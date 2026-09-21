#!/usr/bin/env python3
"""Actions-side target selection and independent public release verification."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import sys
import urllib.request

spec = importlib.util.spec_from_file_location("auto_update", Path(__file__).with_name("auto-update.py"))
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)

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
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as handle:
        handle.write("Target main revision: `{}`\n\n".format(sha))
        if run:
            handle.write("CI approved: [run {}](https://github.com/{}/actions/runs/{})\n\n".format(
                run["id"], gate.REPOSITORY, run["id"]
            ))
        else:
            handle.write("Skipped: current main has no successful latest push CI run. Its successful completion will trigger another deployment.\n")


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
    verification = commands.add_parser("verify")
    verification.add_argument("sha")
    args = parser.parse_args()
    if args.command == "select":
        select()
    elif args.command == "verify":
        release = verify(args.sha)
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as handle:
            handle.write("Public verification passed for `{}`. CMS content version: `{}`.\n\n".format(
                args.sha, release.get("version", "unknown")
            ))
    else:
        parser.error("select or verify is required")


if __name__ == "__main__":
    main()
