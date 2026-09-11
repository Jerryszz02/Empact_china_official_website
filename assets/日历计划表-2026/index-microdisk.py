#!/usr/bin/env python3
"""批量检索微盘，建立「2026 活动相关文件」索引，供本地匹配验证活动是否真实办过。

用法：
    python3 index-microdisk.py            # 全量检索并写入 microdisk-index.json
    python3 index-microdisk.py --probe    # 仅用少量关键词试探配额

输出：microdisk-index.json
    {"keywords": {kw: count}, "paths": ["...", ...], "folders": ["...", ...]}
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "microdisk-index.json")

# 覆盖 2026 年各业务活动的检索词
KEYWORDS = [
    "2026年", "2026.",
    # 月月营 / 社创活动
    "月月营", "慈善超市", "朝夕有爱", "盲人足球", "观鸟", "双碳", "辅读学校", "卢湾",
    # 研学营
    "香港研学", "新加坡研学", "日本研学", "东京营", "剑桥",
    # 演讲与表达
    "少年说", "演讲赋能营", "文化主题演讲", "WLSA", "华盛怀少", "圣华紫竹",
    # AI 与主题课程
    "AI 在线课程", "AI在线课程", "思辨营", "Vibe coding", "AIGC", "白名单", "备赛营",
    # 大学生与青年
    "OfficeCamp", "日慈", "Chat Circle",
    # 企业业务
    "凯德", "艾伯维", "abbvie", "艾尔建", "嘉悦", "海亮", "荣田", "一日孙",
    "DPWorld", "可口可乐", "微软", "中海物业",
    # 出海与跨文化
    "中国 AI 之旅", "中国AI之旅", "新加坡团队", "小六生", "沪杭",
    # 其他专项
    "青戈", "黑客松", "CTB", "华师大", "WAIC", "暑托班", "申时茶会", "年卡",
]

PROBE_KEYWORDS = ["2026年", "月月营", "少年说", "OfficeCamp", "凯德"]
RETRY_CODES = {850005, 640459}


def search(keyword: str, limit: int = 100) -> tuple[list[dict], int]:
    payload = {"keywords": [keyword], "limit": limit}
    out = subprocess.run(
        ["wecom-cli", "disk", "files", "search", "--json", json.dumps(payload, ensure_ascii=False)],
        capture_output=True, text=True,
    ).stdout
    try:
        data = json.loads(out)
    except json.JSONDecodeError:
        return [], -1
    if "error" in data:
        return [], data["error"].get("code", -1)
    return data.get("files", []), 0


def main() -> None:
    probe = "--probe" in sys.argv
    keywords = PROBE_KEYWORDS if probe else KEYWORDS

    all_paths: set[str] = set()
    folders: set[str] = set()
    counts: dict[str, int] = {}
    for i, kw in enumerate(keywords, 1):
        files, code = [], -1
        for attempt in range(1, 4):
            files, code = search(kw)
            if code == 0:
                break
            if code in RETRY_CODES:
                wait = 10 * attempt
                print(f"  [{i}/{len(keywords)}] {kw} 受限({code})，等待 {wait}s…")
                time.sleep(wait)
            else:
                break
        if code != 0:
            print(f"  [{i}/{len(keywords)}] {kw} 失败 errcode={code}")
            counts[kw] = -1
            continue
        counts[kw] = len(files)
        for f in files:
            p = f.get("path", "")
            if p:
                all_paths.add(p)
                folders.add(os.path.dirname(p))
        print(f"  [{i}/{len(keywords)}] {kw}: {len(files)} 条")
        time.sleep(0.6)

    result = {
        "keywords": counts,
        "paths": sorted(all_paths),
        "folders": sorted(folders),
    }
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(result, fh, ensure_ascii=False, indent=2)
    print(f"\n索引完成：{len(all_paths)} 条路径 / {len(folders)} 个目录 → microdisk-index.json")


if __name__ == "__main__":
    main()
