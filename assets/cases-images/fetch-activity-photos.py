#!/usr/bin/env python3
"""为 Empact China 官网八大业务分区下的「全部活动」建立配图目录，并抓取可得的活动实拍图。

目录结构：
    assets/cases-images/<分区目录>/<日期-活动名>/<图片>

规则：
  - 八大分区沿用既有目录名（01-青少年-... ~ 08-企业-...）。
  - 分区内为每个**已办活动**建一个 `日期-活动名`（无明确日期时用 `活动名`）子目录。
  - 有实拍素材的活动，各下载 1–2 张**带人物的活动实拍图**（排除海报/证书/logo/截图/作业）。
  - 微盘中无实拍素材的活动保留空目录，待业务同事后续补充。
  - 图片统一压缩至体积 ≤2MB、最长边 ≤2000px。

用法：
    python3 fetch-activity-photos.py --plan     # 仅打印目录与抓取计划，不落盘
    python3 fetch-activity-photos.py            # 建目录 + 归置现有图 + 下载
    python3 fetch-activity-photos.py --download-only

依赖：wecom-cli（已授权）。微盘检索按「精确文件名」命中后下载。
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys

BASE = os.path.dirname(os.path.abspath(__file__))

MAX_IMAGE_BYTES = 2 * 1024 * 1024
MAX_IMAGE_DIM = 2000

SECTIONS: dict[str, list[str]] = {
    "01-青少年-社会创新月月营": [
        "2024.06.01-朝夕有爱助老志愿",
        "2024.10.20-善淘慈善超市",
        "2024.11.17-生物多样性纸莎草绘画",
        "2024.12.14-梦工坊咖啡",
        "2025.04.18-微软探索日孙楠圆梦行",
        "2025.05.10-陶氏化学探索日",
        "2025.06.22-紫砂壶博物馆定向越野",
        "2025.07-AI人工智能大会",
        "2025.08.12-优衣库上博东馆",
        "2025.08.17-盲人足球",
        "2025.10.26-DBS星展银行参访",
        "2025.11.08-黑暗中对话",
        "2025.11.23-性别平等剧本杀",
        "2026.03-卢湾辅读学校",
        "2026-可持续双碳月月营",
        "2026-崇明观鸟月月营",
        "2026.05.17-可口可乐企业参访",
        "2026.04.18-AIGC创意工作坊",
        "2026.05.31-朝夕有爱",
        "2026.06.28-华师大心智启航",
        "2026.07.20-WAIC人工智能大会",
        "2026-中欧公益协会亲子AIGC讲座",
        "2026-年度沙龙",
    ],
    "02-青少年-国际社会创新研学营": [
        "2024.01-新加坡研学营",
        "2024.07-新加坡研学营",
        "2025.02-新加坡研学营",
        "2025.07-新加坡研学营",
        "2026.02-新加坡研学营",
        "2026.08-新加坡研学营",
        "2024.07-中国香港研学营",
        "2025.01-中国香港研学营",
        "2025.07-中国香港研学营",
        "2026.02-中国香港研学营",
        "2026.07-中国香港研学营",
        "2026.02-日本东京研学营",
    ],
    "03-青少年-演讲与表达": [
        "2024.05.18-TEDx武康路开放麦",
        "2024.09.22-耀中少年说",
        "击剑俱乐部×Empact少年说",
        "赛先生科技创新演讲",
        "2025.01-SDGs演讲赋能营",
        "2025.08-SDGs演讲赋能营",
        "2025.12-SDGs演讲赋能营",
        "2026.07-SDGs演讲赋能营",
        "2025.03.23-少年说港大商学院",
        "2025.09.21-少年说杨浦双语",
        "2026.03.29-春季少年说",
        "2026.10.18-秋季少年说",
        "2026.08-文化主题演讲研学营",
        "希望之星ESDP辅导",
        "2025.01.09-光华中学",
        "2025.04-WLSA华盛怀少演讲",
        "2025.05-WLSA演讲比赛辅导",
        "2026.04-WLSA华盛怀少演讲",
        "杨浦双语演讲与SDGs课程",
        "Toastmasters青年演讲项目",
    ],
    "04-青少年-AI+与主题课程": [
        "2026春季-AI在线常规课程",
        "2026秋季-AI在线常规课程",
        "2026.02-AI思辨营",
        "2026暑期-AI思辨营",
        "VibeCodingAI少年影响力创造营",
        "2026.03-WLSA高中部PBL课后课程",
        "AIGC白名单赛事-备赛营",
        "AIGC白名单赛事-国赛",
        "2026.07-中海物业社区AI培训",
        "2026.01-CTBJunior全国论坛",
    ],
    "05-青少年-大学生与青年实践": [
        "2024.07-OfficeCamp实训SITP",
        "2025.01-OfficeCamp实训",
        "2025.07-OfficeCamp实训",
        "2026.02-OfficeCamp实训",
        "2026暑期-OfficeCamp实训",
        "2025-凯德乡村大学生职业认知研学营",
        "2026夏-日慈公益活动",
        "ChatCircles青年心理健康项目",
        "大学生长期志愿者陪伴计划",
    ],
    "06-企业-企业志愿者服务": [
        "2025-凯德ChatCircles志愿者活动",
        "DPWorld志愿者活动",
        "2026-一日孙项目",
        "2026-艾伯维公益合作台中",
    ],
    "07-企业-CSR与公益咨询": [
        "2025-凯德置地大学生项目CSR咨询",
        "2025-凯德ChatCircles影响力评估",
        "凯德BrownBag与TOC培训",
        "2025-香港置地CSR策划",
        "2026-嘉悦企业培训AI不能取代的能力",
        "ImpactMeasurement影响力评估培训",
        "2026-海亮心理项目",
        "凯德韧性社区Grant",
        "2026-ChinaWorkshop战略框架",
        "2026.06-艾尔建变革领导力淬炼",
    ],
    "08-企业-出海与跨文化支持": [
        "2025.11-中国AI之旅第一次",
        "2026.05-中国AI之旅第二次",
        "2026.10-中国AI之旅第三次",
        "2026.08.20-新加坡团队深圳团建",
        "2026.10-新加坡小六生沪杭之旅",
        "2026.10-新加坡大湾区AI之旅",
        "DoingGoodIndex2024报告",
        "DoingGoodIndex2025三地会议",
        "跨文化沟通力课程",
        "学虹参访交流",
        "2026.12-台湾荣田精机团建",
    ],
}

# (分区, 活动目录, 微盘路径片段, 微盘文件名, 本地保存名)
PHOTO_TARGETS: list[tuple[str, str, str, str, str]] = [
    # 01 月月营
    ("01-青少年-社会创新月月营", "2024.06.01-朝夕有爱助老志愿",
     "01 2024.6.1 朝夕有爱 中欧/02 朝夕有爱宣传推文/照片/朝夕有爱 志愿活动照片",
     "微信图片_20240618112849.jpg", "朝夕有爱-志愿活动1.jpg"),
    ("01-青少年-社会创新月月营", "2024.06.01-朝夕有爱助老志愿",
     "01 2024.6.1 朝夕有爱 中欧/02 朝夕有爱宣传推文/照片/朝夕有爱 志愿活动照片",
     "微信图片_20240618113200.jpg", "朝夕有爱-志愿活动2.jpg"),
    ("01-青少年-社会创新月月营", "2025.08.17-盲人足球",
     "10 2025.8.17 盲人足球活动/02 传播/盲足照片", "DSCF7687.JPG", "盲人足球-活动1.JPG"),
    ("01-青少年-社会创新月月营", "2025.08.17-盲人足球",
     "10 2025.8.17 盲人足球活动/02 传播/盲足照片", "DSCF7849.JPG", "盲人足球-活动2.JPG"),
    # 02 研学营
    ("02-青少年-国际社会创新研学营", "2024.01-新加坡研学营",
     "2024.1/12.传播/独立营 照片", "合照1.jpg", "新加坡研学营-合照1.jpg"),
    ("02-青少年-国际社会创新研学营", "2024.01-新加坡研学营",
     "2024.1/12.传播/独立营 照片", "HCSA合照.jpg", "新加坡研学营-HCSA合照.jpg"),
    ("02-青少年-国际社会创新研学营", "2024.07-新加坡研学营",
     "2024.7/07 媒体传播/照片", "合照THH.jpg", "新加坡研学营-合照THH.jpg"),
    ("02-青少年-国际社会创新研学营", "2024.07-新加坡研学营",
     "2024.7/07 媒体传播/照片", "结营.jpg", "新加坡研学营-结营.jpg"),
    ("02-青少年-国际社会创新研学营", "2025.02-新加坡研学营",
     "2025.2/15 媒体传播/照片", "到达合照.jpg", "新加坡研学营-到达合照.jpg"),
    ("02-青少年-国际社会创新研学营", "2025.02-新加坡研学营",
     "2025.2/15 媒体传播/照片", "开营.jpg", "新加坡研学营-开营.jpg"),
    ("02-青少年-国际社会创新研学营", "2025.01-中国香港研学营",
     "202501/00 香港营内容【原共享文档】/05 活动执行/04 学生管理/学员文章/Dora朱若旗",
     "微信图片_20250221105925.jpg", "香港研学营-学员记录1.jpg"),
    ("02-青少年-国际社会创新研学营", "2025.01-中国香港研学营",
     "202501/00 香港营内容【原共享文档】/05 活动执行/04 学生管理/学员文章/Ansel 雒子安",
     "微信图片_20250214144141.jpg", "香港研学营-学员记录2.jpg"),
    ("02-青少年-国际社会创新研学营", "2025.07-中国香港研学营",
     "202507/09 传播/01 学员文章", "IMG_1762-opq3776493215.jpg", "香港研学营-学员照片.jpg"),
    ("02-青少年-国际社会创新研学营", "2026.02-日本东京研学营",
     "04 东京营内容/05 活动执行/04 学生管理/学员文章/Ansel 雒子安",
     "微信图片_20250214144146.jpg", "日本研学营-学员记录.jpg"),
    ("02-青少年-国际社会创新研学营", "2026.02-日本东京研学营",
     "05 媒体传播/03 招生宣传推广/日本宣传照片", "日本学生.jpg", "日本研学营-学生.jpg"),
    # 04 AI+ 与主题课程
    ("04-青少年-AI+与主题课程", "2026.07-中海物业社区AI培训",
     "02社区培训/中海物业/0731中海建国里/照片", "IMG_5424.JPG", "社区AI培训-现场1.JPG"),
    ("04-青少年-AI+与主题课程", "2026.07-中海物业社区AI培训",
     "02社区培训/中海物业/0731中海建国里/照片", "IMG_5441.JPG", "社区AI培训-现场2.JPG"),
    # 06 企业志愿者
    ("06-企业-企业志愿者服务", "2026-艾伯维公益合作台中",
     "05 Abbvie艾伯维/07 活动照片和视频/台中/【已确认】可发布", "DSC00423.JPG", "艾伯维公益合作-现场1.JPG"),
    ("06-企业-企业志愿者服务", "2026-艾伯维公益合作台中",
     "05 Abbvie艾伯维/07 活动照片和视频/台中/【已确认】可发布", "DSC00496a.jpg", "艾伯维公益合作-现场2.jpg"),
]

# 现有散图 → 目标活动目录（归位，不重命名）
EXISTING_MOVES: list[tuple[str, str, str]] = [
    ("01-青少年-社会创新月月营", "月月营-中欧校友分会合照.jpg", "2024.06.01-朝夕有爱助老志愿"),
    ("01-青少年-社会创新月月营", "月月营-优衣库上博东馆.png", "2025.08.12-优衣库上博东馆"),
    ("01-青少年-社会创新月月营", "月月营-善淘超市捐赠.jpg", "2024.10.20-善淘慈善超市"),
    ("01-青少年-社会创新月月营", "志愿者-微软企业志愿.png", "2025.04.18-微软探索日孙楠圆梦行"),
    ("02-青少年-国际社会创新研学营", "研学营-新加坡站招募.jpg", "2024.01-新加坡研学营"),
    ("02-青少年-国际社会创新研学营", "研学营-日本宣传照.jpg", "2026.02-日本东京研学营"),
    ("02-青少年-国际社会创新研学营", "研学营-香港主画面.jpg", "2024.07-中国香港研学营"),
    ("03-青少年-演讲与表达", "演讲-SDGs赋能营.png", "2025.08-SDGs演讲赋能营"),
    ("03-青少年-演讲与表达", "演讲-少年说主画面.jpg", "2025.09.21-少年说杨浦双语"),
    ("04-青少年-AI+与主题课程", "AI-实战课课程图.jpg", "2026春季-AI在线常规课程"),
    ("04-青少年-AI+与主题课程", "AI-白名单赛事作品.jpg", "AIGC白名单赛事-国赛"),
    ("05-青少年-大学生与青年实践", "青年实践-OfficeCamp海报.jpg", "2025.01-OfficeCamp实训"),
    ("05-青少年-大学生与青年实践", "青年实践-新加坡实训营.jpg", "2025.07-OfficeCamp实训"),
    ("06-企业-企业志愿者服务", "志愿者-艾伯维活动.jpg", "2026-艾伯维公益合作台中"),
    ("07-企业-CSR与公益咨询", "CSR-凯德结营证书.png", "2025-凯德置地大学生项目CSR咨询"),
    ("07-企业-CSR与公益咨询", "CSR-凯德易拉宝.jpg", "2025-凯德置地大学生项目CSR咨询"),
    ("08-企业-出海与跨文化支持", "出海-学虹参访.jpg", "学虹参访交流"),
    ("08-企业-出海与跨文化支持", "出海-新加坡团队1.png", "2026.08.20-新加坡团队深圳团建"),
]


def run(cmd: list[str]) -> tuple[int, str]:
    p = subprocess.run(cmd, capture_output=True, text=True)
    return p.returncode, p.stdout


def search(keyword: str, limit: int = 100) -> list[dict]:
    payload = {"keywords": [keyword], "file_types": ["image"], "limit": limit}
    code, out = run(["wecom-cli", "disk", "files", "search", "--json", json.dumps(payload, ensure_ascii=False)])
    if code != 0:
        return []
    try:
        return json.loads(out).get("files", [])
    except json.JSONDecodeError:
        return []


def compress_if_needed(path: str) -> None:
    if not os.path.exists(path) or os.path.getsize(path) <= MAX_IMAGE_BYTES:
        return
    before = os.path.getsize(path)
    ext = os.path.splitext(path)[1].lower()
    tmp = path + ".tmp"
    try:
        run(["sips", "-Z", str(MAX_IMAGE_DIM), path, "--out", tmp])
        if os.path.exists(tmp) and os.path.getsize(tmp) < before:
            shutil.move(tmp, path)
        elif os.path.exists(tmp):
            os.remove(tmp)
        if os.path.getsize(path) > MAX_IMAGE_BYTES:
            target = os.path.splitext(path)[0] + ".jpg" if ext == ".png" else path
            run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "82", path, "--out", target])
            if os.path.exists(target) and os.path.getsize(target) < os.path.getsize(path):
                if target != path:
                    os.remove(path)
                path = target
        after = os.path.getsize(path)
        print(f"    ↳ 压缩 {os.path.basename(path)}：{before // 1024} KB → {after // 1024} KB")
    except Exception as exc:  # noqa: BLE001
        if os.path.exists(tmp):
            os.remove(tmp)
        print(f"    ! 压缩失败：{exc}", file=sys.stderr)


QUOTA_CODE = 640459  # 机器人当日获取微盘文件内容次数已达上限


def download(file_id: str, dest: str) -> tuple[bool, int | None]:
    """返回 (是否成功, 错误码)。错误码 640459 表示当日配额耗尽。"""
    code, out = run(["wecom-cli", "disk", "files", "download", "--json", json.dumps({"file_id": file_id})])
    if code != 0:
        print(f"    ! CLI 调用失败 (exit={code})：{out.strip()[:160]}", file=sys.stderr)
        return False, None
    try:
        data = json.loads(out)
    except json.JSONDecodeError:
        print(f"    ! 返回非 JSON：{out.strip()[:160]}", file=sys.stderr)
        return False, None
    if "error" in data:
        err = data["error"]
        ec = err.get("code")
        msg = err.get("message", "未知错误")
        if ec == QUOTA_CODE:
            print(f"    ⚠ 当日配额已用尽（{ec}）：{msg[:80]}", file=sys.stderr)
        else:
            print(f"    ! 下载失败（{ec}）：{msg[:120]}", file=sys.stderr)
        return False, ec
    src = data.get("file_path")
    if src and os.path.exists(src):
        shutil.copy(src, dest)
        size_kb = os.path.getsize(dest) // 1024
        print(f"    ✓ {os.path.basename(dest)}  ({size_kb} KB)")
        compress_if_needed(dest)
        return True, None
    print("    ! 返回中缺少 file_path", file=sys.stderr)
    return False, None


def build_dirs() -> None:
    total = 0
    for section, activities in SECTIONS.items():
        os.makedirs(os.path.join(BASE, section), exist_ok=True)
        for act in activities:
            os.makedirs(os.path.join(BASE, section, act), exist_ok=True)
            total += 1
    print(f"已建立分区 {len(SECTIONS)} 个、活动目录 {total} 个")


def move_existing() -> tuple[int, int]:
    ok = miss = 0
    for section, fname, act in EXISTING_MOVES:
        src = os.path.join(BASE, section, fname)
        dst_dir = os.path.join(BASE, section, act)
        os.makedirs(dst_dir, exist_ok=True)
        if not os.path.exists(src):
            if os.path.exists(os.path.join(dst_dir, fname)):
                continue
            print(f"  ! 缺失：{section}/{fname}", file=sys.stderr)
            miss += 1
            continue
        shutil.move(src, os.path.join(dst_dir, fname))
        print(f"  · 归位 {section}/{fname} → {act}/")
        ok += 1
    return ok, miss


def fetch_photos() -> tuple[int, int, list]:
    """下载实拍图。返回 (成功数, 失败数, 未完成目标列表)。遇到配额耗尽立即中止并记录剩余目标。"""
    ok = fail = 0
    pending: list = list(PHOTO_TARGETS)
    cache: dict[str, list[dict]] = {}
    for section, act, pathfrag, fname, local in PHOTO_TARGETS:
        folder = os.path.join(BASE, section, act)
        os.makedirs(folder, exist_ok=True)
        dest = os.path.join(folder, local)
        if os.path.exists(dest):
            print(f"  · 已存在：{act}/{local}")
            pending.remove((section, act, pathfrag, fname, local))
            continue
        key = fname
        if key not in cache:
            cache[key] = search(fname)
        hit = next(
            (f for f in cache[key] if f["file_name"] == fname and pathfrag in f.get("path", "")),
            None,
        )
        if not hit:
            print(f"  ! 未命中：{act} :: {fname}", file=sys.stderr)
            fail += 1
            continue
        print(f"[{act}] {fname}")
        success, errcode = download(hit["id"], dest)
        if success:
            ok += 1
            pending.remove((section, act, pathfrag, fname, local))
        elif errcode == QUOTA_CODE:
            fail += 1
            print("\n  ⚠ 检测到当日配额耗尽，已中止下载。剩余目标见 待补图片清单.md，请次日重跑本脚本。")
            break
        else:
            fail += 1
    return ok, fail, pending


def write_pending(pending: list) -> None:
    """记录尚未获取的图片目标，供次日续传。"""
    path = os.path.join(BASE, "待补图片清单.md")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("# 待补活动实拍图清单\n\n")
        fh.write("> 由 `fetch-activity-photos.py` 自动生成。微盘机器人每日取文件次数有限，")
        fh.write("次日重跑脚本即可续传（已存在的图片会自动跳过）。\n\n")
        fh.write(f"共 {len(pending)} 张：\n\n")
        fh.write("| 分区 | 活动 | 微盘文件名 |\n| --- | --- | --- |\n")
        for section, act, _frag, fname, _local in pending:
            fh.write(f"| {section} | {act} | {fname} |\n")
    print(f"已写入待补清单：待补图片清单.md（{len(pending)} 张）")


def scan_missing() -> list:
    """不联网，仅按本地磁盘状态算出尚未落盘的图片目标。"""
    missing = []
    for t in PHOTO_TARGETS:
        section, act, _frag, _fname, local = t
        if not os.path.exists(os.path.join(BASE, section, act, local)):
            missing.append(t)
    return missing


def main() -> int:
    if "--plan" in sys.argv:
        for section, activities in SECTIONS.items():
            print(f"\n{section}  ({len(activities)})")
            for a in activities:
                print(f"    {a}/")
        print(f"\n现有图归位 {len(EXISTING_MOVES)} 项；待下载 {len(PHOTO_TARGETS)} 张")
        return 0

    if "--pending" in sys.argv:
        missing = scan_missing()
        write_pending(missing)
        print(f"本地缺少 {len(missing)} 张目标图片（联网前预估）")
        return 0

    build_dirs()
    print("\n— 归置现有图片 —")
    moved, miss = move_existing()
    print(f"归位 {moved} 项，缺失 {miss} 项")

    print("\n— 下载活动实拍图 —")
    ok, fail, pending = fetch_photos()
    print(f"\n完成：下载成功 {ok}，失败 {fail}")
    if pending:
        write_pending(pending)
    else:
        p = os.path.join(BASE, "待补图片清单.md")
        if os.path.exists(p):
            os.remove(p)
        print("全部目标图片已就位，已清除待补清单。")
    return 0 if not pending else 1


if __name__ == "__main__":
    raise SystemExit(main())
