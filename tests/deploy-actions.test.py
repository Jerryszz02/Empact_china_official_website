#!/usr/bin/env python3
import importlib.util
import io
from contextlib import redirect_stderr
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import urllib.error
from unittest.mock import patch

ROOT = Path(__file__).parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "deploy" / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


client = load("actions-client")
command = load("actions-command")
SHA = "a" * 40
NEWER = "b" * 40


class ConnectionConfigurationTests(unittest.TestCase):
    def test_reports_missing_setting_names_without_exposing_other_values(self):
        with patch.dict(os.environ, {"DEPLOY_SSH_KEY": "private-key-content"}, clear=True):
            with self.assertRaises(ValueError) as error:
                client.check_connection()
            message = str(error.exception)
            self.assertIn("EMPACT_DEPLOY_KNOWN_HOSTS", message)
            self.assertIn("EMPACT_DEPLOY_HOST", message)
            self.assertNotIn("private-key-content", message)
            self.assertNotIn("EMPACT_DEPLOY_SSH_KEY", message)

    def test_valid_configuration_and_invalid_host(self):
        for host, valid in [("example.com", True), ("127.0.0.1", True),
                            ("-option", False), ("host;id", False), ("host\n", False)]:
            with self.subTest(host=host), patch.dict(os.environ, {
                "DEPLOY_SSH_KEY": "private-key-content", "DEPLOY_KNOWN_HOSTS": "host-key",
                "DEPLOY_HOST": host,
            }, clear=True):
                if valid:
                    client.check_connection()
                else:
                    with self.assertRaisesRegex(ValueError, "Invalid EMPACT_DEPLOY_HOST"):
                        client.check_connection()


def run(sha=SHA, **changes):
    data = dict(id=1, head_sha=sha, head_branch="main", event="push",
                run_attempt=1, status="completed", conclusion="success")
    data.update(changes)
    return data


class TargetSelectionTests(unittest.TestCase):
    def test_delayed_old_event_selects_current_main_only(self):
        self.assertEqual(client.select_target(NEWER, [run(), run(NEWER, id=2)])["id"], 2)

    def test_pending_or_failed_new_main_never_falls_back_to_old_success(self):
        for candidate in [run(NEWER, id=2, status="in_progress", conclusion=None),
                          run(NEWER, id=2, conclusion="failure")]:
            self.assertIsNone(client.select_target(NEWER, [run(), candidate]))

    def test_failed_rerun_blocks_prior_success(self):
        self.assertIsNone(client.select_target(SHA, [run(), run(run_attempt=2, conclusion="failure")]))

    def test_pr_other_branch_and_missing_run_are_not_approval(self):
        for candidates in ([], [run(event="pull_request")], [run(head_branch="feature")]):
            self.assertIsNone(client.select_target(SHA, candidates))

    def test_untrusted_sha_is_rejected(self):
        for sha in ("main", "a" * 39, "../main", "a" * 40 + "\n", None):
            with self.assertRaises(ValueError):
                client.select_target(sha, [])


