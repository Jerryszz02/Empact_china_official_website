#!/usr/bin/env python3
"""检索微盘「01 公司介绍」空间及相关资料，为官网『关于 Empact』页面收集素材。

用法：
    python3 公司介绍-微盘检索.py            # 全量检索并写入 company-profile-index.json
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "company-profile-index.json")

KEYWORDS = [
    # 空间/主题
    "公司介绍", "公司简介", "关于我们", "关于Empact", "Empact简介", "机构介绍",
    # 品牌与宣传
    "品牌介绍", "品牌手册", "宣传册", "简介PPT", "机构画册", "宣传片", "介绍视频",
    # 资质与荣誉
    "营业执照", "资质", "荣誉", "奖项", "证书", "登记证书", "组织架构", "团队介绍",
    # 业务与影响
    "公司概览", "业务介绍", "影响力报告", "年度报告", "社会影响力", "ESG", "CSR",
    # 简介类文档
    "Introduction", "Profile", "About", "Empact",
]

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
    # 失败时返回体为 {errcode, errmsg, results_json}
    if "errcode" in data and data.get("errcode") not in (0, None):
        return [], int(data["errcode"])
    return data.get("files", []), 0


def main() -> None:
    records: dict[str, dict] = {}
    counts: dict[str, int] = {}
    errors: dict[str, int] = {}

    for i, kw in enumerate(KEYWORDS, 1):
        files, code = [], -1
        for attempt in range(1, 4):
            files, code = search(kw)
            if code == 0:
                break
            if code in RETRY_CODES:
                wait = 10 * attempt
                print(f"  [{i}/{len(KEYWORDS)}] {kw} 受限({code})，等待 {wait}s…", flush=True)
                time.sleep(wait)
            else:
                break
        if code != 0:
            print(f"  [{i}/{len(KEYWORDS)}] {kw} 失败 errcode={code}", flush=True)
            errors[kw] = code
            continue
        counts[kw] = len(files)
        for f in files:
            key = f.get("id") or f.get("path")
            if key:
                records[key] = f
        print(f"  [{i}/{len(KEYWORDS)}] {kw}: {len(files)} 条", flush=True)
        time.sleep(1.0)

    result = {
        "keywords": counts,
        "errors": errors,
        "files": sorted(records.values(), key=lambda x: x.get("path", "")),
    }
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(result, fh, ensure_ascii=False, indent=2)
    print(f"\n索引完成：{len(records)} 个不重复文件 → {OUT}")


if __name__ == "__main__":
    main()
