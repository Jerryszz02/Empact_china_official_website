#!/usr/bin/env python3
"""为 Empact China 官网 8 个业务主题从企业微信微盘抓取案例配图。

用法：
    python3 fetch-case-images.py            # 抓取全部缺失图片
    python3 fetch-case-images.py --list     # 只打印映射，不下载

依赖：wecom-cli（已完成授权）。脚本按「主题关键词 + 精确文件名」在微盘检索，
命中后下载到同主题子目录，已存在的文件会跳过。
下载后自动压缩：体积 > 2MB 的图片会用 macOS 自带 sips 缩到最长边 2000px，
仍超限的 PNG 转为同品质 JPEG（例如 43MB 的「凯德 易拉宝.png」）。

关于主题 8「出海与跨文化支持」：微盘内没有直接的活动图，脚本按既定策略
使用相关素材（新加坡团队、参访实拍）作为占位，待公司确认后再替换。

注意：微盘对机器人「按当日获取文件内容」有次数限制（错误码 640459），
     超出后需等次日再跑；本脚本遇到该错误会继续处理其余项并汇总报告。
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys

BASE = os.path.dirname(os.path.abspath(__file__))

# 图片体积上限与最长边上限：超过即用 sips 压缩（网页用图，2MB / 2000px 足够）。
MAX_IMAGE_BYTES = 2 * 1024 * 1024
MAX_IMAGE_DIM = 2000

# (主题目录, 检索关键词, 微盘文件名, 本地保存名)
TARGETS: list[tuple[str, str, str, str]] = [
    # 01 社会创新月月营
    ("01-青少年-社会创新月月营", "月月营", "优衣库 月月营.png", "月月营-优衣库上博东馆.png"),
    ("01-青少年-社会创新月月营", "善淘", "善淘捐赠证书.jpg", "月月营-善淘超市捐赠.jpg"),
    ("01-青少年-社会创新月月营", "国际", "国际分会合照.jpg", "月月营-中欧校友分会合照.jpg"),
    # 02 国际社会创新研学营
    ("02-青少年-国际社会创新研学营", "新加坡营", "国际永续社创营-新加坡站-ceibs.jpg", "研学营-新加坡站招募.jpg"),
    ("02-青少年-国际社会创新研学营", "研学", "研学营rgb.jpg", "研学营-香港主画面.jpg"),
    ("02-青少年-国际社会创新研学营", "日本", "日本学3.jpg", "研学营-日本宣传照.jpg"),
    # 03 演讲与表达
    ("03-青少年-演讲与表达", "少年说", "少年说主画面 横板.png", "演讲-少年说主画面.png"),
    ("03-青少年-演讲与表达", "演讲", "演讲营.png", "演讲-SDGs赋能营.png"),
    # 04 AI+ 与主题课程
    ("04-青少年-AI+与主题课程", "AI课程", "Empact AI实战课 课程列表图 AI版.png", "AI-实战课课程图.png"),
    ("04-青少年-AI+与主题课程", "AI", "GS_AI回声森林_1.jpg", "AI-白名单赛事作品.jpg"),
    # 05 大学生与青年实践
    ("05-青少年-大学生与青年实践", "实训", "新加坡·青年职业实训营 (3).jpg", "青年实践-新加坡实训营.jpg"),
    ("05-青少年-大学生与青年实践", "Chat", "WechatIMG90.jpg", "青年实践-OfficeCamp海报.jpg"),
    # 06 企业志愿者服务
    ("06-企业-企业志愿者服务", "志愿者", "Empact微软志愿者活动.png", "志愿者-微软企业志愿.png"),
    ("06-企业-企业志愿者服务", "Chat", "WechatIMG300.jpg", "志愿者-艾伯维活动.jpg"),
    # 07 CSR 与公益咨询
    ("07-企业-CSR与公益咨询", "凯德", "凯德结营证书.png", "CSR-凯德结营证书.png"),
    ("07-企业-CSR与公益咨询", "凯德", "凯德 易拉宝.png", "CSR-凯德易拉宝.png"),
    # 08 企业出海与跨文化支持
    ("08-企业-出海与跨文化支持", "新加坡", "Empact新加坡1.png", "出海-新加坡团队1.png"),
    ("08-企业-出海与跨文化支持", "参访", "学虹参访.jpg", "出海-学虹参访.jpg"),
]


def run(cmd: list[str]) -> tuple[int, str]:
    p = subprocess.run(cmd, capture_output=True, text=True)
    return p.returncode, p.stdout


def search(keyword: str, limit: int = 30) -> list[dict]:
    payload = {"keywords": [keyword], "file_types": ["image"], "limit": limit}
    code, out = run(["wecom-cli", "disk", "files", "search", "--json", json.dumps(payload, ensure_ascii=False)])
    if code != 0:
        print(f"  ! 检索失败（{keyword}）", file=sys.stderr)
        return []
    try:
        return json.loads(out).get("files", [])
    except json.JSONDecodeError:
        print(f"  ! 检索结果无法解析（{keyword}）", file=sys.stderr)
        return []


def download(file_id: str, dest: str) -> bool:
    code, out = run(["wecom-cli", "disk", "files", "download", "--json", json.dumps({"file_id": file_id})])
    if code != 0:
        print(f"  ! 下载失败：{os.path.basename(dest)}", file=sys.stderr)
        return False
    try:
        data = json.loads(out)
    except json.JSONDecodeError:
        return False
    if "error" in data:
        print(f"  ! {data['error'].get('message', '未知错误')}", file=sys.stderr)
        return False
    src = data.get("file_path")
    if src and os.path.exists(src):
        shutil.copy(src, dest)
        print(f"  ✓ {os.path.basename(dest)}  ({os.path.getsize(dest) // 1024} KB)")
        compress_if_needed(dest)
        return True
    return False


def compress_if_needed(path: str, max_bytes: int = MAX_IMAGE_BYTES, max_dim: int = MAX_IMAGE_DIM) -> None:
    """用 macOS 自带 sips 压缩过大的图片；超限的 PNG 转为 JPEG 以显著减小体积。

    原地处理，若 PNG 转为 JPEG 会删除原文件并保留同名 .jpg，返回新路径由调用方忽略。
    """
    if not os.path.exists(path) or os.path.getsize(path) <= max_bytes:
        return
    before = os.path.getsize(path)
    ext = os.path.splitext(path)[1].lower()
    tmp = path + ".tmp"
    try:
        # 先限制最长边，再做质量压缩。
        run(["sips", "-Z", str(max_dim), path, "--out", tmp])
        if os.path.exists(tmp) and os.path.getsize(tmp) < before:
            shutil.move(tmp, path)
        elif os.path.exists(tmp):
            os.remove(tmp)

        if os.path.getsize(path) > max_bytes:
            q = "82"
            target = path
            fmt = "jpeg" if ext in (".png", ".tiff", ".bmp") else "jpeg"
            if ext == ".png":
                target = os.path.splitext(path)[0] + ".jpg"
            run(["sips", "-s", "format", fmt, "-s", "formatOptions", q, path, "--out", target])
            if os.path.exists(target) and os.path.getsize(target) < os.path.getsize(path):
                if target != path:
                    os.remove(path)
                path = target
        after = os.path.getsize(path)
        print(f"  ↳ 压缩 {os.path.basename(path)}：{before // 1024} KB → {after // 1024} KB")
    except Exception as exc:  # noqa: BLE001 - 压缩失败不应阻断主流程
        if os.path.exists(tmp):
            os.remove(tmp)
        print(f"  ! 压缩失败（{os.path.basename(path)}）：{exc}", file=sys.stderr)


def main() -> int:
    list_only = "--list" in sys.argv
    if list_only:
        for theme, kw, fname, local in TARGETS:
            print(f"{theme}\t[{kw}] {fname} -> {local}")
        return 0

    ok = fail = skip = 0
    cache: dict[str, list[dict]] = {}
    for theme, kw, fname, local in TARGETS:
        folder = os.path.join(BASE, theme)
        os.makedirs(folder, exist_ok=True)
        dest = os.path.join(folder, local)
        if os.path.exists(dest):
            print(f"  · 跳过已存在：{local}")
            skip += 1
            continue
        print(f"[{theme}] {fname}")
        if kw not in cache:
            cache[kw] = search(kw)
        hit = next((f for f in cache[kw] if f["file_name"] == fname), None)
        if not hit:
            print(f"  ! 未在微盘检索到：{fname}", file=sys.stderr)
            fail += 1
            continue
        if download(hit["id"], dest):
            ok += 1
        else:
            fail += 1

    print(f"\n完成：成功 {ok}，失败 {fail}，跳过 {skip}")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