class RuntimeDownloadTests(unittest.TestCase):
    def fixture(self):
        data = b"verified GitHub archive bytes"
        ci = run(repository={"full_name": client.gate.REPOSITORY})
        artifact = dict(id=7, name=client.runtime.artifact_name(SHA, 1), expired=False,
                        size_in_bytes=len(data), digest="sha256:" + hashlib.sha256(data).hexdigest(),
                        workflow_run=dict(id=1, head_sha=SHA, head_branch="main"))
        return data, ci, artifact

    def test_download_is_bound_to_approved_run_and_actual_digest(self):
        data, ci, artifact = self.fixture()
        for bad_digest in (False, True):
            with self.subTest(bad_digest=bad_digest), tempfile.TemporaryDirectory() as folder:
                target = Path(folder) / "runtime.zip"
                def download(args, stdout, check):
                    self.assertEqual(args[-1], "/repos/" + client.gate.REPOSITORY + "/actions/artifacts/7/zip")
                    stdout.write(b"x" * len(data) if bad_digest else data)
                with patch.object(client.gate, "approved_run", return_value=ci), patch.object(
                    client.gate, "github_json", return_value=dict(total_count=1, artifacts=[artifact])
                ), patch.object(client.subprocess, "run", side_effect=download), patch.object(client, "output"):
                    if bad_digest:
                        with self.assertRaisesRegex(ValueError, "digest mismatch"):
                            client.download_runtime(SHA, target)
                        self.assertFalse(target.exists())
                    else:
                        self.assertEqual(client.download_runtime(SHA, target)["artifactId"], 7)
                        self.assertEqual(target.read_bytes(), data)

    def test_missing_artifact_never_downloads(self):
        _, ci, _ = self.fixture()
        with patch.object(client.gate, "approved_run", return_value=ci), patch.object(
            client.gate, "github_json", return_value=dict(total_count=0, artifacts=[])
        ), patch.object(client.subprocess, "run") as download:
            with self.assertRaisesRegex(ValueError, "rerun Website checks"):
                client.download_runtime(SHA, "/unused")
            download.assert_not_called()


