#!/usr/bin/env python3
import importlib.util
import hashlib
import os
import tempfile
import threading
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch


MODULE_PATH = Path(__file__).parents[1] / "deploy" / "auto-update.py"
spec = importlib.util.spec_from_file_location("auto_update", MODULE_PATH)
auto_update = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(auto_update)
lock_spec = importlib.util.spec_from_file_location(
    "publication_lock", MODULE_PATH.with_name("publication-lock.py")
)
publication_lock = importlib.util.module_from_spec(lock_spec)
lock_spec.loader.exec_module(publication_lock)

SHA = "a" * 40
OTHER = "b" * 40


def run(sha=SHA, **extra):
    run = {
        "id": 123,
        "head_sha": sha,
        "event": "push",
        "head_branch": "main",
        "status": "completed",
        "conclusion": "success",
        "run_attempt": 1,
    }
    run.update(extra)
    return run


class AutoDeployTests(unittest.TestCase):
    def test_disk_precheck_blocks_low_space_inodes_and_unreadable_metrics(self):
        source = MODULE_PATH.with_name("deploy.sh").read_text()
        function = source.split("check_disk_space() {", 1)[1].split("\n}\n", 1)[0]
        for free_kb, free_inodes, allowed in [
            (3145728, 150000, True), (3145727, 150000, False),
            (3145728, 149999, False), (0, 200000, False), ("unknown", 200000, False),
        ]:
            with self.subTest(free_kb=free_kb, free_inodes=free_inodes):
                script = (
                    'set -euo pipefail\nROOT=/unused\nMIN_FREE_KB=3145728\nMIN_FREE_INODES=150000\n'
                    'df() { if [[ "$1" == -Pk ]]; then free=$FREE_KB; else free=$FREE_INODES; fi; '
                    'printf "Filesystem Size Used Available\\nfixture 9999999 0 %s\\n" "$free"; }\n'
                    'check_disk_space() {' + function + '\n}\ncheck_disk_space\n'
                )
                result = subprocess.run(["bash", "-c", script],
                    env=dict(os.environ, FREE_KB=str(free_kb), FREE_INODES=str(free_inodes)),
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
                self.assertEqual(result.returncode == 0, allowed, result.stderr)

    def test_schema_approval_only_allows_the_exact_reviewed_transition(self):
        source = MODULE_PATH.with_name("deploy.sh").read_text()
        function = source.split("schema_change_allowed() {", 1)[1].split("\n}\n", 1)[0]
        previous = "collections=old\npayload=3.0\nmigration=old"
        reviewed = "collections=filter-only\npayload=3.0\nmigration=old"
        digest = lambda value: hashlib.sha256((value + "\n").encode()).hexdigest()
        approval = digest(previous) + ":" + digest(reviewed)
        for before, after, approved, allowed in [
            (previous, previous, "", True),
            (previous, reviewed, "", False),
            (previous, reviewed, "true", False),
            (previous, reviewed, approval, True),
            (reviewed, previous, approval, False),
            (previous + "-different", reviewed, approval, False),
            (previous, reviewed + "\nnew-column", approval, False),
            (previous, reviewed.replace("payload=3.0", "payload=4.0"), approval, False),
            (previous, reviewed.replace("migration=old", "migration=new"), approval, False),
        ]:
            with self.subTest(before=before, after=after, approved=approved):
                script = "set -euo pipefail\nschema_change_allowed() {" + function + '\n}\nschema_change_allowed "$1" "$2"\n'
                result = subprocess.run(
                    ["bash", "-c", script, "schema-check", before, after],
                    env=dict(os.environ, EMPACT_APPROVED_SCHEMA_CHANGE=approved),
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True,
                )
                self.assertEqual(result.returncode == 0, allowed, result.stderr)

    def test_rollback_restores_public_service_running_state(self):
        source = MODULE_PATH.with_name("deploy.sh").read_text()
        restore_function = source.split("restore_services() {", 1)[1].split("\n}\n", 1)[0]
        for was_public, expected in [("false", "stop"), ("true", "restart")]:
            script = (
                "set -eu\n"
                'systemctl() { printf "%s\\n" "$*"; }\n'
                "was_public=" + was_public + "\n"
                "was_cms=false; was_expiry=false; was_timer=false\n"
                "restore_services() {" + restore_function + "\n}\nrestore_services\n"
            )
            result = subprocess.run(
                ["bash", "-c", script], stdout=subprocess.PIPE,
                stderr=subprocess.PIPE, universal_newlines=True, check=True,
            )
            self.assertEqual(result.stdout.strip(), expected + " empact-public.service")

    def test_maintenance_waits_for_publication_and_releases_its_own_lock(self):
        with tempfile.TemporaryDirectory() as directory:
            lock = Path(directory) / "publish.lock"
            lock.write_text('{"pid":123}')
            publisher_finishes = threading.Timer(0.1, lock.unlink)
            publisher_finishes.start()
            try:
                publication_lock.acquire(directory, "maintenance", timeout=2)
            finally:
                publisher_finishes.join()
            self.assertIn('"maintenanceToken": "maintenance"', lock.read_text())
            publication_lock.release(directory, "maintenance")
            # A subsequent normal CMS publication can acquire the same lock.
            with lock.open("x") as handle:
                handle.write('{"pid":456}')

    def test_maintenance_never_removes_another_publications_lock(self):
        with tempfile.TemporaryDirectory() as directory:
            lock = Path(directory) / "publish.lock"
            lock.write_text('{"pid":123}')
            with self.assertRaises(RuntimeError):
                publication_lock.acquire(directory, "maintenance", timeout=0)
            with self.assertRaises(RuntimeError):
                publication_lock.release(directory, "maintenance")
            self.assertEqual(lock.read_text(), '{"pid":123}')

    def test_pending_failed_wrong_event_or_sha_is_rejected(self):
        for candidate in [
            run(status="in_progress", conclusion=None),
            run(conclusion="failure"),
            run(event="pull_request"),
            run(head_sha=OTHER),
        ]:
            with self.subTest(candidate=candidate), patch.object(
                auto_update, "github_json", return_value={"workflow_runs": [candidate]}
            ):
                with self.assertRaises(auto_update.GateError):
                    auto_update.approved_run(SHA)

    def test_stale_main_is_rejected_before_installer(self):
        with patch.object(auto_update, "latest_main_sha", return_value=OTHER), patch.object(
            auto_update, "approved_run", return_value=run()
        ), patch.object(auto_update.subprocess, "run") as installer:
            with self.assertRaises(auto_update.GateError):
                auto_update.deploy(SHA, Path("/usr/local/lib/empact/deploy.sh"))
            installer.assert_not_called()

    def test_newer_failed_run_blocks_older_successful_attempt(self):
        older = run(id=100, run_attempt=2)
        newer = run(id=101, run_attempt=1, conclusion="failure")
        with patch.object(
            auto_update, "github_json", return_value={"workflow_runs": [older, newer]}
        ):
            with self.assertRaises(auto_update.GateError):
                auto_update.approved_run(SHA)

    def test_current_revision_still_checks_ci_before_shortcut(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / SHA
            target.mkdir()
            current = root / "current"
            current.symlink_to(target, target_is_directory=True)
            with patch.object(auto_update, "latest_main_sha", return_value=SHA), patch.object(
                auto_update, "approved_run"
            ) as gate, patch.object(
                auto_update.argparse.ArgumentParser,
                "parse_args",
                return_value=type(
                    "Args", (), {"check_only": False, "expected_sha": None, "current": str(current), "installer": "/installer"}
                )(),
            ):
                self.assertEqual(auto_update.current_revision(current), SHA)
                self.assertEqual(auto_update.main(), 0)
            gate.assert_called_once_with(SHA)

    def test_start_then_finish_accepts_normal_main_advance(self):
        target = OTHER
        current = SHA
        with patch.object(auto_update, "latest_main_sha", side_effect=[target, "c" * 40]), patch.object(
            auto_update, "approved_run", return_value=run(target)
        ), patch.object(auto_update, "compare_status", side_effect=["ahead", "ahead", "ahead"]):
            auto_update.start_gate(target, current)
            auto_update.finish_gate(target, current)

    def test_initial_release_without_code_pointer_can_finish(self):
        with patch.object(auto_update, "latest_main_sha", return_value=SHA), patch.object(
            auto_update, "approved_run", return_value=run(SHA)
        ), patch.object(auto_update, "compare_status", return_value="identical") as compare:
            auto_update.start_gate(SHA, None)
            auto_update.finish_gate(SHA, None)
            compare.assert_called_once_with(SHA, SHA)

    def test_stale_finish_is_a_failure_after_build_started(self):
        args = type(
            "Args", (), {"check_only": True, "expected_sha": None, "pinned_sha": OTHER,
                           "current": "/missing", "installer": "/installer"}
        )()
        with patch.object(auto_update.argparse.ArgumentParser, "parse_args", return_value=args), patch.object(
            auto_update, "latest_main_sha", return_value="c" * 40
        ), patch.object(auto_update, "approved_run", return_value=run(OTHER)), patch.object(
            auto_update, "compare_status", return_value="behind"
        ):
            self.assertEqual(auto_update.main(), 1)

    def test_stale_expected_start_is_neutral_and_never_installs(self):
        args = type(
            "Args", (), {"check_only": True, "expected_sha": SHA, "pinned_sha": None,
                           "current": "/missing", "installer": "/installer"}
        )()
        with patch.object(auto_update.argparse.ArgumentParser, "parse_args", return_value=args), patch.object(
            auto_update, "latest_main_sha", return_value=OTHER
        ), patch.object(auto_update, "deploy") as installer:
            self.assertEqual(auto_update.main(), 3)
            installer.assert_not_called()

    def test_failed_rerun_after_start_blocks_finish(self):
        with patch.object(auto_update, "latest_main_sha", side_effect=[OTHER, OTHER]), patch.object(
            auto_update, "approved_run", side_effect=[run(OTHER), auto_update.GateError("failed rerun")]
        ), patch.object(auto_update, "compare_status", return_value="ahead"):
            auto_update.start_gate(OTHER, SHA)
            with self.assertRaises(auto_update.GateError):
                auto_update.finish_gate(OTHER, SHA)

    def test_installed_newer_revision_is_rejected_by_finish_gate(self):
        with patch.object(auto_update, "latest_main_sha", return_value=OTHER), patch.object(
            auto_update, "approved_run", return_value=run(SHA)
        ), patch.object(auto_update, "compare_status", side_effect=["identical", "behind"]):
            with self.assertRaises(auto_update.GateError):
                auto_update.finish_gate(SHA, OTHER)

    def test_invalid_sha_never_reaches_github_compare(self):
        with patch.object(auto_update, "github_json") as api:
            with self.assertRaises(auto_update.GateError):
                auto_update.compare_status("../etc/passwd", SHA)
            api.assert_not_called()

    def test_cli_gate_sha_validation_and_mode_requirements(self):
        cases = [
            (type("Args", (), {"check_only": True, "expected_sha": "bad", "pinned_sha": None,
                                "current": "/missing", "installer": "/installer"})(), 1),
            (type("Args", (), {"check_only": True, "expected_sha": None, "pinned_sha": "bad",
                                "current": "/missing", "installer": "/installer"})(), 1),
            (type("Args", (), {"check_only": False, "expected_sha": SHA, "pinned_sha": None,
                                "current": "/missing", "installer": "/installer"})(), 1),
            (type("Args", (), {"check_only": True, "expected_sha": SHA, "pinned_sha": OTHER,
                                "current": "/missing", "installer": "/installer"})(), 1),
        ]
        for args, expected in cases:
            with self.subTest(args=args), patch.object(
                auto_update.argparse.ArgumentParser, "parse_args", return_value=args
            ), patch.object(auto_update, "latest_main_sha") as api:
                self.assertEqual(auto_update.main(), expected)
                api.assert_not_called()

    def test_successful_check_only_does_not_invoke_installer(self):
        with patch.object(auto_update, "latest_main_sha", return_value=SHA), patch.object(
            auto_update, "approved_run", return_value=run()
        ), patch.object(auto_update, "deploy") as installer, patch.object(
            auto_update.argparse.ArgumentParser, "parse_args", return_value=type(
                "Args", (), {"check_only": True, "expected_sha": None, "current": "/missing", "installer": "/installer"}
            )()
        ):
            self.assertEqual(auto_update.main(), 0)
            installer.assert_not_called()

    def test_successful_deploy_invokes_trusted_installer(self):
        with patch.object(auto_update, "latest_main_sha", return_value=SHA), patch.object(
            auto_update, "approved_run", return_value=run()
        ), patch.object(auto_update.subprocess, "run"
        ) as installer:
            auto_update.deploy(SHA, Path("/usr/local/lib/empact/deploy.sh"))
            installer.assert_called_once_with(
                ["/usr/local/lib/empact/deploy.sh", SHA], check=True
            )

    def test_deploy_lock_contention_is_a_failure_status(self):
        source = MODULE_PATH.with_name("deploy.sh").read_text()
        lock_clause = next(line.strip() for line in source.splitlines() if "flock -n 9 ||" in line)
        with tempfile.TemporaryDirectory() as directory:
            script = """\
flock() {{ return 1; }}
{clause}
""".format(clause=lock_clause)
            result = subprocess.run(
                ["bash", "-c", script], stdout=subprocess.PIPE,
                stderr=subprocess.PIPE, universal_newlines=True,
            )
            self.assertEqual(result.returncode, 75)


if __name__ == "__main__":
    unittest.main()
