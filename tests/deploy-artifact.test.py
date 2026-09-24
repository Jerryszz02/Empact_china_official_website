#!/usr/bin/env python3
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
import zipfile
from unittest.mock import patch

ROOT = Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("runtime_artifact", ROOT / "deploy/runtime-artifact.py")
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)
SHA = "a" * 40
REPOSITORY = "Jerryszz02/Empact_china_official_website"


def run(**changes):
    value = {"id": 9, "run_attempt": 2, "head_sha": SHA, "head_branch": "main",
             "event": "push", "status": "completed", "conclusion": "success",
             "repository": {"full_name": REPOSITORY}}
    value.update(changes)
    return value


def artifact(**changes):
    value = {"id": 7, "name": runtime.artifact_name(SHA, 2), "expired": False,
             "size_in_bytes": 99, "digest": "sha256:" + "f" * 64,
             "workflow_run": {"id": 9, "head_sha": SHA, "head_branch": "main"}}
    value.update(changes)
    return value


class ArtifactMetadataTests(unittest.TestCase):
    def test_pack_keeps_public_assets_and_runtime_without_env_or_next_cache(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            files = {
                "package.json": b"{}", "apps/site/src/main.ts": b"export {}",
                "apps/site/public/assets/logo.png": b"public image",
                "deploy/schema-plans/plan.json": b"{}",
                "apps/cms/.next/server/app.js": b"built cms",
                "apps/cms/.next/cache/old": b"cache",
                "node_modules/pkg/index.js": b"module.exports = 1",
                "node_modules/pkg/.env": b"private",
            }
            for relative, content in files.items():
                path = root / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(content)
            tracked = b"\0".join(name.encode() for name in list(files)[:4]) + b"\0"
            def command(args, **kwargs):
                if args[:2] == ["git", "rev-parse"]:
                    return (SHA + "\n").encode()
                if args[:2] == ["git", "ls-files"]:
                    return tracked
                if args == ["node", "--version"]:
                    return b"v22.12.0\n"
                raise AssertionError(args)
            archive = root / "runtime.tar.gz"
            with patch.object(runtime.subprocess, "check_output", side_effect=command), patch.object(
                runtime.platform, "system", return_value="Linux"
            ), patch.object(runtime.platform, "machine", return_value="x86_64"):
                runtime.pack(SHA, archive, root)
            with tarfile.open(archive, "r:gz") as bundle:
                names = set(bundle.getnames())
                self.assertIn("apps/site/public/assets/logo.png", names)
                self.assertIn("apps/cms/.next/server/app.js", names)
                self.assertIn("node_modules/pkg/index.js", names)
                self.assertNotIn("apps/cms/.next/cache/old", names)
                self.assertNotIn("node_modules/pkg/.env", names)
                manifest = json.load(bundle.extractfile(runtime.MANIFEST_NAME))
                self.assertEqual(manifest["sha"], SHA)
                self.assertEqual(manifest["expandedBytes"], runtime._validate_members(bundle.getmembers()))

    def test_elf_glibc_guard_matches_server_ceiling(self):
        with tempfile.TemporaryDirectory() as folder:
            binary = Path(folder) / "addon.node"
            binary.write_bytes(b"\x7fELF\x00GLIBC_2.32\x00")
            runtime._check_elf(binary)
            binary.write_bytes(b"\x7fELF\x00GLIBC_2.33\x00")
            with self.assertRaisesRegex(ValueError, "GLIBC"):
                runtime._check_elf(binary)

    def test_valid_metadata(self):
        data = runtime.validate_artifact(SHA, 7, artifact(), run(), REPOSITORY)
        self.assertEqual(data["expectedDigest"], "sha256:" + "f" * 64)
        self.assertEqual(data["runAttempt"], 2)

    def test_wrong_sha_run_branch_expiry_digest_and_name_fail(self):
        cases = [
            (artifact(), run(head_sha="b" * 40)),
            (artifact(), run(head_branch="feature")),
            (artifact(), run(conclusion="failure")),
            (artifact(), run(repository={"full_name": "someone/else"})),
            (artifact(expired=True), run()),
            (artifact(digest="sha256:" + "z" * 64), run()),
            (artifact(name=runtime.artifact_name(SHA, 1)), run()),
            (artifact(workflow_run={"id": 8, "head_sha": SHA, "head_branch": "main"}), run()),
        ]
        for data, ci in cases:
            with self.subTest(data=data, ci=ci), self.assertRaises(ValueError):
                runtime.validate_artifact(SHA, 7, data, ci, REPOSITORY)


def runtime_zip(members):
    tar_bytes = io.BytesIO()
    with tarfile.open(fileobj=tar_bytes, mode="w:gz") as bundle:
        for name, kind, content in members:
            info = tarfile.TarInfo(name)
            if kind == "dir":
                info.type = tarfile.DIRTYPE
            elif kind == "link":
                info.type = tarfile.SYMTYPE
                info.linkname = content
            elif kind == "hardlink":
                info.type = tarfile.LNKTYPE
                info.linkname = content
            else:
                info.size = len(content)
            bundle.addfile(info, io.BytesIO(content) if kind == "file" else None)
    zip_bytes = io.BytesIO()
    with zipfile.ZipFile(zip_bytes, "w") as outer:
        outer.writestr(runtime.RUNTIME_NAME, tar_bytes.getvalue())
    return zip_bytes.getvalue()


def good_members(extra=()):
    manifest = {"format": 1, "sha": SHA, "platform": "linux", "arch": "x64",
                "nodeMajor": 22, "maxExpandedBytes": runtime.MAX_EXPANDED_BYTES,
                "expandedBytes": 0}
    base = [("package.json", "file", b"{}"), ("apps/cms/.next", "dir", b""),
            ("node_modules", "dir", b""), ("apps/site/src", "dir", b"")]
    members = base + list(extra)
    other_size = sum(len(content) for _, kind, content in members if kind == "file")
    while True:
        payload = json.dumps(manifest).encode()
        total = other_size + len(payload)
        if total == manifest["expandedBytes"]:
            break
        manifest["expandedBytes"] = total
    members.append((runtime.MANIFEST_NAME, "file", json.dumps(manifest).encode()))
    return members


class ExtractionTests(unittest.TestCase):
    def extract(self, members):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            archive = root / "artifact.zip"
            archive.write_bytes(runtime_zip(members))
            destination = root / "out"
            destination.mkdir()
            with patch.object(runtime, "_verify_zip", return_value=archive), patch.object(runtime, "_check_runtime_platform"), patch.object(runtime, "_check_headroom"):
                return runtime.extract(SHA, destination), destination

    def test_valid_workspace_symlink_and_revision_marker(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            archive = root / "artifact.zip"
            archive.write_bytes(runtime_zip(good_members([
                ("packages/content", "dir", b""),
                ("node_modules/@empact", "dir", b""),
                ("node_modules/@empact/content", "link", "../../packages/content"),
            ])))
            destination = root / "out"
            destination.mkdir()
            with patch.object(runtime, "_verify_zip", return_value=archive), patch.object(runtime, "_check_runtime_platform"), patch.object(runtime, "_check_headroom"):
                runtime.extract(SHA, destination)
            self.assertEqual((destination / ".code-revision").read_text().strip(), SHA)
            self.assertEqual((destination / "node_modules/@empact/content").resolve(),
                             (destination / "packages/content").resolve())

    def test_unsafe_tar_entries_are_rejected_before_writing(self):
        bad = [
            [("../escape", "file", b"x")],
            [("/absolute", "file", b"x")],
            [("node_modules/link", "link", "../../../outside")],
            [("node_modules/link", "link", "../packages"), ("node_modules/link/file", "file", b"x")],
            [("package.json", "file", b"duplicate")],
            [("node_modules/hard", "hardlink", "package.json")],
        ]
        for extra in bad:
            with self.subTest(extra=extra), self.assertRaises(ValueError):
                self.extract(good_members(extra))

    def test_unsafe_zip_entries_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            archive = root / "artifact.zip"
            with zipfile.ZipFile(archive, "w") as outer:
                outer.writestr("../outside", b"wrong")
                outer.writestr(runtime.RUNTIME_NAME, b"wrong")
            destination = root / "out"
            destination.mkdir()
            with patch.object(runtime, "_verify_zip", return_value=archive), patch.object(runtime, "_check_runtime_platform"), patch.object(runtime, "_check_headroom"):
                with self.assertRaises(ValueError):
                    runtime.extract(SHA, destination)
            self.assertEqual(list(destination.iterdir()), [])

    def test_chained_symlinks_cannot_resolve_outside_runtime(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            outside = root / "outside"
            outside.write_text("business data")
            archive = root / "artifact.zip"
            archive.write_bytes(runtime_zip(good_members([
                ("d", "dir", b""), ("d/e", "dir", b""),
                ("d/e/a", "link", ".."),
                ("d/e/b", "link", "a/../../outside"),
            ])))
            destination = root / "out"
            destination.mkdir()
            with patch.object(runtime, "_verify_zip", return_value=archive), patch.object(runtime, "_check_runtime_platform"), patch.object(runtime, "_check_headroom"):
                with self.assertRaisesRegex(ValueError, "symlink chain"):
                    runtime.extract(SHA, destination)
            self.assertEqual(outside.read_text(), "business data")
            self.assertFalse((destination / ".code-revision").exists())

    def test_revision_marker_from_archive_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "revision marker"):
            self.extract(good_members([(".code-revision", "link", "../outside")]))


if __name__ == "__main__":
    unittest.main()
