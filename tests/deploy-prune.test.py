#!/usr/bin/env python3
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location(
    "prune", Path(__file__).parents[1] / "deploy/prune-build-cache.py")
prune = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prune)


class PruneTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.code = self.root / "code"
        self.proc = self.root / "proc"
        self.proc.mkdir()
        self.current, self.previous, self.candidate, self.old = [x * 40 for x in "abcd"]
        for sha in [self.current, self.previous, self.candidate, self.old]:
            path = self.code / sha
            path.mkdir(parents=True)
            (path / ".code-revision").write_text(sha)
            (path / "source.ts").write_text("keep source")
            for cache in prune.CACHES:
                (path / cache).mkdir(parents=True)
                (path / cache / "generated").write_text("rebuildable")
        (self.code / "current").symlink_to(self.code / self.current)
        (self.root / "receipts").mkdir()
        (self.root / "receipts/deploy-current.json").write_text(json.dumps({
            "sha": self.current, "previousCode": str(self.code / self.previous),
        }))
        for folder in ("data/media", "data/site", "backups"):
            (self.root / folder).mkdir(parents=True)
            (self.root / folder / "important").write_text("keep data")

    def test_apply_removes_only_old_rebuildable_caches(self):
        paths = prune.prune(self.root, self.candidate, self.proc, apply=True)
        self.assertEqual(len(paths), 2)
        for sha in (self.current, self.previous, self.candidate):
            self.assertTrue((self.code / sha / "node_modules/generated").exists())
        self.assertTrue((self.code / self.old / "source.ts").exists())
        for folder in ("data/media", "data/site", "backups"):
            self.assertEqual((self.root / folder / "important").read_text(), "keep data")
        self.assertEqual(prune.plan(self.root, self.candidate, self.proc)[1], [])

    def test_dry_run_does_not_remove_caches(self):
        paths = prune.prune(self.root, self.candidate, self.proc)
        self.assertEqual(len(paths), 2)
        self.assertTrue(all(p.exists() for p in paths))

    def test_missing_receipt_fails_closed(self):
        (self.root / "receipts/deploy-current.json").unlink()
        with self.assertRaisesRegex(ValueError, "receipt"):
            prune.plan(self.root, self.candidate, self.proc)

    def test_first_deployment_preserves_all_existing_directories(self):
        (self.code / "current").unlink()
        self.assertEqual(prune.plan(self.root, self.candidate, self.proc),
                         ({self.candidate}, []))

    def test_unknown_release_and_symlink_are_preserved(self):
        (self.code / self.old / ".code-revision").unlink()
        (self.code / ("e" * 40)).symlink_to(self.code / self.old)
        self.assertEqual(prune.plan(self.root, self.candidate, self.proc)[1], [])

    def test_cache_parent_symlink_is_not_followed(self):
        cms = self.code / self.old / "apps/cms"
        cms.rename(self.code / self.old / "kept-cms")
        cms.symlink_to(self.code / self.old / "kept-cms")
        paths = prune.plan(self.root, self.candidate, self.proc)[1]
        self.assertEqual(paths, [self.code / self.old / "node_modules"])

    def test_active_process_reference_preserves_old_release(self):
        process = self.proc / "123"
        process.mkdir()
        (process / "cmdline").write_text("node\0server.js\0")
        (process / "maps").write_text(str(self.code / self.old / "node_modules/addon.node"))
        (process / "fd").mkdir()
        (process / "cwd").symlink_to(self.root)
        (process / "exe").symlink_to("/usr/bin/node")
        self.assertEqual(prune.plan(self.root, self.candidate, self.proc)[1], [])

    def test_rollback_outside_code_root_is_rejected(self):
        (self.root / "receipts/deploy-current.json").write_text(json.dumps({
            "sha": self.current, "previousCode": "/elsewhere/" + self.previous,
        }))
        with self.assertRaisesRegex(ValueError, "outside"):
            prune.plan(self.root, self.candidate, self.proc)


if __name__ == "__main__":
    unittest.main()
