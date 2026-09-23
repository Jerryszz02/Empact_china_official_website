#!/usr/bin/env python3
"""Review and apply narrowly scoped, additive CMS schema transitions.

The fingerprint deliberately matches deploy.sh's schema_manifest output byte for byte.
This tool never updates Payload's migration bookkeeping.
"""

import hashlib
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path


SCHEMA_FILES = (
    "apps/cms/payload.config.ts",
    "apps/cms/src/collections.ts",
    "apps/cms/src/payload-types.ts",
)
MIGRATIONS = Path("apps/cms/src/migrations")
DEPENDENCIES = ("payload", "@payloadcms/db-sqlite")
HASH = re.compile(r"^[0-9a-f]{64}$")
IDENTIFIER = r'(?:`[^`]+`|"[^"]+"|[A-Za-z_][A-Za-z0-9_]*)'
TABLE = re.compile(r"^CREATE\s+TABLE\s+(" + IDENTIFIER + r")\s*\(", re.I | re.S)
INDEX = re.compile(r"^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(" + IDENTIFIER + r")\s+ON\s+(" + IDENTIFIER + r")\s*\(", re.I | re.S)
INDEX_IMPORT = re.compile(r'^\s*import\s+\*\s+as\s+\w+\s+from\s+["\']\./([^"\']+)\.js["\'];\s*$', re.M)
INDEX_ENTRY = re.compile(r'\{[^{}]*\bname:\s*["\']([^"\']+)["\'][^{}]*\}', re.S)


class PlanError(Exception):
    pass


