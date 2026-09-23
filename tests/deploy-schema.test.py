#!/usr/bin/env python3
import importlib.util
import hashlib
import json
import re
import shutil
import sqlite3
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).parents[1]
MODULE = ROOT / "deploy/schema-plan.py"
spec = importlib.util.spec_from_file_location("schema_plan", MODULE)
schema_plan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(schema_plan)


class SchemaPlanTests(unittest.TestCase):
    def roots(self, directory):
        current = directory / "current"
        candidate = directory / "candidate"
        for root in (current, candidate):
            (root / "apps/cms/src/migrations").mkdir(parents=True)
            (root / "apps/cms").mkdir(parents=True, exist_ok=True)
            (root / "deploy/schema-plans").mkdir(parents=True)
            (root / "apps/cms/package.json").write_text(json.dumps({"dependencies": {
                "payload": "3.90.1", "@payloadcms/db-sqlite": "3.90.1"}}))
            for name in schema_plan.SCHEMA_FILES:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("old")
            (root / schema_plan.MIGRATIONS / "old.ts").write_text("old migration")
            (root / schema_plan.MIGRATIONS / "index.ts").write_text(
                'import * as old from "./old.js";\nexport const migrations = [\n'
                '  { up: old.up, down: old.down, name: "old" },\n];\n')
        return current, candidate

    def plan(self, candidate, current, statements=None, **overrides):
        step = {"version": 1, "from": schema_plan.fingerprint(current),
                "to": schema_plan.fingerprint(candidate), "description": "reviewed addition",
                "statements": statements if statements is not None else []}
        step.update(overrides)
        path = candidate / "deploy/schema-plans/addition.json"
        path.write_text(json.dumps(step))
        return step

    def test_manifest_matches_deploy_shell_format_for_repository(self):
        shell = r'''set -euo pipefail
root=$1
for file in apps/cms/payload.config.ts apps/cms/src/collections.ts apps/cms/src/payload-types.ts; do
  if [[ -f "$root/$file" ]]; then (cd "$root" && sha256sum "$file"); else printf 'missing  %s\n' "$file"; fi
done
python3 - "$root/apps/cms/package.json" <<'PYDEPS'
import json, sys
with open(sys.argv[1]) as package:
    dependencies = json.load(package)["dependencies"]
for name in ("payload", "@payloadcms/db-sqlite"):
    print(name + "=" + dependencies[name])
PYDEPS
if [[ -d "$root/apps/cms/src/migrations" ]]; then
  (cd "$root" && find apps/cms/src/migrations -type f -print0 | sort -z | xargs -0 -r sha256sum)
fi
'''
        result = subprocess.run(["bash", "-c", shell, "manifest", str(ROOT)],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        self.assertEqual(schema_plan.manifest(ROOT), result.stdout)
        self.assertEqual(schema_plan.fingerprint(ROOT), hashlib.sha256(result.stdout).hexdigest())

    def test_noop_and_unique_chain(self):
        with tempfile.TemporaryDirectory() as temp:
            current, candidate = self.roots(Path(temp))
            output = Path(temp) / "selected.json"
            result = schema_plan.check(current, candidate, output)
            self.assertEqual(result["steps"], [])
            self.assertEqual(json.loads(output.read_text()), result)
            (candidate / schema_plan.SCHEMA_FILES[1]).write_text("new")
            approved = self.plan(candidate, current)
            result = schema_plan.check(current, candidate, output)
            self.assertEqual(result["steps"], [approved])
            self.assertEqual(result["to"], schema_plan.fingerprint(candidate))

    def test_two_step_chain_selects_both_in_order(self):
        with tempfile.TemporaryDirectory() as temp:
            current, candidate = self.roots(Path(temp))
            middle = Path(temp) / "middle"
            shutil.copytree(str(current), str(middle))
            (middle / schema_plan.SCHEMA_FILES[1]).write_text("middle")
            (candidate / schema_plan.SCHEMA_FILES[1]).write_text("middle")
            (candidate / schema_plan.SCHEMA_FILES[2]).write_text("final")
            first = {"version": 1, "from": schema_plan.fingerprint(current),
                     "to": schema_plan.fingerprint(middle), "description": "first reviewed change", "statements": []}
            second = {"version": 1, "from": schema_plan.fingerprint(middle),
                      "to": schema_plan.fingerprint(candidate), "description": "second reviewed change", "statements": []}
            (candidate / "deploy/schema-plans/first.json").write_text(json.dumps(first))
            (candidate / "deploy/schema-plans/second.json").write_text(json.dumps(second))
            result = schema_plan.check(current, candidate, Path(temp) / "selected.json")
            self.assertEqual(result["steps"], [first, second])

    def test_invalid_hash_missing_or_ambiguous_chain_and_cycle_fail(self):
        with tempfile.TemporaryDirectory() as temp:
            current, candidate = self.roots(Path(temp))
            (candidate / schema_plan.SCHEMA_FILES[1]).write_text("new")
            output = Path(temp) / "selected.json"
            with self.assertRaisesRegex(schema_plan.PlanError, "missing"):
                schema_plan.check(current, candidate, output)
            step = self.plan(candidate, current)
            step["to"] = "wrong"
            (candidate / "deploy/schema-plans/addition.json").write_text(json.dumps(step))
            with self.assertRaisesRegex(schema_plan.PlanError, "hash"):
                schema_plan.check(current, candidate, output)
            step["to"] = "a" * 64
            (candidate / "deploy/schema-plans/addition.json").write_text(json.dumps(step))
            (candidate / "deploy/schema-plans/back.json").write_text(json.dumps(dict(step, **{
                "from": "a" * 64, "to": step["from"]})))
            with self.assertRaisesRegex(schema_plan.PlanError, "cycle"):
                schema_plan.check(current, candidate, output)
            (candidate / "deploy/schema-plans/back.json").unlink()
            step["to"] = schema_plan.fingerprint(candidate)
            (candidate / "deploy/schema-plans/addition.json").write_text(json.dumps(step))
            (candidate / "deploy/schema-plans/duplicate.json").write_text(json.dumps(step))
            with self.assertRaisesRegex(schema_plan.PlanError, "ambiguous"):
                schema_plan.check(current, candidate, output)

    def test_dependency_and_old_migration_edits_fail(self):
        with tempfile.TemporaryDirectory() as temp:
            current, candidate = self.roots(Path(temp))
            package = candidate / "apps/cms/package.json"
            contents = json.loads(package.read_text())
            contents["dependencies"]["@payloadcms/db-sqlite"] = "3.91.0"
            package.write_text(json.dumps(contents))
            with self.assertRaisesRegex(schema_plan.PlanError, "dependency"):
                schema_plan.check(current, candidate, Path(temp) / "selected.json")
            package.write_text((current / "apps/cms/package.json").read_text())
            (candidate / schema_plan.MIGRATIONS / "old.ts").write_text("rewritten migration")
            with self.assertRaisesRegex(schema_plan.PlanError, "existing migration changed"):
                schema_plan.check(current, candidate, Path(temp) / "selected.json")
            (candidate / schema_plan.MIGRATIONS / "old.ts").write_text("old migration")
            index = candidate / schema_plan.MIGRATIONS / "index.ts"
            index.write_text(index.read_text().replace("old.down", "other.down"))
            with self.assertRaisesRegex(schema_plan.PlanError, "entry edited"):
                schema_plan.check(current, candidate, Path(temp) / "selected.json")

    def test_real_gallery_plan_matches_migration_and_preserves_existing_rows(self):
        plan = json.loads((ROOT / "deploy/schema-plans/20260923-home-gallery.json").read_text())
        migration = (ROOT / "apps/cms/src/migrations/20260923_044956_home_gallery.ts").read_text()
        up = migration.split("export async function up", 1)[1].split("export async function down", 1)[0]
        migration_sql = [sql.replace("\\`", "`") for sql in re.findall(r"db\.run\(sql`((?:\\.|[^`])*)`\);", up, re.S)]
        self.assertEqual(plan["statements"], migration_sql)
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            db, backup = root / "cms.db", root / "before.db"
            with sqlite3.connect(str(db)) as connection:
                connection.execute("PRAGMA foreign_keys=ON")
                connection.execute("CREATE TABLE media (id integer primary key, filename text)")
                connection.execute("INSERT INTO media VALUES (7, 'original-photo')")
                connection.execute("CREATE TABLE payload_migrations (id integer primary key, name text)")
                connection.execute("INSERT INTO payload_migrations VALUES (1, 'dev/-1')")
            selected = root / "selected.json"
            selected.write_text(json.dumps({"version": 1, "from": plan["from"],
                                            "to": plan["to"], "steps": [plan]}))
            schema_plan.apply(selected, db, backup)
            with sqlite3.connect(str(db)) as connection:
                self.assertEqual(connection.execute("SELECT * FROM media").fetchall(), [(7, "original-photo")])
                self.assertEqual(connection.execute("SELECT * FROM payload_migrations").fetchall(), [(1, "dev/-1")])
                self.assertEqual(connection.execute("SELECT * FROM home_gallery").fetchall(), [])
                self.assertEqual(connection.execute("SELECT * FROM home_gallery_photos").fetchall(), [])
                self.assertEqual(connection.execute("PRAGMA integrity_check").fetchone(), ("ok",))
            with sqlite3.connect(str(backup)) as connection:
                self.assertIsNone(connection.execute("SELECT name FROM sqlite_master WHERE name='home_gallery'").fetchone())
                self.assertEqual(connection.execute("SELECT * FROM media").fetchall(), [(7, "original-photo")])
            with self.assertRaises(FileExistsError):
                schema_plan.apply(selected, db, backup)
            schema_plan.apply(selected, db, root / "second-backup.db")

    def test_rejects_destructive_sql_and_incompatible_partial_schema(self):
        for statement in ("ALTER TABLE media ADD COLUMN x TEXT", "DROP TABLE media",
                          "UPDATE media SET id=2", "PRAGMA foreign_keys=OFF",
                          "CREATE TRIGGER t AFTER INSERT ON media BEGIN SELECT 1; END;",
                          "CREATE VIRTUAL TABLE x USING fts5(a)",
                          "CREATE TABLE IF NOT EXISTS x(a)", "CREATE TABLE x(a); DROP TABLE media"):
            with self.subTest(statement=statement), self.assertRaises(schema_plan.PlanError):
                schema_plan.parse_statement(statement)
        with tempfile.TemporaryDirectory() as temp:
            db = Path(temp) / "cms.db"
            with sqlite3.connect(str(db)) as connection:
                connection.execute("CREATE TABLE gallery (id integer)")
            with self.assertRaisesRegex(schema_plan.PlanError, "differs"):
                schema_plan.apply_to_database(db, ["CREATE TABLE gallery (id text);"])
            with sqlite3.connect(str(db)) as connection:
                self.assertEqual(connection.execute("SELECT sql FROM sqlite_master WHERE name='gallery'").fetchone()[0],
                                 "CREATE TABLE gallery (id integer)")

    def test_failed_later_statement_does_not_commit_earlier_table(self):
        with tempfile.TemporaryDirectory() as temp:
            db = Path(temp) / "cms.db"
            with sqlite3.connect(str(db)) as connection:
                connection.execute("CREATE TABLE original (value text)")
                connection.execute("INSERT INTO original VALUES ('keep')")
            with self.assertRaises(sqlite3.Error):
                schema_plan.apply_to_database(db, ["CREATE TABLE fresh (id integer);",
                                                   "CREATE INDEX bad ON fresh (missing_column);"])
            with sqlite3.connect(str(db)) as connection:
                self.assertEqual(connection.execute("SELECT * FROM original").fetchall(), [("keep",)])
                self.assertIsNone(connection.execute("SELECT name FROM sqlite_master WHERE name='fresh'").fetchone())


if __name__ == "__main__":
    unittest.main()
