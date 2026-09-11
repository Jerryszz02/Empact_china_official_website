#!/usr/bin/env python3
"""生成《2026年Empact活动台账.md》——来自微盘在线表格的权威活动排期，
并与官网 `cases-images/` 下的活动目录做交叉比对。

比对目的：用公司内部排期表校准官网案例配图的「活动目录」是否完整/有冗余。

输出：../2026年活动台账.md
"""
from __future__ import annotations

import difflib
import importlib.util
import json
import os
import re

BASE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.dirname(BASE)
CASES = os.path.join(ASSETS, "cases-images")

spec = importlib.util.spec_from_file_location(
    "fetch_mod", os.path.join(CASES, "fetch-activity-photos.py"))
fetch_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fetch_mod)
SECTIONS: dict[str, list[str]] = fetch_mod.SECTIONS

STATUS_LABEL = {"●": "已完成/进行中", "○": "未开始", "√": "已完成", "×": "取消", "△": "待定"}
INTERNAL_KW = ["战略会", "workshop", "暑托班", "团建", "探路", "总结会议", "预算", "彩排", "茶会"]


def norm(s: str) -> str:
    s = re.sub(r"\d{4}([.\-/]\d{1,2}){0,2}", "", s)
    s = re.sub(r"^[\-–—.、\s]+", "", s)
    return re.sub(r"[(（)）\[\]【】\s\-–—_+·:：,，。.]", "", s).lower()


def is_internal(name: str) -> bool:
    low = name.lower()
    return any(k.lower() in low for k in INTERNAL_KW)


def dir_month(d: str) -> int | None:
    """从目录名解析月份，如 `2026.07-...` → 7；无月份信息返回 None。"""
    m = re.search(r"2026[.\-](\d{1,2})", d)
    return int(m.group(1)) if m else None


def best_match(cal_name: str, month: int, dirs: list[tuple[str, str]]) -> tuple[str, str, float, bool | None]:
    """返回 (分区, 目录, 相似度, 月份是否吻合)。月份 None 表示目录未标月份。"""
    n = norm(cal_name)
    best: tuple[str, str, float, bool | None] = ("", "", 0.0, None)
    best_score = -1.0
    for section, d in dirs:
        dn = norm(d)
        if not dn:
            continue
        ratio = difflib.SequenceMatcher(None, n, dn).ratio()
        if n and (n in dn or dn in n) and min(len(n), len(dn)) >= 3:
            ratio = max(0.9, ratio)
        dm = dir_month(d)
        month_ok = None if dm is None else (dm == month)
        # 择优时给月份吻合的候选加权，避免同名不同场次（如 2月/7月香港研学营）被抢先命中
        score = ratio + (0.5 if month_ok else 0.0)
        if score > best_score:
            best_score = score
            best = (section, d, ratio, month_ok)
    return best


