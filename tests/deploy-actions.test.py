#!/usr/bin/env python3
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import unittest
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
