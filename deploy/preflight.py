#!/usr/bin/env python3
"""Report production deployment prerequisites without approving schema changes."""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

PROTECTED = (
    "apps/cms/payload.config.ts",
    "apps/cms/src/collections.ts",
    "apps/cms/src/payload-types.ts",
)
DEPENDENCIES = ("payload", "@payloadcms/db-sqlite")


def git(*args):
    return subprocess.check_output(["git", *args])


def manifest(revision):
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("preflight requires full commit SHAs")
    paths = git("ls-tree", "-r", "--name-only", revision, "--",
                *PROTECTED, "apps/cms/src/migrations").decode().splitlines()
    # Match the server manifest: a missing protected file is a state to review,
    # not an unreadable revision. ls-tree still fails for an invalid commit.
    files = {path: None for path in PROTECTED}
    for path in sorted(paths):
        files[path] = hashlib.sha256(git("show", revision + ":" + path)).hexdigest()
    dependencies = json.loads(git("show", revision + ":apps/cms/package.json"))["dependencies"]
    return files, {name: dependencies[name] for name in DEPENDENCIES}


def verify_plan(base, head):
    # Reconstruct only the protected inputs; never execute candidate code.
    with tempfile.TemporaryDirectory(prefix="empact-schema-preflight-") as directory:
        roots = []
        for index, revision in enumerate((base, head)):
            root = Path(directory) / str(index)
            root.mkdir()
            paths = git("ls-tree", "-r", "--name-only", revision, "--",
                        *PROTECTED, "apps/cms/src/migrations",
                        "apps/cms/package.json", "deploy/schema-plans").decode().splitlines()
            for name in paths:
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(git("show", revision + ":" + name))
            roots.append(root)
        result = subprocess.run([
            sys.executable, str(Path(__file__).with_name("schema-plan.py")),
            "check", str(roots[0]), str(roots[1]), str(Path(directory) / "plan.json"),
        ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
        if result.returncode:
            raise ValueError("Protected CMS changes need a reviewed schema plan before merge: "
                             + result.stderr.strip())
        return result.stdout.strip()


def report(base, head, require_plan=False):
    before, before_deps = manifest(base)
    after, after_deps = manifest(head)
    changed = [path for path in sorted(set(before) | set(after))
               if before.get(path) != after.get(path)]
    changed += [name for name in DEPENDENCIES if before_deps[name] != after_deps[name]]
    summary = "## Production deployment preflight\n\n"
    if changed and require_plan:
        details = verify_plan(base, head)
        summary += "**Reviewed deployment plan covers this CMS transition.**\n\n" + details + "\n\n"
        summary += "The server will check its installed revision, back up the database, and rehearse any additive SQL before applying it.\n\n"
    elif changed:
        summary += "**Maintainer review required before production deployment.**\n\n"
        summary += "\n".join("- `" + item + "`" for item in changed) + "\n\n"
        summary += (
            "These files or dependencies are protected by the server schema gate. "
            "CI passing does not authorize deployment. Inspect the full diff against "
            "the installed production revision and include an exact reviewed plan in "
            "deploy/schema-plans using docs/planning/operations/automatic-deployment.md. Changes beyond "
            "additive tables need a separate migration review.\n\n"
        )
        print("::warning title=Production deployment needs maintainer review::"
              "Protected CMS files or database dependencies changed. See the job summary.")
    else:
        summary += "No protected CMS changes relative to the comparison revision.\n\n"
    summary += (
        "Comparison: `" + base + "` → `" + head + "`. This report neither reads "
        "the production server nor grants approval; the server remains authoritative.\n"
    )
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base")
    parser.add_argument("head")
    parser.add_argument("--require-plan", action="store_true",
                        help="Fail CI when protected changes lack an exact reviewed plan")
    args = parser.parse_args()
    summary = report(args.base, args.head, require_plan=args.require_plan)
    print(summary)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as handle:
            handle.write(summary)


if __name__ == "__main__":
    main()
