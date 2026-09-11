#!/usr/bin/env python3
"""解析《2026年Empact日历计划表》月度 CSV，还原为结构化活动台账。

表格是「日历网格」布局（0-based 列）：
  日期列：星期日=2，星期一=5，星期二=8，星期三=11，星期四=14，星期五=17，星期六=20
  日期行：一行内**多个**日期列填有 1–31 的日号，其右邻列是该日的农历/节日名。
  活动行：非日期行，日期列右邻列（+1）填活动名；该列本身有时是序号、有时为空。
  负责人行：活动行下方紧跟的若干行，同列含 `@姓名`。

行判定规则（关键）：
  - `date_cells` = 本行落在日期列且为 1–31 日号的单元格。
  - `date_cells` 数量 ≥ 2，或数量 = 1 且右邻是农历/节日 → **日期行**；
  - 否则若某日期列右邻列非空 → **活动行**。

输出：calendar-activities.json —— [{month, day, date, name, seq, status, owners}, ...]
"""
from __future__ import annotations

import csv
import json
import os
import re

BASE = os.path.dirname(os.path.abspath(__file__))

DATE_COLS = [2, 5, 8, 11, 14, 17, 20]
STATUS_SYMS = {"●", "○", "√", "×", "△", "✓", "◎"}

_LUNAR_DAY = re.compile(r"^(初[一二三四五六七八九十]|十[一二三四五六七八九]|二十|廿[一二三四五六七八九]|三十)$")
_LUNAR_MONTH = re.compile(r"^(正|一|二|三|四|五|六|七|八|九|十|十一|十二|冬|腊)月$")
_FESTIVAL = re.compile(
    r"(节|至|分|露|暑|雪|种|明|降|蛰|雨|满|立春|立夏|立秋|立冬"
    r"|除夕|春节|小年|元宵|端午|七夕|中秋|重阳|腊八|情人节|妇女|植树"
    r"|劳动|青年|儿童|建党|建军|教师|国庆|万圣|圣诞|元旦|纪念日|事变|权益日|消费者)$"
)
# 表格内置的模板示例行（单字母占位，非真实活动）
_PLACEHOLDER = re.compile(r"(?<![A-Za-z])[A-Z](?=项目|计划|预算)")


def is_placeholder(name: str) -> bool:
    return bool(_PLACEHOLDER.search(name))


def is_lunar(text: str) -> bool:
    """判断日期行右邻格是否为农历/节日名（用于区分日期行与活动行）。"""
    t = text.strip()
    if not t:
        return False
    return bool(_LUNAR_DAY.match(t)) or bool(_LUNAR_MONTH.match(t)) or bool(_FESTIVAL.search(t))


def parse_month(path: str, month: int) -> list[dict]:
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as fh:
        rows = list(csv.reader(fh))

    def cell(r: int, c: int) -> str:
        return rows[r][c].strip() if c < len(rows[r]) else ""

    # 1) 标记日期行，建立 (行, 列) → 日号
    date_at: dict[tuple[int, int], int] = {}
    for r, row in enumerate(rows):
        date_cells = [c for c in DATE_COLS if c < len(row) and row[c].strip().isdigit()
                      and 1 <= int(row[c].strip()) <= 31]
        is_date_row = len(date_cells) >= 2 or (
            len(date_cells) == 1 and is_lunar(cell(r, date_cells[0] + 1))
        )
        if is_date_row:
            for c in date_cells:
                date_at[(r, c)] = int(row[c].strip())

    # 2) 扫描活动行
    activities: list[dict] = []
    for r, row in enumerate(rows):
        date_cells = [c for c in DATE_COLS if c < len(row) and row[c].strip().isdigit()
                      and 1 <= int(row[c].strip()) <= 31]
        is_date_row = len(date_cells) >= 2 or (
            len(date_cells) == 1 and is_lunar(cell(r, date_cells[0] + 1))
        )
        if is_date_row:
            continue
        for c in DATE_COLS:
            name = cell(r, c + 1)
            if not name or name.startswith("@") or is_lunar(name):
                continue
            # 归属：向上最近的日期行同列
            day = next((date_at[(r0, c)] for r0 in range(r - 1, -1, -1) if (r0, c) in date_at), None)
            if day is None:
                continue
            seq_cell = cell(r, c)
            seq = int(seq_cell) if seq_cell.isdigit() else None
            status = cell(r, c + 2)
            if status not in STATUS_SYMS:
                status = ""
            # 负责人：向下直到遇下一个活动行/日期行
            owners: list[str] = []
            for r2 in range(r + 1, min(r + 5, len(rows))):
                nxt = cell(r2, c + 1)
                if nxt and not nxt.startswith("@"):
                    break
                chunk = " ".join(cell(r2, c + k) for k in (0, 1, 2))
                owners += re.findall(r"@([^\s@,]+)", chunk)
                if owners:
                    break
            activities.append({
                "month": month,
                "day": day,
                "date": f"2026-{month:02d}-{day:02d}",
                "name": name,
                "seq": seq,
                "status": status,
                "owners": owners,
                "placeholder": is_placeholder(name),
            })
    return activities


def main() -> None:
    all_acts: list[dict] = []
    for month in range(1, 13):
        acts = parse_month(os.path.join(BASE, f"cal-2026-{month:02d}.csv"), month)
        all_acts.extend(acts)
        print(f"  {month:2d} 月：{len(acts)} 项")
    out = os.path.join(BASE, "calendar-activities.json")
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(all_acts, fh, ensure_ascii=False, indent=2)
    print(f"\n合计 {len(all_acts)} 项 → calendar-activities.json")


if __name__ == "__main__":
    main()
