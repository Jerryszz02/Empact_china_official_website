#!/usr/bin/env python3
"""Run the real installer against an isolated host model; no production effects."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).parents[1]
SHA, OLD = "a" * 40, "b" * 40
FAKE_COMMAND = r'''
import json, os, pathlib, signal, sys
p = pathlib.Path
root = p(os.environ["FIXTURE_ROOT"])
name, args = p(sys.argv[0]).name, sys.argv[1:]
fail = os.environ.get("FAIL_AT")
with (root / "commands").open("a") as log: log.write(name + " " + " ".join(args) + "\n")
if name == "df":
    low = fail == "capacity" and (root / "code" / os.environ["TARGET"]).exists()
    print("Filesystem Size Used Available")
    print("fixture 99999999 0 " + ("1" if low else "99999999"))
elif name == "install":
    for arg in args:
        if arg.startswith(str(root)): p(arg).mkdir(parents=True, exist_ok=True)
elif name == "readlink":
    print(p(args[-1]).resolve())
elif name == "mv":
    committing = p(args[-1]).parent == root / "receipts"
    if fail == "receipt" and committing: sys.exit(21)
    os.replace(args[-2], args[-1])
    if fail == "commit-signal" and committing: os.kill(os.getppid(), signal.SIGTERM)
elif name == "systemctl":
    pass
elif name == "curl":
    if fail == "verify": sys.exit(19)
    print(json.dumps({"codeRevision": os.environ["TARGET"]}, separators=(",", ":")))
elif name == "node":
    print(root / "data/cms.db")
elif name == "runuser":
    if "--input-type=module" in args:
        if fail == "runtime": sys.exit(18)
    else:
        public = root / "data/site/releases/new/public"
        public.mkdir(parents=True)
        current = root / "data/site/current"
        current.unlink()
        current.symlink_to(public)
        if fail == "publish": sys.exit(16)
elif name == "auto-update.py":
    if fail == "gate" and "--expected-sha" in args: sys.exit(8)
    if fail == "finish-gate" and "--pinned-sha" in args: sys.exit(9)
elif name == "runtime-artifact.py":
    destination = p(args[-1])
    (destination / "scratch").write_text("owned")
    if fail == "extract": sys.exit(10)
    (destination / ".code-revision").write_text(os.environ["TARGET"])
elif name == "schema-plan.py":
    if args[0] == "check":
        if fail == "schema": sys.exit(11)
        p(args[-1]).write_text("{}")
    elif args[0] == "fingerprint": print(p(args[1]).name)
    elif fail == "migrate": sys.exit(14)
elif name == "backup.sh":
    p(args[0]).mkdir(parents=True)
    if fail == "backup": sys.exit(13)
elif name == "publication-lock.py":
    lock = p(args[1]) / "publish.lock"
    if args[0] == "acquire": lock.write_text(args[2])
    elif lock.exists(): lock.unlink()
'''


class InstallerFlowTests(unittest.TestCase):
    def run_installer(self, fail=None):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name).resolve()
        old = root / "code" / OLD
        old.mkdir(parents=True)
        (old / ".code-revision").write_text(OLD)
        (root / "code/current").symlink_to(old)
        public = root / "data/site/releases/old/public"
        public.mkdir(parents=True)
        (root / "data/site/current").symlink_to(public)
        (root / "data/cms.db").write_text("original data")
        for directory in ("staging", "receipts", "backups", "bin", "tools"):
            (root / directory).mkdir()
        for suffix in ("zip", "json"):
            (root / "staging" / ("artifact-" + SHA + "." + suffix)).write_text("uploaded")
        for name in ("df", "install", "readlink", "mv", "systemctl", "curl", "node", "runuser",
                     "auto-update.py", "runtime-artifact.py", "schema-plan.py", "backup.sh", "publication-lock.py"):
            path = root / ("tools" if "." in name else "bin") / name
            path.write_text("#!" + sys.executable + "\n" + FAKE_COMMAND)
            path.chmod(0o755)
        for name in ("flock", "chown", "sleep", "sqlite3"):
            path = root / "bin" / name
            path.write_text("#!/bin/sh\nexit 0\n")
            path.chmod(0o755)
        prune = root / "tools/prune-build-cache.py"
        prune.write_text("#!" + sys.executable + "\n" +
            "import os,sys\ndef active_revisions(code, proc): return set()\n" +
            "def release(code, sha): return code / sha\n" +
            "if __name__ == '__main__' and os.environ.get('FAIL_AT') == 'cleanup' and 'complete' in sys.argv: sys.exit(20)\n")
        prune.chmod(0o755)
        source = (ROOT / "deploy/deploy.sh").read_text()
        source = source.replace("/srv/empact", str(root)).replace("/usr/local/lib/empact", str(root / "tools"))
        source = source.replace("/run/lock/empact-deploy.lock", str(root / "lock"))
        source = source.replace("[[ ${EUID} -eq 0 ]]", "[[ 1 == 1 ]]")
        source = source.replace("/usr/bin/node", str(root / "bin/node"))
        script = root / "installer.sh"
        script.write_text(source)
        env = dict(os.environ, FIXTURE_ROOT=str(root), TARGET=SHA, FAIL_AT=fail or "",
                   PATH=str(root / "bin") + os.pathsep + os.environ["PATH"])
        result = subprocess.run(["bash", str(script), SHA], env=env, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, universal_newlines=True, timeout=30)
        return root, result

    def test_failures_preserve_live_release_and_remove_owned_attempt(self):
        for phase in ("gate", "extract", "capacity", "runtime", "schema", "finish-gate", "backup", "migrate", "publish", "verify", "receipt"):
            with self.subTest(phase=phase):
                root, result = self.run_installer(phase)
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertEqual((root / "code/current").resolve().name, OLD, result.stdout)
                self.assertEqual((root / "data/site/current").resolve(), root / "data/site/releases/old/public", result.stdout)
                self.assertEqual((root / "data/cms.db").read_text(), "original data")
                self.assertFalse((root / "code" / SHA).exists(), result.stdout)
                self.assertFalse((root / "data/site/publish.lock").exists(), result.stdout)
                self.assertFalse(list((root / "staging").glob("artifact-*")), result.stdout)
                self.assertFalse(list((root / "staging").glob("*.tmp")), result.stdout)
                self.assertTrue(list((root / "receipts").glob("failed-*.json")))
                self.assertFalse(list((root / "receipts").glob("deploy-*.json")))
                self.assertFalse(list((root / "receipts").glob("*.tmp")))

    def test_success_promotes_previous_current_and_retains_no_upload(self):
        root, result = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual((root / "code/current").resolve().name, SHA)
        receipt = json.loads(next((root / "receipts").glob("deploy-*.json")).read_text())
        self.assertEqual(receipt["previousCode"], str(root / "code" / OLD))
        self.assertFalse(list((root / "staging").glob("artifact-*")))
        self.assertNotIn("npm ci", (root / "commands").read_text())
        self.assertNotIn("build:cms", (root / "commands").read_text())

    def test_cleanup_failure_does_not_roll_back_committed_release(self):
        root, result = self.run_installer("cleanup")
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual((root / "code/current").resolve().name, SHA)
        self.assertIn("retention cleanup needs operator attention", result.stdout)

    def test_signal_immediately_after_commit_does_not_rollback(self):
        root, result = self.run_installer("commit-signal")
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual((root / "code/current").resolve().name, SHA)
        self.assertTrue(list((root / "receipts").glob("deploy-*.json")))


if __name__ == "__main__":
    unittest.main()
