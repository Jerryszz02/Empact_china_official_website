#!/usr/bin/env python3
"""Regression checks for the documentation index and local links."""

import importlib.util
from pathlib import Path
import tempfile
import unittest


spec = importlib.util.spec_from_file_location(
    "audit_planning_docs", Path(__file__).parents[1] / "scripts/audit_planning_docs.py"
)
auditor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(auditor)


class AuditPlanningDocsTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.write("docs/planning/README.md", "# Index\n")

    def write(self, name, content):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    def test_nested_document_with_same_basename_needs_its_own_index_link(self):
        self.write("docs/planning/README.md", "[A](content/a.md)\n")
        self.write("docs/planning/content/a.md", "# A\n")
        self.write("docs/planning/features/a.md", "# Another A\n")

        self.assertEqual(
            auditor.audit(self.root),
            ["unindexed planning document: docs/planning/features/a.md"],
        )

    def test_nested_document_link_is_checked(self):
        self.write("docs/planning/README.md", "[A](content/a.md)\n")
        self.write("docs/planning/content/a.md", "[Missing](../features/missing.md)\n")

        self.assertEqual(
            auditor.audit(self.root),
            ["broken local link in docs/planning/content/a.md: ../features/missing.md"],
        )

    def test_chinese_and_encoded_space_links_pass(self):
        self.write(
            "docs/planning/README.md",
            "[中文](content/中文%20文件.md)\n[原始](<content/原始 图像.md>)\n",
        )
        self.write("docs/planning/content/中文 文件.md", "[首页](../../../README.md)\n")
        self.write("docs/planning/content/原始 图像.md", "# 图像\n")
        self.write("README.md", "[素材](assets/README.md)\n")
        self.write("AGENTS.md", "[索引](docs/planning/README.md)\n")
        self.write("assets/README.md", "[资料](../docs/planning/content/中文%20文件.md)\n")

        self.assertEqual(auditor.audit(self.root), [])

    def test_docs_and_root_entry_links_are_checked(self):
        self.write("docs/README.md", "[Missing](planning/nope.md)\n")
        self.write("README.md", "[Missing](absent.md)\n")
        self.write("AGENTS.md", "[Missing](other.md)\n")
        self.write("assets/README.md", "[Missing](../docs/absent.md)\n")

        errors = auditor.audit(self.root)
        self.assertEqual(len(errors), 4)
        self.assertTrue(any("docs/README.md: planning/nope.md" in error for error in errors))
        self.assertTrue(any("README.md: absent.md" in error for error in errors))
        self.assertTrue(any("AGENTS.md: other.md" in error for error in errors))
        self.assertTrue(any("assets/README.md: ../docs/absent.md" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
