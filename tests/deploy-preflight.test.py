#!/usr/bin/env python3
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "preflight", Path(__file__).parents[1] / "deploy/preflight.py")
preflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight)


class PreflightTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.git("init", "-q")
        self.git("config", "user.name", "Fixture")
        self.git("config", "user.email", "fixture@example.invalid")
        self.git("config", "core.hooksPath", str(self.root / "no-hooks"))
        for path in preflight.PROTECTED:
            self.write(path, "original")
        self.write("apps/cms/src/migrations/initial.json", "{}")
        self.write("apps/cms/package.json", json.dumps({"dependencies": {
            "payload": "3.90.1", "@payloadcms/db-sqlite": "3.90.1", "other": "1",
        }}))
        self.before = self.commit()
        self.patch = patch.object(preflight, "git", side_effect=self.git)
        self.patch.start()
        self.addCleanup(self.patch.stop)

    def git(self, *args):
        return subprocess.check_output(["git", "-C", str(self.root), *args])

    def write(self, path, content):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)

    def commit(self):
        self.git("add", ".")
        self.git("-c", "commit.gpgsign=false", "commit", "-qm", "fixture")
        return self.git("rev-parse", "HEAD").decode().strip()

    def report(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            summary = preflight.report(self.before, self.commit())
        return summary, output.getvalue()

    def test_site_only_change_needs_no_schema_approval(self):
        self.write("apps/site/page.astro", "new case page")
        summary, annotation = self.report()
        self.assertIn("No protected CMS changes", summary)
        self.assertEqual(annotation, "")

    def test_hidden_field_change_warns_before_deployment(self):
        self.write("apps/cms/src/collections.ts", "hidden field")
        summary, annotation = self.report()
        self.assertIn("apps/cms/src/collections.ts", summary)
        self.assertIn("::warning", annotation)
        self.assertIn("neither reads the production server nor grants approval", summary)

    def test_added_and_removed_migrations_are_reported(self):
        (self.root / "apps/cms/src/migrations/initial.json").unlink()
        self.write("apps/cms/src/migrations/new.ts", "migration")
        summary, _ = self.report()
        self.assertIn("migrations/initial.json", summary)
        self.assertIn("migrations/new.ts", summary)

    def test_database_dependency_change_is_reported(self):
        self.write("apps/cms/package.json", json.dumps({"dependencies": {
            "payload": "4.0.0", "@payloadcms/db-sqlite": "3.90.1", "other": "2",
        }}))
        summary, annotation = self.report()
        self.assertIn("- `payload`", summary)
        self.assertNotIn("- `other`", summary)
        self.assertIn("::warning", annotation)

    def test_invalid_or_missing_comparison_revision_fails(self):
        for value in ("main", "--help", "a" * 40 + "\n"):
            with self.assertRaises(ValueError):
                preflight.manifest(value)
        with self.assertRaises(subprocess.CalledProcessError):
            preflight.manifest("b" * 40)


if __name__ == "__main__":
    unittest.main()