class DirectRuntimeDeploymentTests(unittest.TestCase):
    URL = "https://productionresultssa1.blob.core.windows.net/path?sig=private-token"
    DEPS_URL = "https://productionresultssa2.blob.core.windows.net/path?sig=second-private-token"

    def layers(self):
        return {"artifactId": 7}, {"artifactId": 8}

    class RecordingInput(io.BytesIO):
        def close(self):
            self.sent = self.getvalue()
            super().close()

    class Process:
        def __init__(self, stdout, returncode=0):
            self.stdin = DirectRuntimeDeploymentTests.RecordingInput()
            self.stdout = io.BytesIO(stdout)
            self.stderr = io.BytesIO(b"")
            self.returncode = returncode
            self.waited = 0
            self.terminated = False
            self.killed = False
        def wait(self, timeout=None):
            self.waited += 1
            return self.returncode
        def terminate(self):
            self.terminated = True
        def kill(self):
            self.killed = True

    def fixture(self, folder, stdout, code=0):
        connection = Path(folder) / "empact-ssh"
        connection.mkdir()
        (connection / "key").write_text("private")
        (connection / "known_hosts").write_text("host key")
        return self.Process(stdout, code)

    def test_two_layers_reuse_one_approved_run(self):
        ci = run(repository={"full_name": client.gate.REPOSITORY})
        artifacts = {
            "runtime": {"id": 7},
            "dependencies": {"id": 8},
        }
        def lookup(path):
            kind = "dependencies" if "empact-dependencies-" in path else "runtime"
            return {"total_count": 1, "artifacts": [artifacts[kind]]}
        def name(sha, attempt, kind="runtime"):
            return "empact-{}-{}-{}".format(kind, sha, attempt)
        def validate(sha, artifact_id, artifact, approved, repository, kind="runtime"):
            self.assertIs(approved, ci)
            self.assertEqual(artifact_id, artifacts[kind]["id"])
            return {"artifactId": artifact_id}
        with patch.object(client.gate, "approved_run", return_value=ci) as approved, patch.object(
            client.gate, "github_json", side_effect=lookup
        ), patch.object(client.runtime, "artifact_name", side_effect=name), patch.object(
            client.runtime, "validate_artifact", side_effect=validate
        ):
            self.assertEqual(client.deployment_artifacts(SHA), ({"artifactId": 7}, {"artifactId": 8}))
        approved.assert_called_once_with(SHA)

    def test_cache_hit_only_app_url_then_complete(self):
        with tempfile.TemporaryDirectory() as folder:
            ready = "EMPACT_ARTIFACT_READY {} 7\n".format(SHA).encode()
            complete = "EMPACT_ARTIFACTS_COMPLETE {}\n".format(SHA).encode()
            process = self.fixture(folder, b"Gate approved\n" + ready + complete + b"Release complete\n")
            calls = []
            def get_url(artifact_id):
                calls.append((artifact_id, process.stdin.getvalue(), output.getvalue()))
                return self.URL
            output = io.StringIO()
            with patch.dict(os.environ, {"RUNNER_TEMP": folder, "DEPLOY_HOST": "example.com"}), patch.object(
                client, "deployment_artifacts", return_value=self.layers()
            ), patch.object(client.subprocess, "Popen", return_value=process) as started, patch.object(
                client, "signed_download_url", side_effect=get_url
            ), patch.object(client.sys, "stdout", output):
                self.assertEqual(client.deploy_runtime(SHA), 0)
            self.assertEqual(calls, [(7, json.dumps({"sha": SHA, "artifactId": 7,
                                                    "dependencyArtifactId": 8, "transport": "https-layers"},
                                                    separators=(",", ":")).encode() + b"\n", "Gate approved\n")])
            self.assertEqual(process.stdin.sent, calls[0][1] + self.URL.encode() + b"\n")
            self.assertNotIn(self.URL, repr(started.call_args[0][0]))
            self.assertNotIn(self.URL, output.getvalue())
            self.assertIn("Gate approved", output.getvalue())
            self.assertIn("Release complete", output.getvalue())
            self.assertNotIn("EMPACT_ARTIFACT_READY", output.getvalue())
            self.assertNotIn("EMPACT_ARTIFACTS_COMPLETE", output.getvalue())

    def test_cache_miss_requests_app_then_dependencies_and_keeps_input_open(self):
        with tempfile.TemporaryDirectory() as folder:
            controls = ("EMPACT_ARTIFACT_READY {} 7\nEMPACT_ARTIFACT_READY {} 8\n"
                        "EMPACT_ARTIFACTS_COMPLETE {}\n").format(SHA, SHA, SHA).encode()
            process = self.fixture(folder, controls + b"Release complete\n")
            calls = []
            def get_url(artifact_id):
                calls.append((artifact_id, process.stdin.getvalue(), process.stdin.closed))
                return self.URL if artifact_id == 7 else self.DEPS_URL
            with patch.dict(os.environ, {"RUNNER_TEMP": folder, "DEPLOY_HOST": "example.com"}), patch.object(
                client, "deployment_artifacts", return_value=self.layers()
            ), patch.object(client.subprocess, "Popen", return_value=process), patch.object(
                client, "signed_download_url", side_effect=get_url
            ), patch.object(client.sys, "stdout", io.StringIO()):
                self.assertEqual(client.deploy_runtime(SHA), 0)
            header = json.dumps({"sha": SHA, "artifactId": 7, "dependencyArtifactId": 8,
                                 "transport": "https-layers"}, separators=(",", ":")).encode() + b"\n"
            self.assertEqual(calls, [(7, header, False), (8, header + self.URL.encode() + b"\n", False)])
            self.assertEqual(process.stdin.sent, header + self.URL.encode() + b"\n" + self.DEPS_URL.encode() + b"\n")
            self.assertTrue(process.stdin.closed)

    def test_early_superseded_exit_and_wrong_ready_never_fetch_url(self):
        with tempfile.TemporaryDirectory() as folder:
            process = self.fixture(folder, b"main advanced\n", code=3)
            with patch.dict(os.environ, {"RUNNER_TEMP": folder, "DEPLOY_HOST": "example.com"}), patch.object(
                client, "deployment_artifacts", return_value=self.layers()
            ), patch.object(client.subprocess, "Popen", return_value=process), patch.object(
                client, "signed_download_url"
            ) as get_url, patch.object(client.sys, "stdout", io.StringIO()):
                self.assertEqual(client.deploy_runtime(SHA), 3)
                get_url.assert_not_called()
            self.assertEqual(process.waited, 1)
        for line in ("EMPACT_ARTIFACT_READY {} 9\n".format(SHA),
                     "EMPACT_ARTIFACT_READY {} 7\n".format(NEWER),
                     "EMPACT_ARTIFACT_READY {} 8\n".format(SHA)):
            with self.subTest(line=line), tempfile.TemporaryDirectory() as folder:
                process = self.fixture(folder, line.encode(), code=1)
                with patch.dict(os.environ, {"RUNNER_TEMP": folder, "DEPLOY_HOST": "example.com"}), patch.object(
                    client, "deployment_artifacts", return_value=self.layers()
                ), patch.object(client.subprocess, "Popen", return_value=process), patch.object(
                    client, "signed_download_url"
                ) as get_url:
                    with self.assertRaisesRegex(ValueError, "unexpected READY"):
                        client.deploy_runtime(SHA)
                    get_url.assert_not_called()
                self.assertEqual(process.waited, 1)

    def test_missing_ready_fails_and_server_exit_code_is_preserved_after_ready(self):
        with tempfile.TemporaryDirectory() as folder:
            process = self.fixture(folder, b"preflight failed\n", code=75)
            with patch.dict(os.environ, {"RUNNER_TEMP": folder, "DEPLOY_HOST": "example.com"}), patch.object(
                client, "deployment_artifacts", return_value=self.layers()
            ), patch.object(client.subprocess, "Popen", return_value=process), patch.object(
                client, "signed_download_url"
            ) as get_url, patch.object(client.sys, "stdout", io.StringIO()):
                with self.assertRaisesRegex(ValueError, "without artifact COMPLETE"):
                    client.deploy_runtime(SHA)
                get_url.assert_not_called()
            self.assertTrue(process.stdin.closed)
            self.assertEqual(process.waited, 2)
        with tempfile.TemporaryDirectory() as folder:
            process = self.fixture(folder, ("EMPACT_ARTIFACT_READY {} 7\n"
                                            "EMPACT_ARTIFACTS_COMPLETE {}\n").format(SHA, SHA).encode(), code=75)
            with patch.dict(os.environ, {"RUNNER_TEMP": folder, "DEPLOY_HOST": "example.com"}), patch.object(
                client, "deployment_artifacts", return_value=self.layers()
            ), patch.object(client.subprocess, "Popen", return_value=process), patch.object(
                client, "signed_download_url", return_value=self.URL
            ):
                self.assertEqual(client.deploy_runtime(SHA), 75)

    def test_invalid_or_incomplete_layer_control_is_rejected(self):
        app = "EMPACT_ARTIFACT_READY {} 7\n".format(SHA)
        deps = "EMPACT_ARTIFACT_READY {} 8\n".format(SHA)
        cases = [
            ("EMPACT_ARTIFACTS_COMPLETE {}\n".format(SHA), "unexpected COMPLETE"),
            (app + app, "unexpected READY"),
            (app + deps + deps, "unexpected READY"),
            (app + "EMPACT_ARTIFACTS_COMPLETE {}\n".format(NEWER), "unexpected COMPLETE"),
            (app + "EMPACT_ARTIFACTS_COMPLETE {}\n".format(SHA) + app, "unexpected READY"),
            (app + "EMPACT_ARTIFACTS_COMPLETE {}\n".format(SHA) +
             "EMPACT_ARTIFACTS_COMPLETE {}\n".format(SHA), "unexpected COMPLETE"),
            (app + "EMPACT_ARTIFACT_UNKNOWN x\n", "unknown artifact control"),
            (app, "without artifact COMPLETE"),
        ]
        for transcript, message in cases:
            with self.subTest(transcript=transcript), tempfile.TemporaryDirectory() as folder:
                process = self.fixture(folder, transcript.encode(), code=0)
                with patch.dict(os.environ, {"RUNNER_TEMP": folder, "DEPLOY_HOST": "example.com"}), patch.object(
                    client, "deployment_artifacts", return_value=self.layers()
                ), patch.object(client.subprocess, "Popen", return_value=process), patch.object(
                    client, "signed_download_url", return_value=self.URL
                ):
                    with self.assertRaisesRegex(ValueError, message):
                        client.deploy_runtime(SHA)
                self.assertTrue(process.stdin.closed)

    def test_early_superseded_broken_pipe_still_returns_three(self):
        class BrokenInput(self.RecordingInput):
            def write(self, value):
                raise BrokenPipeError("server exited")
        with tempfile.TemporaryDirectory() as folder:
            process = self.fixture(folder, b"", code=3)
            process.stdin = BrokenInput()
            with patch.dict(os.environ, {"RUNNER_TEMP": folder, "DEPLOY_HOST": "example.com"}), patch.object(
                client, "deployment_artifacts", return_value=self.layers()
            ), patch.object(client.subprocess, "Popen", return_value=process), patch.object(
                client, "signed_download_url"
            ) as get_url:
                self.assertEqual(client.deploy_runtime(SHA), 3)
                get_url.assert_not_called()
            self.assertTrue(process.stdin.closed)
            self.assertEqual(process.waited, 1)

    def test_url_request_failure_closes_input_and_reaps_ssh_without_secret(self):
        with tempfile.TemporaryDirectory() as folder:
            process = self.fixture(folder, "EMPACT_ARTIFACT_READY {} 7\n".format(SHA).encode(), code=1)
            with patch.dict(os.environ, {"RUNNER_TEMP": folder, "DEPLOY_HOST": "example.com"}), patch.object(
                client, "deployment_artifacts", return_value=self.layers()
            ), patch.object(client.subprocess, "Popen", return_value=process), patch.object(
                client, "signed_download_url", side_effect=ValueError("safe URL failure")
            ):
                with self.assertRaisesRegex(ValueError, "safe URL failure") as error:
                    client.deploy_runtime(SHA)
            self.assertNotIn(self.URL, str(error.exception))
            self.assertTrue(process.stdin.closed)
            self.assertEqual(process.waited, 1)

    def test_signed_url_uses_only_github_api_token_and_never_follows_redirect(self):
        headers = {"Location": self.URL}
        error = urllib.error.HTTPError("https://api.github.com/artifact", 302, "redirect", headers, io.BytesIO(b""))
        class Opener:
            def open(self, request, timeout):
                self_request = request
                self.assert_request = self_request
                raise error
        opener = Opener()
        with patch.dict(os.environ, {"GITHUB_TOKEN": "runner-only-secret"}), patch.object(
            client.urllib.request, "build_opener", return_value=opener
        ), patch.object(client.runtime, "validate_download_url", return_value=self.URL, create=True) as validate:
            self.assertEqual(client.signed_download_url(7), self.URL)
        request = opener.assert_request
        self.assertEqual(request.full_url,
                         "https://api.github.com/repos/{}/actions/artifacts/7/zip".format(client.gate.REPOSITORY))
        self.assertEqual(request.get_header("Authorization"), "Bearer runner-only-secret")
        validate.assert_called_once_with(self.URL)
        self.assertNotIn(self.URL, repr(request.header_items()))
        with patch.dict(os.environ, {"GITHUB_TOKEN": "runner-only-secret"}), patch.object(
            client.urllib.request, "build_opener", return_value=opener
        ), patch.object(client.runtime, "validate_download_url", side_effect=ValueError(self.URL), create=True):
            error = urllib.error.HTTPError("https://api.github.com/artifact", 302, "redirect", headers, io.BytesIO(b""))
            with self.assertRaisesRegex(ValueError, "failed validation") as failure:
                client.signed_download_url(7)
            self.assertNotIn(self.URL, str(failure.exception))

    def test_workflow_uses_direct_client_after_deployment_record(self):
        workflow = (ROOT / ".github/workflows/deploy.yml").read_text()
        self.assertNotIn("Download the exact CI-built runtime", workflow)
        self.assertNotIn("cat \"$RUNNER_TEMP/empact-runtime.zip\"", workflow)
        self.assertIn('python3 deploy/actions-client.py deploy-runtime "$TARGET_SHA"', workflow)
        self.assertLess(workflow.index("Record exact deployment revision"),
                        workflow.index("deploy-runtime \"$TARGET_SHA\""))
        self.assertIn("if [ \"$result\" -eq 3 ]", workflow)
        self.assertIn("Publish deployment result", workflow)


