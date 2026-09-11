#!/usr/bin/env python3
"""抓取微盘在线表格《2026年Empact日历计划表》12 个月工作表的数据。

关键点：
  1. `wecom-cli sheet get/ranges get` 的 `--docid` 必须传 **docid**（e3_ 开头）；
     传 file_id 会返回授权错误 640008。
     docid 来自 `wecom-cli disk files search` 结果中的 `docid` 字段。
  2. 连续高频调用会触发 850005（aibot exceed tool call limit），需退避重试。

用法：
    python3 fetch-calendar.py                 # 抓取全部 12 个月
    python3 fetch-calendar.py --only 10,11,12 # 只抓指定月份
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time

BASE = os.path.dirname(os.path.abspath(__file__))
DOCID = "e3_AccA5AY9AOQCNTeDi3mykSg0L4wKQ"
SHEETS = {
    1: "000001", 2: "000002", 3: "000003", 4: "000004",
    5: "000005", 6: "000006", 7: "000007", 8: "000008",
    9: "000009", 10: "00000a", 11: "00000b", 12: "00000c",
}
RETRY_CODES = {850005, 640459}  # 频率超限 / 当日次数超限


def fetch(sheet_id: str, rows: int = 200) -> tuple[str, int]:
    cmd = [
        "wecom-cli", "sheet", "ranges", "get",
        "--docid", DOCID,
        "--sheet-id", sheet_id,
        "--range", f"A1:AI{rows}",
        "--mode", "csv",
    ]
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    try:
        data = json.loads(out)
    except json.JSONDecodeError:
        print(f"    返回非 JSON：{out[:120]}")
        return "", -1
    code = data.get("errcode", 0)
    if code:
        print(f"    errcode={code}: {data.get('errmsg', '')[:100]}")
        return "", code
    return data.get("content", ""), 0


def main() -> None:
    only = None
    if "--only" in sys.argv:
        only = {int(x) for x in sys.argv[sys.argv.index("--only") + 1].split(",")}

    months = [m for m in sorted(SHEETS) if only is None or m in only]
    for month in months:
        csv, code = "", -1
        for attempt in range(1, 5):
            csv, code = fetch(SHEETS[month])
            if code == 0:
                break
            if code in RETRY_CODES:
                wait = 15 * attempt
                print(f"    第 {attempt} 次受限，等待 {wait}s 重试…")
                time.sleep(wait)
            else:
                break
        if code != 0:
            print(f"  ✗ {month:2d} 月 抓取失败（errcode={code}），已有文件保持不变")
            continue
        path = os.path.join(BASE, f"cal-2026-{month:02d}.csv")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(csv)
        print(f"  ✓ {month:2d} 月 → cal-2026-{month:02d}.csv  ({csv.count(chr(10)) + 1} 行)")
    print("抓取完成")


if __name__ == "__main__":
    main()
