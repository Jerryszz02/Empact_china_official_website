#!/usr/bin/env python3
"""Two-layer trusted receiver handshake and transfer ownership checks."""
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest import mock


ROOT = Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("actions_command", ROOT / "deploy/actions-command.py")
command = importlib.util.module_from_spec(spec)
spec.loader.exec_module(command)
SHA = "a" * 40
URL = "https://productionresultssa4.blob.core.windows.net/results/archive?sig=private-token"


class Lock:
    def fileno(self):
        return 9


class LayerTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.staging = Path(temporary.name) / "staging"
        self.staging.mkdir()
        self.request = {"sha": SHA, "artifactId": 7,
                        "dependencyArtifactId": 8, "transport": "https-layers"}
        self.descriptor = {"digest": "sha256:" + "b" * 64, "size": 42,
                           "lockHash": "sha256:" + "c" * 64}
        self.app = {"sha": SHA, "artifactId": 7, "size": 100}
        self.dependencies = {"sha": SHA, "artifactId": 8, "size": 50}

    def test_request_requires_exact_distinct_integer_artifact_ids(self):
        self.assertEqual(command.read_request(io.BytesIO(json.dumps(self.request).encode() + b"\n")),
                         self.request)
        cases = [dict(self.request, dependencyArtifactId=7),
                 dict(self.request, dependencyArtifactId=True),
                 dict(self.request, dependencyArtifactId="8"),
                 dict(self.request, artifactId=True),
                 dict(self.request, transport="https"),
                 dict(self.request, extra=1)]
        for case in cases:
            with self.subTest(case=case), self.assertRaises(ValueError):
                command.read_request(io.BytesIO(json.dumps(case).encode() + b"\n"))
        duplicate = (b'{"sha":"' + SHA.encode() + b'","artifactId":7,'
                     b'"dependencyArtifactId":8,"dependencyArtifactId":9,'
                     b'"transport":"https-layers"}\n')
        with self.assertRaises(ValueError):
            command.read_request(io.BytesIO(duplicate))

    def prepare(self, cache_hit, tail=b""):
        output = io.StringIO()
        staged = []
        approved_run = {"id": 123}

        def approved(sha, artifact_id, **kwargs):
            self.assertEqual(sha, SHA)
            self.assertIs(kwargs.get("run"), approved_run)
            return self.app if artifact_id == 7 else self.dependencies

        def stage(sha, metadata, url, staging=command.STAGING):
            self.assertEqual(url, URL)
            staged.append((metadata["artifactId"], Path(staging)))
            if metadata["artifactId"] == 8:
                archive = Path(staging) / ("artifact-" + SHA + ".zip")
                archive.write_bytes(b"zip")
                (Path(staging) / ("artifact-" + SHA + ".json")).write_text("{}")
                return archive
            return self.staging / "app.zip"

        stream = io.BytesIO(URL.encode() + b"\n" +
                            (b"" if cache_hit else URL.encode() + b"\n") + tail)
        with mock.patch.object(command, "STAGING", self.staging), mock.patch.object(
            command, "_trusted_staging", side_effect=lambda path: Path(path)
        ), mock.patch.object(command.gate, "start_gate") as gate, mock.patch.object(
            command.gate, "current_revision", return_value=None
        ), mock.patch.object(command.gate, "approved_run", return_value=approved_run) as run, mock.patch.object(
            command, "approved_metadata", side_effect=approved
        ) as metadata, mock.patch.object(command.subprocess, "run"), mock.patch.object(
            command, "resume_remaining", side_effect=lambda sha, item, *args: item["size"]
        ), mock.patch.object(command, "check_capacity"), mock.patch.object(
            command, "stage_https_artifact", side_effect=stage
        ), mock.patch.object(command.runtime, "application_manifest",
                             return_value={"dependencies": self.descriptor}), mock.patch.object(
            command.runtime, "prune_dependencies"
        ) as prune, mock.patch.object(command.runtime, "cached_dependencies",
                               return_value=Path("cache") if cache_hit else None), mock.patch.object(
            command.runtime, "install_dependencies"
        ) as install, redirect_stdout(output):
            if tail:
                with self.assertRaisesRegex(ValueError, "trailing input"):
                    command.prepare_artifact(self.request, stream, Lock())
                result = None
            else:
                result = command.prepare_artifact(self.request, stream, Lock())
            gate.assert_called_once()
            run.assert_called_once_with(SHA)
            self.assertEqual(metadata.call_count, 2)
            self.assertIs(metadata.call_args_list[0].kwargs["run"], approved_run)
            self.assertEqual(metadata.call_args_list[1].kwargs["kind"], "dependencies")
            prune.assert_called_once_with(command.ROOT, incoming=self.descriptor)
            self.assertEqual(install.call_count, 0 if cache_hit else 1)
        return output.getvalue(), staged, result

    def test_cache_hit_needs_only_application_url(self):
        output, staged, result = self.prepare(cache_hit=True)
        self.assertEqual(staged, [(7, self.staging)])
        self.assertEqual(result, self.staging / "app.zip")
        self.assertEqual(output, "EMPACT_ARTIFACT_READY {} 7\nEMPACT_ARTIFACTS_COMPLETE {}\n".format(SHA, SHA))

    def test_cache_miss_requests_second_url_and_cleans_completed_transfer(self):
        output, staged, result = self.prepare(cache_hit=False)
        self.assertEqual([item[0] for item in staged], [7, 8])
        self.assertEqual(staged[1][1], self.staging / "dependency-transfer")
        self.assertEqual(list((self.staging / "dependency-transfer").iterdir()), [])
        self.assertEqual(result, self.staging / "app.zip")
        self.assertEqual(output, "EMPACT_ARTIFACT_READY {} 7\nEMPACT_ARTIFACT_READY {} 8\n"
                         "EMPACT_ARTIFACTS_COMPLETE {}\n".format(SHA, SHA, SHA))

    def test_complete_requires_eof(self):
        output, _, _ = self.prepare(cache_hit=True, tail=b"unexpected")
        self.assertIn("EMPACT_ARTIFACTS_COMPLETE", output)

    def test_transfer_staging_rejects_unknown_and_preserves_it(self):
        directory = self.staging / "dependency-transfer"
        directory.mkdir(mode=0o700)
        directory.chmod(0o700)
        old = directory / ("artifact-" + SHA + ".zip")
        old.write_bytes(b"old")
        old.chmod(0o600)
        note = directory / "operator-note"
        note.write_text("preserve")
        with mock.patch.object(command, "_trusted_staging", return_value=self.staging):
            with self.assertRaisesRegex(ValueError, "unknown dependency transfer"):
                command.dependency_transfer_staging(self.staging)
        self.assertEqual(note.read_text(), "preserve")
        self.assertEqual(old.read_bytes(), b"old")

    def test_transfer_staging_removes_only_completed_known_artifacts(self):
        directory = self.staging / "dependency-transfer"
        directory.mkdir(mode=0o700)
        directory.chmod(0o700)
        old = directory / ("artifact-" + SHA + ".zip")
        old.write_bytes(b"old")
        old.chmod(0o600)
        resume = directory / command.RESUME_DATA
        resume.write_bytes(b"partial")
        resume.chmod(0o600)
        with mock.patch.object(command, "_trusted_staging", return_value=self.staging):
            self.assertEqual(command.dependency_transfer_staging(self.staging), directory)
        self.assertFalse(old.exists())
        self.assertEqual(resume.read_bytes(), b"partial")


if __name__ == "__main__":
    unittest.main()
