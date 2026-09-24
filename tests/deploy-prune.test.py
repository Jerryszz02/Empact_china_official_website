#!/usr/bin/env python3
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest import mock

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
        for sha in (self.current, self.previous, self.candidate, self.old):
            self.make_release(sha)
        (self.code / "current").symlink_to(self.code / self.current)
        (self.root / "receipts").mkdir()
        self.receipt(self.current, self.previous, "20260901T000000Z")
        for folder in ("data/media", "data/site", "backups", "staging"):
            (self.root / folder).mkdir(parents=True)
            if folder.startswith("data"):
                (self.root / folder / "important").write_text("keep data")

    def make_release(self, sha):
        path = self.code / sha
        path.mkdir(parents=True)
        (path / ".code-revision").write_text(sha)
        (path / "source.ts").write_text("keep source")
        (path / "node_modules").mkdir()
        (path / "node_modules/generated").write_text("rebuildable")
        return path

    def receipt(self, sha, previous, timestamp):
        path = self.root / "receipts" / ("deploy-" + timestamp + "-" + sha + ".json")
        path.write_text(json.dumps({"sha": sha, "previousCode": str(self.code / previous) if previous else "",
                                    "deployedAt": timestamp}))
        return path

    def backup(self, sha, timestamp):
        directory = self.root / "backups" / ("auto-" + sha + "-" + timestamp)
        directory.mkdir()
        archive = directory / ("empact-" + timestamp + ".tar.gz")
        with tarfile.open(str(archive), "w:gz") as bundle:
            content = b"database snapshot"
            info = tarfile.TarInfo("data/site/important")
            info.size = len(content)
            bundle.addfile(info, io.BytesIO(content))
        checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
        Path(str(archive) + ".sha256").write_text(checksum + "  " + str(archive) + "\n")
        return directory

    def failed_receipt(self, sha, timestamp, directory, complete):
        path = self.root / "receipts" / ("failed-" + timestamp + "-" + sha + ".json")
        path.write_text(json.dumps({"sha": sha, "failedAt": timestamp,
                                    "backupDir": str(directory), "backupComplete": complete}))
        return path

    def test_prepare_retires_complete_old_code_and_rollback_then_retry(self):
        paths = prune.prune(self.root, self.candidate, self.proc, phase="prepare")
        self.assertEqual(set(paths), {self.code / self.previous, self.code / self.old})
        self.assertTrue(all(path.exists() for path in paths))
        prune.prune(self.root, self.candidate, self.proc, apply=True, phase="prepare")
        for sha in (self.previous, self.old):
            self.assertFalse((self.code / sha).exists())
        self.assertTrue((self.code / self.current / "source.ts").exists())
        self.assertTrue((self.code / self.candidate / "source.ts").exists())
        self.assertEqual(prune.plan(self.root, self.candidate, self.proc, "prepare")[1], [])
        self.assertEqual(prune.plan(self.root, self.candidate, self.proc, "complete")[1],
                         [self.code / self.candidate])
        marker = prune.retired_marker(self.root, self.previous, self.current)
        self.assertEqual(json.loads(marker.read_text()), {"current": self.current, "retired": self.previous})
        for folder in ("data/media", "data/site"):
            self.assertEqual((self.root / folder / "important").read_text(), "keep data")

    def test_success_makes_old_current_rollback(self):
        prune.prune(self.root, self.candidate, self.proc, True, "prepare")
        (self.code / "current").unlink()
        (self.code / "current").symlink_to(self.code / self.candidate)
        self.receipt(self.candidate, self.current, "20260902T000000Z")
        self.assertEqual(prune.plan(self.root, self.candidate, self.proc)[0], {self.candidate, self.current})
        self.assertEqual(prune.plan(self.root, self.candidate, self.proc)[1], [])

    def test_twenty_releases_have_bounded_code_versions(self):
        current = self.current
        for n in range(20):
            candidate = ("%040x" % (n + 10))
            timestamp = "202609%02dT000000Z" % (n + 2)
            self.make_release(candidate)
            prune.prune(self.root, candidate, self.proc, True, "prepare")
            (self.code / "current").unlink()
            (self.code / "current").symlink_to(self.code / candidate)
            self.receipt(candidate, current, timestamp)
            self.backup(candidate, timestamp)
            prune.prune(self.root, candidate, self.proc, True, "complete")
            current = candidate
            versions = [p for p in self.code.iterdir() if prune.SHA.fullmatch(p.name) and p.is_dir()]
            self.assertLessEqual(len(versions), 2)
            backups = [p for p in (self.root / "backups").iterdir() if p.is_dir()]
            self.assertLessEqual(len(backups), 2)

    def test_discard_abandoned_candidate_requires_verified_inactive_code(self):
        self.assertIn(self.code / self.candidate,
                      prune.plan(self.root, self.candidate, self.proc, "prepare", True)[1])
        (self.code / self.candidate / ".code-revision").write_text(self.old)
        with self.assertRaisesRegex(ValueError, "unverified"):
            prune.plan(self.root, self.candidate, self.proc, "prepare", True)
        (self.code / self.candidate / ".code-revision").write_text(self.candidate)
        process = self.proc / "321"
        process.mkdir()
        (process / "cmdline").write_text(str(self.code / self.candidate / "server.js"))
        (process / "maps").write_text("")
        (process / "fd").mkdir()
        (process / "cwd").symlink_to(self.root)
        (process / "exe").symlink_to("/usr/bin/node")
        with self.assertRaisesRegex(ValueError, "active"):
            prune.plan(self.root, self.candidate, self.proc, "prepare", True)
        (process / "cmdline").write_text("")
        prune.prune(self.root, self.candidate, self.proc, True, "prepare", True)
        self.assertFalse((self.code / self.candidate).exists())

    def test_discard_current_candidate_keeps_running_code(self):
        self.assertNotIn(self.code / self.previous,
                         prune.plan(self.root, self.current, self.proc, "prepare")[1])
        paths = prune.prune(self.root, self.current, self.proc, True, "prepare", True)
        self.assertNotIn(self.code / self.current, paths)
        self.assertNotIn(self.code / self.previous, paths)
        self.assertTrue((self.code / self.current / "source.ts").exists())
        self.assertTrue((self.code / self.previous / "source.ts").exists())
        self.assertEqual((self.code / "current").resolve(), self.code / self.current)

    def test_missing_receipt_fails_closed(self):
        next((self.root / "receipts").iterdir()).unlink()
        with self.assertRaisesRegex(ValueError, "receipt"):
            prune.plan(self.root, self.candidate, self.proc)

    def test_first_deployment_preserves_existing_directories(self):
        (self.code / "current").unlink()
        self.assertEqual(prune.plan(self.root, self.candidate, self.proc), ({self.candidate}, []))

    def test_first_deployment_discard_cleans_only_owned_abandoned_paths(self):
        (self.code / "current").unlink()
        staging = self.root / "staging"
        owned = ("artifact-" + self.candidate + ".zip",
                 "artifact-" + self.candidate + ".json",
                 ".artifact-" + self.candidate + ".42.tmp",
                 self.candidate + ".43.tmp")
        for name in owned:
            path = staging / name
            if name == self.candidate + ".43.tmp":
                path.mkdir()
            else:
                path.write_text("abandoned")
        unrelated = staging / ("artifact-" + self.old + ".zip")
        unrelated.write_text("other release")
        paths = prune.prune(self.root, self.candidate, self.proc,
                            phase="prepare", discard_candidate=True)
        self.assertEqual(set(paths), {self.code / self.candidate} | {staging / name for name in owned})
        self.assertTrue(all(path.exists() for path in paths))
        prune.prune(self.root, self.candidate, self.proc, True, "prepare", True)
        self.assertTrue(all(not path.exists() for path in paths))
        self.assertTrue((self.code / self.previous).exists() and (self.code / self.old).exists())
        self.assertTrue(unrelated.exists())

    def test_first_deployment_discard_rejects_unverified_candidate(self):
        (self.code / "current").unlink()
        (self.code / self.candidate / ".code-revision").write_text(self.old)
        with self.assertRaisesRegex(ValueError, "unverified"):
            prune.plan(self.root, self.candidate, self.proc, "prepare", True)

    def test_unknown_symlink_and_business_data_are_preserved(self):
        (self.code / self.old / ".code-revision").unlink()
        (self.code / ("e" * 40)).symlink_to(self.code / self.old)
        (self.code / self.previous / "apps/cms/.data").mkdir(parents=True)
        paths = prune.plan(self.root, self.candidate, self.proc, "prepare")[1]
        self.assertEqual(paths, [])

    def test_active_process_reference_preserves_old_release(self):
        process = self.proc / "123"
        process.mkdir()
        (process / "cmdline").write_text("node\0server.js\0")
        (process / "maps").write_text(str(self.code / self.old / "node_modules/addon.node"))
        (process / "fd").mkdir()
        (process / "cwd").symlink_to(self.root)
        (process / "exe").symlink_to("/usr/bin/node")
        paths = prune.plan(self.root, self.candidate, self.proc, "prepare")[1]
        self.assertNotIn(self.code / self.old, paths)

    def test_rollback_outside_code_root_is_rejected(self):
        self.receipt(self.current, None, "20260903T000000Z").write_text(json.dumps({
            "sha": self.current, "previousCode": "/elsewhere/" + self.previous,
        }))
        with self.assertRaisesRegex(ValueError, "outside"):
            prune.plan(self.root, self.candidate, self.proc)

    def test_known_staging_artifacts_only(self):
        staging = self.root / "staging"
        old = "e" * 40
        names = (old + ".tar.gz", old + ".123.tmp", "." + old + ".123.tmp",
                 "artifact-" + old + ".zip", "artifact-" + old + ".json",
                 ".artifact-" + old + ".123.tmp")
        for name in names:
            path = staging / name
            if name.endswith(".tmp") and not name.startswith(".artifact-"):
                path.mkdir()
                (path / "source").write_text("partial")
            else:
                path.write_text("partial")
        (staging / ("schema-" + old + "-20260901T000000Z.json")).write_text("plan")
        (staging / "notes.txt").write_text("keep")
        (staging / ("f" * 40 + ".tar.gz")).symlink_to(staging / "notes.txt")
        paths = prune.prune(self.root, self.candidate, self.proc, True, "prepare")
        self.assertTrue(all(not (staging / name).exists() for name in names))
        self.assertTrue((staging / "notes.txt").exists())
        self.assertEqual(len([p for p in paths if p.parent == staging]), len(names))

    def test_prepare_preserves_candidate_staging_until_extract(self):
        staging = self.root / "staging"
        names = ("artifact-" + self.candidate + ".zip",
                 "artifact-" + self.candidate + ".json",
                 self.candidate + ".123.tmp",
                 ".artifact-" + self.candidate + ".456.tmp")
        for name in names:
            path = staging / name
            if name.endswith(".tmp") and not name.startswith(".artifact-"):
                path.mkdir()
            else:
                path.write_text("candidate upload")
        prune.prune(self.root, self.candidate, self.proc, True, "prepare")
        self.assertTrue(all((staging / name).exists() for name in names))
        prune.prune(self.root, self.candidate, self.proc, True, "prepare", True)
        self.assertTrue(all(not (staging / name).exists() for name in names))

    def test_bind_mount_inside_release_is_not_pruned(self):
        mountinfo = self.root / "mountinfo"
        nested = self.code / self.old / "node_modules" / "mounted data"
        nested.mkdir()
        escaped = str(nested).replace(" ", "\\040")
        mountinfo.write_text("101 10 0:36 / " + escaped + " rw,relatime - ext4 /dev/root rw\n")
        with mock.patch.object(prune, "LINUX", True), mock.patch.object(prune, "MOUNTINFO", mountinfo):
            self.assertTrue(prune.has_mount(self.code / self.old))
            self.assertNotIn(self.code / self.old,
                             prune.plan(self.root, self.candidate, self.proc, "prepare")[1])
            mountinfo.unlink()
            with self.assertRaises(OSError):
                prune.has_mount(self.code / self.old)
            denied = mock.Mock()
            denied.read_bytes.side_effect = PermissionError("mountinfo denied")
            with mock.patch.object(prune, "MOUNTINFO", denied):
                with self.assertRaises(PermissionError):
                    prune.plan(self.root, self.candidate, self.proc, "prepare")

    def test_backups_require_valid_success_receipts_and_two_recovery_points(self):
        old = "e" * 40
        older = "f" * 40
        self.receipt(old, None, "20260830T000000Z")
        self.receipt(older, None, "20260831T000000Z")
        first = self.backup(old, "20260830T000000Z")
        second = self.backup(older, "20260831T000000Z")
        third = self.backup(self.current, "20260901T000000Z")
        unknown = self.backup("1" * 40, "20260829T000000Z")
        manual = self.root / "backups/manual-keep"
        manual.mkdir()
        self.assertIn(first, prune.plan(self.root, self.candidate, self.proc)[1])
        prune.prune(self.root, self.candidate, self.proc, True)
        self.assertFalse(first.exists())
        self.assertTrue(second.exists() and third.exists())
        # A damaged current recovery point prevents further backup deletion.
        first = self.backup(old, "20260830T000000Z")
        archive = next(third.glob("*.tar.gz"))
        archive.write_bytes(b"corrupt")
        self.assertNotIn(first, prune.plan(self.root, self.candidate, self.proc)[1])
        self.assertTrue(second.exists() and unknown.exists() and manual.exists())
        failed_sha = "7" * 40
        failed_stamp = "20260904T000000Z"
        partial = self.root / "backups" / ("auto-" + failed_sha + "-" + failed_stamp)
        partial.mkdir()
        (partial / ("empact-" + failed_stamp + ".tar.gz")).write_bytes(b"partial")
        self.failed_receipt(failed_sha, failed_stamp, partial, False)
        self.assertIn(partial, prune.plan(self.root, self.candidate, self.proc)[1])

    def test_failed_backups_are_bounded_only_after_two_verified_successes(self):
        self.receipt(self.previous, None, "20260831T000000Z")
        self.backup(self.previous, "20260831T000000Z")
        self.backup(self.current, "20260901T000000Z")
        for index in range(12):
            sha = "%040x" % (index + 100)
            stamp = "202609%02dT000000Z" % (index + 2)
            directory = self.backup(sha, stamp)
            self.failed_receipt(sha, stamp, directory, True)
            prune.prune(self.root, self.candidate, self.proc, True)
            existing = [path for path in (self.root / "backups").iterdir() if path.is_dir()]
            self.assertLessEqual(len(existing), 3)
            self.assertTrue(directory.exists())
        latest = directory
        incomplete_sha = "9" * 40
        incomplete_stamp = "20260920T000000Z"
        incomplete = self.root / "backups" / ("auto-" + incomplete_sha + "-" + incomplete_stamp)
        incomplete.mkdir()
        (incomplete / ("empact-" + incomplete_stamp + ".tar.gz")).write_bytes(b"partial")
        self.failed_receipt(incomplete_sha, incomplete_stamp, incomplete, False)
        unknown = self.root / "backups" / ("auto-" + "8" * 40 + "-20260921T000000Z")
        unknown.mkdir()
        prune.prune(self.root, self.candidate, self.proc, True)
        self.assertFalse(incomplete.exists())
        self.assertTrue(latest.exists() and unknown.exists())

    def test_failed_backup_with_unknown_files_is_preserved(self):
        self.receipt(self.previous, None, "20260831T000000Z")
        self.backup(self.previous, "20260831T000000Z")
        self.backup(self.current, "20260901T000000Z")
        sha = "9" * 40
        stamp = "20260902T000000Z"
        directory = self.root / "backups" / ("auto-" + sha + "-" + stamp)
        directory.mkdir()
        (directory / "manual-note").write_text("keep")
        self.failed_receipt(sha, stamp, directory, False)
        self.assertNotIn(directory, prune.plan(self.root, self.candidate, self.proc)[1])

    def test_backup_validation_cache_reuses_unchanged_files_and_invalidates_changes(self):
        old = "e" * 40
        self.receipt(old, None, "20260830T000000Z")
        self.receipt(self.previous, None, "20260831T000000Z")
        first = self.backup(old, "20260830T000000Z")
        self.backup(self.previous, "20260831T000000Z")
        latest = self.backup(self.current, "20260901T000000Z")
        cache = {}
        with mock.patch.object(prune, "_backup_valid_uncached", wraps=prune._backup_valid_uncached) as verify:
            self.assertIn(first, prune.plan(self.root, self.candidate, self.proc,
                                            _validation_cache=cache)[1])
            self.assertEqual(verify.call_count, 3)
            prune.plan(self.root, self.candidate, self.proc, _validation_cache=cache)
            self.assertEqual(verify.call_count, 3)
            checksum = next(latest.glob("*.sha256"))
            original_checksum = checksum.read_text()
            checksum.write_text("0" * 64 + "  " + str(next(latest.glob("*.tar.gz"))))
            self.assertNotIn(first, prune.plan(self.root, self.candidate, self.proc,
                                               _validation_cache=cache)[1])
            self.assertEqual(verify.call_count, 4)
            checksum.write_text(original_checksum)
            self.assertIn(first, prune.plan(self.root, self.candidate, self.proc,
                                            _validation_cache=cache)[1])
            self.assertEqual(verify.call_count, 5)
            next(latest.glob("*.tar.gz")).write_bytes(b"changed archive")
            self.assertNotIn(first, prune.plan(self.root, self.candidate, self.proc,
                                               _validation_cache=cache)[1])
            self.assertEqual(verify.call_count, 6)


if __name__ == "__main__":
    unittest.main()