class PublicVerificationTests(unittest.TestCase):
    def response(self, path):
        if path == "/release.json":
            return json.dumps({"codeRevision": SHA, "mode": "production", "version": "content-1"})
        return "<html>" + client.PAGES[path] + "</html>"

    def test_checks_version_before_and_after_key_pages(self):
        with patch.object(client, "fetch", side_effect=self.response) as fetch:
            self.assertEqual(client.verify(SHA)["version"], "content-1")
            self.assertEqual(fetch.call_args_list[0].args, ("/release.json",))
            self.assertEqual(fetch.call_args_list[-1].args, ("/release.json",))
            self.assertEqual(fetch.call_count, len(client.PAGES) + 2)

    def test_http_success_with_old_revision_fails(self):
        with patch.object(client, "fetch", return_value=self.response("/release.json")):
            with self.assertRaisesRegex(ValueError, "revision"):
                client.verify(NEWER)

    def test_http_success_without_page_content_fails(self):
        def response(path):
            return self.response(path) if path == "/release.json" else "<html>Maintenance</html>"
        with patch.object(client, "fetch", side_effect=response):
            with self.assertRaisesRegex(ValueError, "content"):
                client.verify(SHA)

    def test_revision_changes_during_verification_fails(self):
        responses = [self.response("/release.json")]
        responses.extend(self.response(path) for path in client.PAGES)
        responses.append(json.dumps({"codeRevision": NEWER, "mode": "production"}))
        with patch.object(client, "fetch", side_effect=responses):
            with self.assertRaisesRegex(ValueError, "revision"):
                client.verify(SHA)