def file_hash(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def dependencies(root):
    with (root / "apps/cms/package.json").open(encoding="utf-8") as handle:
        deps = json.load(handle)["dependencies"]
    return tuple(str(deps[name]) for name in DEPENDENCIES)


def manifest(root):
    lines = []
    for name in SCHEMA_FILES:
        path = root / name
        lines.append((file_hash(path) if path.is_file() else "missing") + "  " + name)
    lines.extend(name + "=" + version for name, version in zip(DEPENDENCIES, dependencies(root)))
    directory = root / MIGRATIONS
    if directory.is_dir():
        files = sorted((p for p in directory.rglob("*") if p.is_file()), key=lambda p: os.fsencode(str(p.relative_to(root))))
        for path in files:
            lines.append(file_hash(path) + "  " + path.relative_to(root).as_posix())
    return ("\n".join(lines) + "\n").encode("utf-8")


def fingerprint(root):
    return hashlib.sha256(manifest(root)).hexdigest()


def migration_index(root):
    path = root / MIGRATIONS / "index.ts"
    return path.read_text(encoding="utf-8") if path.is_file() else ""


def reject_old_migration_edits(current, candidate):
    directory = current / MIGRATIONS
    if directory.is_dir():
        for path in directory.rglob("*"):
            if path.is_file() and path.name != "index.ts":
                relative = path.relative_to(current)
                other = candidate / relative
                if not other.is_file() or file_hash(path) != file_hash(other):
                    raise PlanError("existing migration changed: " + relative.as_posix())
    old = migration_index(current)
    new = migration_index(candidate)
    old_imports = INDEX_IMPORT.findall(old)
    new_imports = INDEX_IMPORT.findall(new)
    if new_imports[:len(old_imports)] != old_imports:
        raise PlanError("existing migration imports changed or reordered")
    old_entries = INDEX_ENTRY.findall(old)
    new_entries = INDEX_ENTRY.findall(new)
    if new_entries[:len(old_entries)] != old_entries:
        raise PlanError("existing migration entries changed or reordered")
    for name in old_imports:
        old_lines = [line.strip() for line in old.splitlines() if "./" + name + ".js" in line]
        new_lines = [line.strip() for line in new.splitlines() if "./" + name + ".js" in line]
        if old_lines != new_lines:
            raise PlanError("existing migration import edited: " + name)
    for name in old_entries:
        pattern = re.compile(r'\{[^{}]*\bname:\s*["\']' + re.escape(name) + r'["\'][^{}]*\}', re.S)
        old_blocks = [re.sub(r"\s+", "", match.group()) for match in pattern.finditer(old)]
        new_blocks = [re.sub(r"\s+", "", match.group()) for match in pattern.finditer(new)]
        if old_blocks != new_blocks:
            raise PlanError("existing migration entry edited: " + name)


def validate_step(step, filename):
    if not isinstance(step, dict) or set(step) != {"version", "from", "to", "description", "statements"}:
        raise PlanError("invalid plan fields: " + filename)
    if step["version"] != 1 or not isinstance(step["from"], str) or not HASH.fullmatch(step["from"]) or not isinstance(step["to"], str) or not HASH.fullmatch(step["to"]):
        raise PlanError("invalid plan version or hash: " + filename)
    if step["from"] == step["to"]:
        raise PlanError("self-referencing plan: " + filename)
    if not isinstance(step["description"], str) or not step["description"].strip():
        raise PlanError("missing plan description: " + filename)
    if not isinstance(step["statements"], list) or not all(isinstance(s, str) for s in step["statements"]):
        raise PlanError("invalid plan statements: " + filename)
    for statement in step["statements"]:
        parse_statement(statement)


def load_steps(candidate):
    directory = candidate / "deploy/schema-plans"
    steps = []
    if directory.is_dir():
        for path in sorted(directory.glob("*.json")):
            with path.open(encoding="utf-8") as handle:
                step = json.load(handle)
            validate_step(step, path.name)
            steps.append(step)
    return steps


def select_chain(steps, start, target):
    by_from = {}
    for step in steps:
        by_from.setdefault(step["from"], []).append(step)
    # A duplicate edge is ambiguous too, even when both files contain identical SQL.
    selected = []
    seen = set()
    node = start
    while node != target:
        if node in seen:
            raise PlanError("schema plan cycle")
        seen.add(node)
        outgoing = by_from.get(node, [])
        if len(outgoing) != 1:
            raise PlanError("missing or ambiguous schema plan from " + node)
        step = outgoing[0]
        selected.append(step)
        node = step["to"]
    return selected


def check(current, candidate, output):
    start = fingerprint(current)
    target = fingerprint(candidate)
    if start == target:
        chosen = []
    else:
        if dependencies(current) != dependencies(candidate):
            raise PlanError("Payload or SQLite adapter dependency changed")
        reject_old_migration_edits(current, candidate)
        chosen = select_chain(load_steps(candidate), start, target)
    result = {"version": 1, "from": start, "to": target, "steps": chosen}
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8") as handle:
        json.dump(result, handle, indent=2)
        handle.write("\n")
    return result


def unquote(value):
    return value[1:-1] if value.startswith(("`", '"')) else value


def parse_statement(statement):
    if not statement.strip() or "--" in statement or "/*" in statement or "*/" in statement:
        raise PlanError("empty or commented SQL is not allowed")
    sql = statement.strip()
    if not sqlite3.complete_statement(sql if sql.endswith(";") else sql + ";"):
        raise PlanError("incomplete SQL statement")
    for position, char in enumerate(sql[:-1]):
        if char == ";" and sqlite3.complete_statement(sql[:position + 1]):
            raise PlanError("multiple SQL statements are not allowed")
    match = TABLE.match(sql)
    if match:
        return ("table", unquote(match.group(1)), None)
    match = INDEX.match(sql)
    if match:
        return ("index", unquote(match.group(1)), unquote(match.group(2)))
    raise PlanError("only CREATE TABLE or CREATE INDEX is allowed")


def schema(connection):
    return {(kind, name): (table, sql) for kind, name, table, sql in connection.execute(
        "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type IN ('table', 'index', 'view', 'trigger')")}


def normalize_sql(sql):
    return sql.strip().rstrip(";").strip() if sql else ""


def old_table_fingerprints(connection, old_schema):
    """Hash existing rows in process; never log or copy row values elsewhere."""
    fingerprints = {}
    for kind, name in old_schema:
        if kind != "table":
            continue
        identifier = '"' + name.replace('"', '""') + '"'
        row_hashes = []
        for row in connection.execute("SELECT * FROM " + identifier):
            digest = hashlib.sha256()
            for value in row:
                if value is None:
                    tag, data = b"n", b""
                elif isinstance(value, bytes):
                    tag, data = b"b", value
                elif isinstance(value, str):
                    tag, data = b"s", value.encode("utf-8")
                elif isinstance(value, int):
                    tag, data = b"i", str(value).encode("ascii")
                else:
                    tag, data = b"f", repr(value).encode("ascii")
                digest.update(tag + str(len(data)).encode("ascii") + b":" + data)
            row_hashes.append(digest.digest())
        fingerprints[name] = hashlib.sha256(b"".join(sorted(row_hashes))).digest()
    return fingerprints


def integrity(connection):
    result = connection.execute("PRAGMA integrity_check").fetchall()
    if result != [("ok",)]:
        raise PlanError("SQLite integrity_check failed")
    return set(connection.execute("PRAGMA foreign_key_check").fetchall())


def apply_to_database(db, statements):
    # Cached statements can retain an authorizer decision after DDL recompilation.
    connection = sqlite3.connect(str(db), timeout=30, isolation_level=None, cached_statements=0)
    try:
        connection.execute("BEGIN IMMEDIATE")
        try:
            baseline_fk = integrity(connection)
            before = schema(connection)
            old_data = old_table_fingerprints(connection, before)
            new_tables = {name for statement in statements for kind, name, _ in [parse_statement(statement)] if kind == "table"}
            for statement in statements:
                kind, name, table = parse_statement(statement)
                if kind == "index" and table not in new_tables:
                    raise PlanError("index target is not a planned new table: " + table)
                key = (kind, name)
                present = schema(connection).get(key)
                if present:
                    if normalize_sql(present[1]) != normalize_sql(statement) or (kind == "index" and present[0] != table):
                        raise PlanError("existing schema object differs: " + name)
                    continue
                if kind == "table" and any(existing_name == name for _, existing_name in schema(connection)):
                    raise PlanError("schema object name already exists: " + name)
                allowed_actions = {sqlite3.SQLITE_INSERT, sqlite3.SQLITE_UPDATE, sqlite3.SQLITE_READ, sqlite3.SQLITE_CREATE_TABLE, sqlite3.SQLITE_CREATE_INDEX, sqlite3.SQLITE_REINDEX}

                def authorize(action, arg1, arg2, database_name, source):
                    if database_name != "main" or source is not None or action not in allowed_actions:
                        return sqlite3.SQLITE_DENY
                    if action in (sqlite3.SQLITE_INSERT, sqlite3.SQLITE_UPDATE):
                        return sqlite3.SQLITE_OK if arg1 == "sqlite_master" else sqlite3.SQLITE_DENY
                    if action == sqlite3.SQLITE_READ:
                        return sqlite3.SQLITE_OK if arg1 in ("sqlite_master", name, table) else sqlite3.SQLITE_DENY
                    if action == sqlite3.SQLITE_CREATE_TABLE:
                        return sqlite3.SQLITE_OK if kind == "table" and arg1 == name else sqlite3.SQLITE_DENY
                    if action == sqlite3.SQLITE_CREATE_INDEX:
                        valid_index = arg1 == name or (kind == "table" and arg1.startswith("sqlite_autoindex_" + name + "_"))
                        valid_table = arg2 == (table if kind == "index" else name)
                        return sqlite3.SQLITE_OK if valid_index and valid_table else sqlite3.SQLITE_DENY
                    if action == sqlite3.SQLITE_REINDEX:
                        return sqlite3.SQLITE_OK if kind == "index" and arg1 == name else sqlite3.SQLITE_DENY
                    return sqlite3.SQLITE_DENY

                connection.set_authorizer(authorize)
                try:
                    connection.execute(statement)
                finally:
                    # set_authorizer(None) is unavailable before Python 3.11.
                    connection.set_authorizer(lambda *args: sqlite3.SQLITE_OK)
            after = schema(connection)
            for key, value in before.items():
                if after.get(key) != value:
                    raise PlanError("existing schema changed: " + key[1])
            if old_table_fingerprints(connection, before) != old_data:
                raise PlanError("existing table data changed")
            after_fk = integrity(connection)
            if after_fk != baseline_fk:
                raise PlanError("foreign key violations changed")
            connection.execute("COMMIT")
        except Exception:
            connection.execute("ROLLBACK")
            raise
    finally:
        connection.close()


def sqlite_backup(db, backup):
    # Python 3.6 on production lacks Connection.backup; the SQLite CLI has .backup.
    if any(char in str(backup) for char in ('"', "'", "\n", "\r")):
        raise PlanError("unsupported backup path")
    backup.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor = os.open(str(backup), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(descriptor)
    try:
        result = subprocess.run(["sqlite3", str(db), '.backup "' + str(backup) + '"'],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
        if result.returncode:
            raise PlanError("SQLite backup failed: " + result.stderr.strip())
        with sqlite3.connect(str(backup)) as connection:
            integrity(connection)
    except Exception:
        backup.unlink()
        raise


def apply(plan_path, db, backup):
    with plan_path.open(encoding="utf-8") as handle:
        plan = json.load(handle)
    if not isinstance(plan, dict) or plan.get("version") != 1 or not isinstance(plan.get("steps"), list) or not all(isinstance(plan.get(k), str) and HASH.fullmatch(plan[k]) for k in ("from", "to")):
        raise PlanError("invalid selected plan")
    node = plan["from"]
    statements = []
    for step in plan["steps"]:
        validate_step(step, str(plan_path))
        if step["from"] != node:
            raise PlanError("selected plan chain is broken")
        node = step["to"]
        statements.extend(step["statements"])
    if node != plan["to"]:
        raise PlanError("selected plan target differs")
    if not statements:
        return
    if not db.is_file():
        raise PlanError("CMS database does not exist")
    sqlite_backup(db, backup)
    with tempfile.TemporaryDirectory(prefix="empact-schema-") as directory:
        test_db = Path(directory) / "test.db"
        shutil.copy2(str(backup), str(test_db))
        apply_to_database(test_db, statements)
    apply_to_database(db, statements)


def main(argv):
    if len(argv) == 3 and argv[1] == "fingerprint":
        print(fingerprint(Path(argv[2])))
    elif len(argv) == 5 and argv[1] == "check":
        result = check(Path(argv[2]), Path(argv[3]), Path(argv[4]))
        print("schema plan: {} step(s), target {}".format(len(result["steps"]), result["to"]))
    elif len(argv) == 5 and argv[1] == "apply":
        apply(Path(argv[2]), Path(argv[3]), Path(argv[4]))
        print("schema plan applied")
    else:
        raise PlanError("usage: schema-plan.py fingerprint ROOT | check CURRENT CANDIDATE PLAN_OUT | apply PLAN DB BACKUP")


if __name__ == "__main__":
    try:
        main(sys.argv)
    except (PlanError, OSError, ValueError, KeyError, sqlite3.Error, json.JSONDecodeError) as error:
        print("schema plan error: " + str(error), file=sys.stderr)
        sys.exit(1)