def main() -> None:
    with open(os.path.join(BASE, "calendar-activities.json"), encoding="utf-8") as fh:
        acts: list[dict] = json.load(fh)

    dirs: list[tuple[str, str]] = [(s, d) for s, ds in SECTIONS.items() for d in ds]
    dirs_2026 = [(s, d) for s, d in dirs if "2026" in d]

    matched, unmatched, internal = [], [], []
    used_dirs: set[tuple[str, str]] = set()
    for a in acts:
        if a["placeholder"]:
            continue
        if is_internal(a["name"]):
            internal.append(a)
            continue
        sec, d, ratio, month_ok = best_match(a["name"], a["month"], dirs_2026)
        # 目录标了月份时要求月份吻合（阈值更高），未标月份则放宽
        if month_ok is False:
            ok = ratio >= 0.85
        elif month_ok is True:
            ok = ratio >= 0.55
        else:
            ok = ratio >= 0.6
        if d and ok:
            matched.append((a, sec, d, ratio))
            used_dirs.add((sec, d))
        else:
            unmatched.append((a, sec, d, ratio, month_ok))

    miss_dirs = [(s, d) for s, d in dirs_2026 if (s, d) not in used_dirs]

    lines: list[str] = []
    lines.append("# 2026 年 Empact 活动台账（来源：微盘《2026年Empact日历计划表》）")
    lines.append("")
    lines.append("> 数据来自企业微信微盘在线表格，经程序解析为结构化台账。")
    lines.append("> 表格为**日历网格**版式，每月一个工作表；活动含状态标记与负责人。")
    lines.append("")
    real = [a for a in acts if not a["placeholder"]]
    lines.append(f"- 解析活动：**{len(real)}** 项（不含 {len(acts) - len(real)} 项表格内置模板示例行）")
    lines.append(f"- 排期覆盖：{sorted({a['month'] for a in real})} 月")
    stat_parts = [f"{STATUS_LABEL.get(k, k)} {sum(1 for a in real if a['status'] == k)} 项"
                  for k in ("●", "○", "√") if any(a["status"] == k for a in real)]
    stat_parts.append(f"未标记 {sum(1 for a in real if not a['status'])} 项")
    lines.append("- 状态分布：" + "、".join(stat_parts))
    lines.append("")

    lines.append("## 一、按月排期明细")
    lines.append("")
    lines.append("| 日期 | 状态 | 活动 | 负责人 |")
    lines.append("| --- | --- | --- | --- |")
    for m in range(1, 13):
        month_acts = [a for a in real if a["month"] == m]
        if not month_acts:
            continue
        for a in month_acts:
            st = STATUS_LABEL.get(a["status"], a["status"] or "—")
            owners = "、".join(a["owners"]) or "—"
            name = a["name"].replace("\n", " ")
            lines.append(f"| {a['date']} | {st} | {name} | {owners} |")
    lines.append("")

    lines.append("## 二、与官网活动目录的交叉比对")
    lines.append("")
    lines.append(f"官网 `cases-images/` 下 2026 年活动目录共 **{len(dirs_2026)}** 个。")
    lines.append("")

    lines.append(f"### 2.1 已对应（{len(matched)} 项）")
    lines.append("")
    lines.append("| 日历表活动 | 日期 | → 官网目录 |")
    lines.append("| --- | --- | --- |")
    for a, sec, d, _r in matched:
        lines.append(f"| {a['name'].replace(chr(10), ' ')} | {a['date']} | {sec}/{d} |")
    lines.append("")

    lines.append(f"### 2.2 日历表有排期、官网目录未确认对应（{len(unmatched)} 项）")
    lines.append("")
    lines.append("> 建议逐一评估是否需要在官网案例区补充活动目录；“最相近目录”仅供人工判断参考。")
    lines.append("> 若“月份”为 ✗，说明最相近目录的日期与排期不符，多属不同场次或命名差异。")
    lines.append("")
    lines.append("| 日历表活动 | 日期 | 负责人 | 最相近目录 | 相似度 | 月份 |")
    lines.append("| --- | --- | --- | --- | --- | --- |")
    for a, _sec, d, r, mok in unmatched:
        near = d if d else "—"
        flag = "—" if mok is None else ("✓" if mok else "✗")
        lines.append(f"| {a['name'].replace(chr(10), ' ')} | {a['date']} | {'、'.join(a['owners']) or '—'} | {near} | {r:.0%} | {flag} |")
    lines.append("")

    lines.append(f"### 2.3 官网有目录、日历表未见排期（{len(miss_dirs)} 个）")
    lines.append("")
    lines.append("> 可能原因：活动排在其他年份的日历表、未录入日历，或**目录命名与内部叫法不同**（同一活动的两种名称）。")
    lines.append("> 例如官网「卢湾辅读学校」在日历表中记为「3 月月月营-辅导学校」。「最相近活动」供对照。")
    lines.append("")
    lines.append("| 分区 | 目录 | 最相近的日历表活动 | 相似度 |")
    lines.append("| --- | --- | --- | --- |")
    for s, d in miss_dirs:
        best_a, best_r = "—", 0.0
        for a in real:
            r = difflib.SequenceMatcher(None, norm(d), norm(a["name"])).ratio()
            if r > best_r:
                best_a, best_r = a["name"].replace("\n", " "), r
        mark = f"{best_r:.0%}" if best_a != "—" else "—"
        lines.append(f"| {s} | {d} | {best_a} | {mark} |")
    lines.append("")

    lines.append(f"### 2.4 内部事务（{len(internal)} 项，非对外活动，一般不用于官网案例）")
    lines.append("")
    lines.append("| 日期 | 活动 | 负责人 |")
    lines.append("| --- | --- | --- |")
    for a in internal:
        lines.append(f"| {a['date']} | {a['name'].replace(chr(10), ' ')} | {'、'.join(a['owners']) or '—'} |")
    lines.append("")

    out = os.path.join(ASSETS, "2026年活动台账.md")
    with open(out, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))
    print(f"已生成 {out}")
    print(f"  已对应 {len(matched)} / 日历独有 {len(unmatched)} / 官网独有 {len(miss_dirs)} / 内部事务 {len(internal)}")


if __name__ == "__main__":
    main()
