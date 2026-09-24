#!/usr/bin/env python3
"""Check planning index coverage and local Markdown links."""

from __future__ import annotations

import argparse
import re
from pathlib import Path
from urllib.parse import unquote


LINK_RE = re.compile(r"\[[^\]]*\]\(([^)]+)\)")


def _local_link_target(source: Path, raw_target: str) -> Path | None:
    value = raw_target.strip()
    if value.startswith("<") and ">" in value:
        target = value[1 : value.index(">")]
    else:
        target = value.split(maxsplit=1)[0]
    if not target or target.startswith(("#", "http://", "https://", "mailto:")):
        return None
    target = unquote(target.split("#", 1)[0])
    if not target:
        return None
    path = Path(target)
    return path if path.is_absolute() else source.parent / path


def audit(root: Path) -> list[str]:
    planning = root / "docs" / "planning"
    index = planning / "README.md"
    errors: list[str] = []

    if not planning.is_dir():
        return [f"missing planning directory: {planning}"]
    if not index.is_file():
        return [f"missing planning index: {index}"]

    index_targets = {
        target.resolve()
        for raw_target in LINK_RE.findall(index.read_text(encoding="utf-8"))
        if (target := _local_link_target(index, raw_target)) is not None
    }
    for document in sorted(planning.rglob("*.md")):
        if document != index and document.resolve() not in index_targets:
            errors.append(f"unindexed planning document: {document.relative_to(root)}")

    markdown_files = set((root / "docs").rglob("*.md"))
    markdown_files.update(root / name for name in ("README.md", "AGENTS.md"))
    markdown_files.add(root / "assets" / "README.md")
    for document in sorted(markdown_files):
        if not document.is_file():
            continue
        text = document.read_text(encoding="utf-8")
        for raw_target in LINK_RE.findall(text):
            target = _local_link_target(document, raw_target)
            if target is not None and not target.exists():
                errors.append(
                    f"broken local link in {document.relative_to(root)}: {raw_target}"
                )

    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True, help="project root")
    args = parser.parse_args()

    errors = audit(args.root.resolve())
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1

    print("Planning docs audit passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
