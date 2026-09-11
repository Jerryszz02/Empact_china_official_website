#!/usr/bin/env python3
"""合并分析：日历表活动 × 官网现有目录 × 微盘实际资料。

目的：找出「日历表有排期、官网无目录」的活动，逐个到微盘索引中核查是否真有活动文件，
      以决定是否补入官网目录（无文件者视为未办）。

输出：merge-analysis.md
"""
from __future__ import annotations

import json
import os

BASE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.dirname(BASE)
CASES = os.path.join(ASSETS, "cases-images")

# 日历表活动 → 微盘检索词（人工核定，覆盖活动名与目录名的差异）
PROBE: dict[str, list[str]] = {
    "CTB 活动": ["CTB", "黑客松"],
    "1月月月营": ["1月月月营", "2026.1", "0101"],
    "DJ研学营": ["DJ", "东江"],
    "3 月月月营-辅导学校": ["辅读学校", "辅导学校"],
    "少年说杨浦双语": ["杨浦双语"],
    "4 月月月营": ["4月月月营", "4.26"],
    "研学营+黑客松直播": ["黑客松"],
    "华盛怀少课程": ["华盛怀少"],
    "凯德长期成效报告交付凯德": ["凯德"],
    "嘉悦@Maggie": ["嘉悦"],
    "可口可乐月月营": ["可口可乐"],
    "新加坡 AI 中国 Learning Journey之旅": ["中国 AI 之旅", "Learning Journey"],
    "凯德Chat Circles培训（TBD）": ["Chat Circle"],
    "凯德Chat Circles活动（TBD）": ["Chat Circle"],
    "abbvie 台湾活动": ["abbvie", "台湾", "榮田", "荣田"],
    "6 月月月营": ["6月月月营", "6.27"],
    "德国/法国亲子游（Maggie 带队）": ["德国", "法国", "亲子游"],
    "青戈赛": ["青戈"],
    "未来领袖青戈 6-中欧亲子及 Empact 共同组队": ["青戈"],
    "英国剑桥大学官方学术项目": ["剑桥"],
    "年卡少年聚会-Peter 申时茶会": ["申时茶会", "年卡"],
    "艾尔建云南团建": ["艾尔建"],
    "艾尔建茶马古道团建 探路@Maggie": ["艾尔建", "茶马古道"],
    "艾尔建茶马古道团建活动": ["艾尔建", "茶马古道"],
    "台湾荣田精机团建项目": ["荣田", "榮田"],
}


def main() -> None:
    with open(os.path.join(BASE, "microdisk-index.json"), encoding="utf-8") as fh:
        idx = json.load(fh)
    paths: list[str] = idx["paths"]
    folders: list[str] = idx["folders"]

    lines = ["# 合并分析：日历表 × 官网目录 × 微盘资料", ""]
    lines.append("> 对「日历表有排期、官网无目录」的活动，核查微盘是否真有活动文件。")
    lines.append("")

    lines.append("## 逐项核查")
    lines.append("")
    for act, kws in PROBE.items():
        hit_paths = []
        for p in paths:
            if any(kw.lower() in p.lower() for kw in kws):
                hit_paths.append(p)
        lines.append(f"### {act}")
        lines.append("")
        lines.append(f"- 检索词：{'、'.join(kws)}")
        lines.append(f"- 微盘命中：**{len(hit_paths)}** 条文件")
        if hit_paths:
            dirs = sorted({os.path.dirname(p) for p in hit_paths})
            for d in dirs[:6]:
                lines.append(f"  - `{d}`")
            if len(dirs) > 6:
                lines.append(f"  - …另有 {len(dirs) - 6} 个目录")
        else:
            lines.append("  - ⚠ 微盘未见相关文件")
        lines.append("")

    out = os.path.join(BASE, "merge-analysis.md")
    with open(out, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))
    print(f"已生成 {out}")
    for act, kws in PROBE.items():
        n = sum(1 for p in paths if any(kw.lower() in p.lower() for kw in kws))
        flag = "✓" if n else "✗ 无文件"
        print(f"  {flag}  {act}  ({n} 条)")


if __name__ == "__main__":
    main()
