#!/usr/bin/env python3
"""Hermetic range-server checks for the trusted HTTPS artifact receiver."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import tempfile
import time
import unittest
from contextlib import redirect_stderr, redirect_stdout
from unittest import mock

ROOT = Path(__file__).parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "deploy" / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


command = load("actions-command")
runtime = load("runtime-artifact")
SHA = "a" * 40
URL = "https://productionresultssa4.blob.core.windows.net/results/archive?sig=private-token"


class Response:
    def __init__(self, body, start, end, total, fault=None):
        self.body = body
        self.position = 0
        self.status = 302 if fault == "redirect" else 403 if fault == "403" else 206
        self.headers = {
            "Content-Range": "bytes {}-{}/{}".format(start, end, total),
            "Content-Length": str(end - start + 1),
        }
        if fault == "range":
            self.headers["Content-Range"] = "bytes 0-0/1"
        if fault == "length":
            self.headers["Content-Length"] = "1"
        if fault == "redirect":
            self.headers["Location"] = URL

    def getheader(self, key):
        return self.headers.get(key)

    def read1(self, amount):
        result = self.body[self.position:self.position + amount]
        self.position += len(result)
        return result


class Connection:
    def __init__(self, content, fault=None, delay=False):
        self.content = content
        self.fault = fault
        self.delay = delay
        self.start = None
        self.end = None
        self.closed = False

    def request(self, method, target, headers):
        if method != "GET" or target != "/results/archive?sig=private-token":
            raise AssertionError("unexpected range request")
        match = re.fullmatch(r"bytes=([0-9]+)-([0-9]+)", headers["Range"])
        if not match:
            raise AssertionError("missing range")
        self.start, self.end = map(int, match.groups())
        if headers["Accept-Encoding"] != "identity":
            raise AssertionError("unexpected encoding")

    def getresponse(self):
        if self.fault == "exception" and self.start == 0:
            raise RuntimeError("private-token must not be logged")
        if self.delay:
            time.sleep(0.001 * (8 - self.start % 8))
        body = self.content[self.start:self.end + 1]
        if self.fault == "short" and self.start == 0:
            body = body[:-1]
        if self.fault == "over" and self.start == 0:
            body += b"extra"
        return Response(body, self.start, self.end, len(self.content),
                        self.fault if self.start == 0 or self.fault == "403" else None)

    def close(self):
        self.closed = True


class DownloadTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.staging = Path(self.temporary.name) / "staging"
        self.staging.mkdir()
        self.content = bytes(range(256)) * 129 + b"tail"
        self.metadata = {"sha": SHA, "artifactId": 7, "size": len(self.content),
                         "expectedDigest": "sha256:" + hashlib.sha256(self.content).hexdigest()}

    def staged(self, fault=None, content=None):
        content = self.content if content is None else content
        real_stat = os.stat

        def owned_stat(path, *args, **kwargs):
            result = real_stat(path, *args, **kwargs)
            if str(path) == str(self.staging):
                values = list(result)
                values[4] = 0  # The ECS staging directory is root-owned.
                return os.stat_result(values)
            return result

        connections = []
        self.connections = connections

        def connect(host, port, timeout, context):
            self.assertEqual(host, "productionresultssa4.blob.core.windows.net")
            self.assertEqual(port, 443)
            self.assertLessEqual(timeout, 15)
            connection = Connection(content, fault=fault, delay=True)
            connections.append(connection)
            return connection

        with mock.patch.object(command.os, "stat", side_effect=owned_stat), mock.patch.object(
            command.http.client, "HTTPSConnection", side_effect=connect
        ), mock.patch.object(command.ssl, "create_default_context", return_value=object()):
            result = command.stage_https_artifact(SHA, self.metadata, URL, self.staging)
        self.assertTrue(all(connection.closed for connection in connections))
        return result

    def assert_clean(self):
        self.assertEqual(list(self.staging.iterdir()), [])

    def test_request_accepts_legacy_and_exact_https_transport(self):
        original = {"sha": SHA, "artifactId": 7}
        extended = {"sha": SHA, "artifactId": 7, "transport": "https"}
        for value in (original, extended):
            self.assertEqual(command.read_request(io.BytesIO(json.dumps(value).encode() + b"\n")), value)
        for value in (dict(extended, transport="http"), dict(extended, extra=True)):
            with self.assertRaises(ValueError):
                command.read_request(io.BytesIO(json.dumps(value).encode() + b"\n"))

    def test_download_url_validation_and_line_protocol(self):
        self.assertEqual(runtime.validate_download_url(URL), URL)
        self.assertEqual(command.read_download_url(io.BytesIO(URL.encode() + b"\n")), URL)
        invalid = [
            URL.replace("https:", "http:"),
            URL.replace("productionresultssa4", "example"),
            URL.replace(".blob.core.windows.net", ".blob.core.windows.net.evil"),
            URL.replace("?sig=private-token", ""),
            URL + "#fragment",
            URL.replace("https://", "https://user:pass@"),
            URL.replace(".net/", ".net:444/"),
            URL + "\r", URL + "\x00", URL + "é", URL + "x" * 8192,
        ]
        for value in invalid:
            with self.subTest(value=value[:80]), self.assertRaises(ValueError):
                runtime.validate_download_url(value)
        for value in (URL.encode(), URL.encode() + b"\nextra", b"\xff\n"):
            with self.assertRaises(ValueError):
                command.read_download_url(io.BytesIO(value))

    def test_out_of_order_ranges_assemble_exact_verified_artifact(self):
        result = self.staged()
        self.assertEqual(result.read_bytes(), self.content)
        self.assertEqual(json.loads((self.staging / ("artifact-" + SHA + ".json")).read_text()), self.metadata)
        self.assertEqual(result.stat().st_size, len(self.content))

    def test_bad_ranges_short_overlong_redirect_and_worker_exception_clean_tmp(self):
        for fault in ("range", "length", "short", "over", "redirect", "exception"):
            with self.subTest(fault=fault):
                self.staging = Path(self.temporary.name) / ("staging-" + fault)
                self.staging.mkdir()
                captured = io.StringIO()
                with redirect_stderr(captured), self.assertRaises(ValueError):
                    self.staged(fault=fault)
                self.assertNotIn("private-token", captured.getvalue())
                if fault in ("short", "exception"):
                    self.assertEqual({path.name for path in self.staging.iterdir()},
                                     {command.RESUME_DATA, command.RESUME_STATE})
                else:
                    self.assert_clean()
                self.assertTrue(all(connection.closed for connection in self.connections))

    def test_digest_mismatch_cleans_tmp(self):
        self.metadata["expectedDigest"] = "sha256:" + "0" * 64
        with self.assertRaisesRegex(ValueError, "digest mismatch"):
            self.staged()
        self.assert_clean()

    def test_short_read_resumes_only_missing_ranges_with_new_url(self):
        with self.assertRaises(ValueError):
            self.staged(fault="short")
        state = json.loads((self.staging / command.RESUME_STATE).read_text())
        confirmed = sum(state["offsets"])
        self.assertGreater(confirmed, 0)
        self.assertLess(confirmed, len(self.content))
        result = self.staged()
        requested = sum(connection.end - connection.start + 1 for connection in self.connections)
        self.assertEqual(requested, len(self.content) - confirmed)
        self.assertEqual(result.read_bytes(), self.content)
        self.assertEqual({path.name for path in self.staging.iterdir()},
                         {"artifact-" + SHA + ".zip", "artifact-" + SHA + ".json"})

    def test_expired_url_preserves_prior_verified_ranges(self):
        with self.assertRaises(ValueError):
            self.staged(fault="short")
        checkpoint = json.loads((self.staging / command.RESUME_STATE).read_text())
        self.assertGreater(sum(checkpoint["offsets"]), 0)
        with self.assertRaisesRegex(ValueError, "HTTP status 403"):
            self.staged(fault="403")
        self.assertEqual(json.loads((self.staging / command.RESUME_STATE).read_text()), checkpoint)
        self.assertEqual(self.staged().read_bytes(), self.content)

    def test_corrupt_checkpoint_discards_only_fixed_cache_then_redownloads(self):
        with self.assertRaises(ValueError):
            self.staged(fault="short")
        data = self.staging / command.RESUME_DATA
        with data.open("r+b") as output:
            output.write(b"corruption")
        unrelated = self.staging / "operator-note"
        unrelated.write_text("preserve")
        result = self.staged()
        requested = sum(connection.end - connection.start + 1 for connection in self.connections)
        self.assertEqual(requested, len(self.content))
        self.assertEqual(result.read_bytes(), self.content)
        self.assertEqual(unrelated.read_text(), "preserve")

    def test_cache_link_is_rejected_without_touching_target(self):
        target = Path(self.temporary.name) / "important"
        target.write_text("keep")
        (self.staging / command.RESUME_DATA).symlink_to(target)
        with self.assertRaisesRegex(ValueError, "untrusted artifact resume cache"):
            self.staged()
        self.assertEqual(target.read_text(), "keep")
        self.assertTrue((self.staging / command.RESUME_DATA).is_symlink())

    def test_new_artifact_identity_replaces_the_single_resume_cache(self):
        with self.assertRaises(ValueError):
            self.staged(fault="short")
        self.metadata["artifactId"] = 8
        result = self.staged()
        requested = sum(connection.end - connection.start + 1 for connection in self.connections)
        self.assertEqual(requested, len(self.content))
        self.assertEqual(result.read_bytes(), self.content)
        self.assertFalse((self.staging / command.RESUME_DATA).exists())

    def test_bad_state_is_reset_without_deleting_unrelated_file(self):
        with self.assertRaises(ValueError):
            self.staged(fault="short")
        (self.staging / command.RESUME_STATE).write_text("{broken")
        note = self.staging / "operator-note"
        note.write_text("keep")
        result = self.staged()
        requested = sum(connection.end - connection.start + 1 for connection in self.connections)
        self.assertEqual(requested, len(self.content))
        self.assertEqual(result.read_bytes(), self.content)
        self.assertEqual(note.read_text(), "keep")

    def test_aggregate_progress_is_reported_at_each_interval(self):
        captured = io.StringIO()
        with mock.patch.object(command, "PROGRESS_INTERVAL_BYTES", 10000), redirect_stderr(captured):
            self.staged()
        self.assertGreaterEqual(captured.getvalue().count("Artifact received:"), 4)

    def test_handshake_after_gate_and_capacity_then_url_line(self):
        class Lock:
            def fileno(self):
                return 9
        output = io.StringIO()
        events = []
        with mock.patch.object(command, "approved_metadata", return_value=self.metadata) as approved, mock.patch.object(
            command.subprocess, "run", side_effect=lambda *a, **k: events.append("prune")
        ), mock.patch.object(command, "resume_remaining", return_value=self.metadata["size"]), mock.patch.object(
            command, "check_capacity", side_effect=lambda *a: events.append("capacity")
        ), mock.patch.object(
            command, "stage_https_artifact", side_effect=lambda *a: events.append("download")
        ), redirect_stdout(output):
            command.prepare_artifact({"sha": SHA, "artifactId": 7, "transport": "https"},
                                     io.BytesIO(URL.encode() + b"\n"), Lock())
        approved.assert_called_once_with(SHA, 7)
        self.assertEqual(events, ["prune", "capacity", "download"])
        self.assertEqual(output.getvalue(), "EMPACT_ARTIFACT_READY {} 7\n".format(SHA))


if __name__ == "__main__":
    unittest.main()
