#!/usr/bin/env python3
"""Report production deployment prerequisites without approving schema changes."""
import argparse
import hashlib
import json
import os
import re
import subprocess

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
                "apps/cms/src/migrations").decode().splitlines()
    files = {}
    for path in [*PROTECTED, *sorted(paths)]:
        files[path] = hashlib.sha256(git("show", revision + ":" + path)).hexdigest()
    dependencies = json.loads(git("show", revision + ":apps/cms/package.json"))["dependencies"]
    return files, {name: dependencies[name] for name in DEPENDENCIES}


def report(base, head):
    before, before_deps = manifest(base)
    after, after_deps = manifest(head)
    changed = [path for path in sorted(set(before) | set(after))
               if before.get(path) != after.get(path)]
    changed += [name for name in DEPENDENCIES if before_deps[name] != after_deps[name]]
    summary = "## Production deployment preflight\n\n"
    if changed:
        summary += "**Maintainer review required before production deployment.**\n\n"
        summary += "\n".join("- `" + item + "`" for item in changed) + "\n\n"
        summary += (
            "These files or dependencies are protected by the server schema gate. "
            "CI passing does not authorize deployment. Inspect the full diff against "
            "the installed production revision. For non-schema changes, approve only "
            "the exact server manifest transition using docs/automatic-deployment.md; "
            "real schema changes require a separate migration review.\n\n"
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
    args = parser.parse_args()
    summary = report(args.base, args.head)
    print(summary)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as handle:
            handle.write(summary)


if __name__ == "__main__":
    main()
