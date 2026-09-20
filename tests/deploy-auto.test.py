#!/usr/bin/env python3
import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


MODULE_PATH = Path(__file__).parents[1] / "deploy" / "auto-update.py"
spec = importlib.util.spec_from_file_location("auto_update", MODULE_PATH)
auto_update = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(auto_update)

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

    def test_current_revision_skips_before_ci_query(self):
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
                gate.assert_not_called()

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


if __name__ == "__main__":
    unittest.main()