class RestrictedCommandTests(unittest.TestCase):
    def test_upload_budget_and_progress_are_bounded_and_visible(self):
        self.assertEqual(command.UPLOAD_BUDGET_SECONDS, 60 * 60)
        content = b"123456789"
        metadata = {"size": len(content), "expectedDigest": "sha256:" + hashlib.sha256(content).hexdigest(), "sha": SHA}
        class ChunkStream(io.BytesIO):
            def read(self, size=-1):
                return super().read(min(size, 3))
        with tempfile.TemporaryDirectory() as folder:
            staging = Path(folder)
            real_stat = os.stat
            def owned(path, *args, **kwargs):
                result = real_stat(path, *args, **kwargs)
                if str(path) == str(staging):
                    fields = list(result)
                    fields[4] = 0
                    return os.stat_result(fields)
                return result
            diagnostics = io.StringIO()
            with patch.object(command.os, "stat", side_effect=owned), patch.object(
                command, "PROGRESS_INTERVAL_BYTES", 4
            ), redirect_stderr(diagnostics):
                command.stage_artifact(SHA, metadata, ChunkStream(content), staging)
            message = diagnostics.getvalue()
            self.assertIn("0/9 bytes", message)
            self.assertIn("6/9 bytes", message)
            self.assertIn("9/9 bytes", message)
            self.assertIn("awaiting input EOF", message)
            self.assertEqual((staging / ("artifact-" + SHA + ".zip")).read_bytes(), content)

    def test_timeout_reports_exact_partial_bytes_and_cleans_only_own_temp(self):
        content = b"123456789"
        metadata = {"size": len(content), "expectedDigest": "sha256:" + hashlib.sha256(content).hexdigest(), "sha": SHA}
        class InterruptedStream:
            def __init__(self):
                self.calls = 0
            def read(self, size):
                self.calls += 1
                if self.calls == 1:
                    return content[:4]
                raise TimeoutError("artifact upload timed out")
        with tempfile.TemporaryDirectory() as folder:
            staging = Path(folder)
            unrelated = staging / "current-service-marker"
            unrelated.write_text("running")
            real_stat = os.stat
            def owned(path, *args, **kwargs):
                result = real_stat(path, *args, **kwargs)
                if str(path) == str(staging):
                    fields = list(result)
                    fields[4] = 0
                    return os.stat_result(fields)
                return result
            diagnostics = io.StringIO()
            with patch.object(command.os, "stat", side_effect=owned), patch.object(
                command, "deploy"
            ) as deployment, redirect_stderr(diagnostics):
                with self.assertRaises(TimeoutError):
                    command.stage_artifact(SHA, metadata, InterruptedStream(), staging)
                deployment.assert_not_called()
            self.assertIn("failed after 4/9 bytes", diagnostics.getvalue())
            self.assertEqual(unrelated.read_text(), "running")
            self.assertEqual(list(staging.iterdir()), [unrelated])

    def test_broken_stderr_preserves_upload_error_and_partial_cleanup(self):
        metadata = {"size": 9, "expectedDigest": "sha256:" + "0" * 64, "sha": SHA}
        class InterruptedStream:
            def __init__(self):
                self.calls = 0
            def read(self, size):
                self.calls += 1
                if self.calls == 1:
                    return b"1234"
                raise TimeoutError("original upload timeout")
        class BrokenStderr:
            def write(self, value):
                raise BrokenPipeError("SSH disconnected")
            def flush(self):
                raise BrokenPipeError("SSH disconnected")
        with tempfile.TemporaryDirectory() as folder:
            staging = Path(folder)
            unrelated = staging / "current-service-marker"
            unrelated.write_text("running")
            real_stat = os.stat
            def owned(path, *args, **kwargs):
                result = real_stat(path, *args, **kwargs)
                if str(path) == str(staging):
                    fields = list(result)
                    fields[4] = 0
                    return os.stat_result(fields)
                return result
            with patch.object(command.os, "stat", side_effect=owned), patch.object(
                command.sys, "stderr", BrokenStderr()
            ):
                with self.assertRaisesRegex(TimeoutError, "original upload timeout"):
                    command.stage_artifact(SHA, metadata, InterruptedStream(), staging)
            self.assertEqual(unrelated.read_text(), "running")
            self.assertEqual(list(staging.iterdir()), [unrelated])

    def test_protocol_rejects_commands_and_duplicate_fields(self):
        self.assertEqual(command.read_request(io.BytesIO(json.dumps({"sha": SHA, "artifactId": 7}).encode() + b"\n")),
                         {"sha": SHA, "artifactId": 7})
        for value in (b"main\n", b'{"sha":"' + SHA.encode() + b'","artifactId":7,"path":"/tmp"}\n',
                      b'{"sha":"' + SHA.encode() + b'","artifactId":7,"artifactId":8}\n',
                      b'{"sha":"' + SHA.encode() + b'","artifactId":true}\n'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                command.read_request(io.BytesIO(value))

    def test_short_or_corrupt_upload_leaves_no_staging_files_or_service_change(self):
        content = b"test-zip-payload"
        metadata = {"size": len(content), "expectedDigest": "sha256:" + "0" * 64, "sha": SHA}
        with tempfile.TemporaryDirectory() as folder:
            staging = Path(folder)
            real_stat = os.stat
            def owned(path, *args, **kwargs):
                result = real_stat(path, *args, **kwargs)
                if str(path) == str(staging):
                    fields = list(result)
                    fields[4] = 0
                    return os.stat_result(fields)
                return result
            with patch.object(command.os, "stat", side_effect=owned), patch.object(command, "deploy") as deployment:
                with self.assertRaisesRegex(ValueError, "short"):
                    command.stage_artifact(SHA, metadata, io.BytesIO(content[:3]), staging)
                self.assertEqual(list(staging.iterdir()), [])
                with self.assertRaisesRegex(ValueError, "digest"):
                    command.stage_artifact(SHA, metadata, io.BytesIO(content), staging)
                self.assertEqual(list(staging.iterdir()), [])
                deployment.assert_not_called()

    def test_receiver_checks_gate_prunes_and_capacity_before_reading_zip(self):
        events = []
        metadata = {"size": 12, "expectedDigest": "sha256:" + "f" * 64}
        class Lock:
            def fileno(self):
                return 9
        def prune(*args, **kwargs):
            events.append("prune")
            self.assertEqual(args[0][1:7], [SHA, "--phase", "prepare", "--discard-candidate", "--apply", "--lock-fd"])
        def capacity(*args):
            events.append("capacity")
            self.assertEqual(args[1], 12)
        def stage(*args):
            events.append("stage")
        with patch.object(command, "approved_metadata", return_value=metadata) as approved, patch.object(
            command.subprocess, "run", side_effect=prune
        ), patch.object(command, "check_capacity", side_effect=capacity), patch.object(
            command, "stage_artifact", side_effect=stage
        ):
            command.prepare_artifact({"sha": SHA, "artifactId": 7}, io.BytesIO(), Lock())
        approved.assert_called_once_with(SHA, 7)
        self.assertEqual(events, ["prune", "capacity", "stage"])

    def test_only_full_sha_line_accepted(self):
        self.assertEqual(command.read_sha(io.StringIO(SHA + "\n")), SHA)
        for value in (SHA, "main\n", SHA + ";id\n", SHA.upper() + "\n", "../" + SHA + "\n"):
            with self.assertRaises(ValueError):
                command.read_sha(io.StringIO(value))

    def result(self, status, result="success", start_returncode=0):
        with patch.object(command.subprocess, "run", return_value=subprocess.CompletedProcess([], start_returncode)) as calls, patch.object(
            command.subprocess, "check_output", side_effect=[
                "ActiveState=inactive\nSubState=dead\n",
                "Result={}\nExecMainStatus={}\n".format(result, status),
            ]
        ):
            code = command.deploy(SHA)
            self.assertEqual(calls.call_args_list[0].args[0], ["/usr/bin/systemctl", "start", "empact-release@" + SHA + ".service"])
            return code

    def test_completed_release_and_superseded_release_are_distinct(self):
        self.assertEqual(self.result(0), 0)
        self.assertEqual(self.result(3), 3)

    def test_lock_busy_timeout_failed_start_never_report_success(self):
        self.assertEqual(self.result(75, "exit-code", 1), 1)
        self.assertEqual(self.result(0, "timeout", 1), 1)
        self.assertEqual(self.result(0, "success", 1), 1)

    def test_invalid_sha_never_reaches_systemctl(self):
        with patch.object(command.subprocess, "run") as systemctl:
            with self.assertRaises(ValueError):
                command.deploy(SHA + ";reboot")
            systemctl.assert_not_called()

    def test_disconnected_running_release_is_not_restarted_or_stopped(self):
        with patch.object(command.subprocess, "check_output", return_value="ActiveState=activating\nSubState=start\n"), patch.object(
            command.subprocess, "run"
        ) as systemctl:
            with self.assertRaisesRegex(ValueError, "still deploying"):
                command.deploy(SHA)
            systemctl.assert_not_called()

    def test_completed_disconnected_unit_can_be_retried(self):
        with patch.object(command.subprocess, "check_output", side_effect=[
            "ActiveState=active\nSubState=exited\n", "Result=success\nExecMainStatus=0\n",
        ]), patch.object(command.subprocess, "run", return_value=subprocess.CompletedProcess([], 0)) as calls:
            self.assertEqual(command.deploy(SHA), 0)
            self.assertEqual(calls.call_args_list[0].args[0][1], "stop")
            self.assertEqual(calls.call_args_list[1].args[0][1], "start")


if __name__ == "__main__":
    unittest.main()
