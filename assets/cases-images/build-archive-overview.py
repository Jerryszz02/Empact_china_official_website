#!/usr/bin/env python3
"""根据分区/活动定义与磁盘实际图片，生成 `归档总览.html` 与 `归档汇总.md`。

用法：
    python3 build-archive-overview.py

设计：
  - 分区与活动清单直接复用 `fetch-activity-photos.py` 的 SECTIONS，保持单一数据源。
  - 图片按活动目录实际内容扫描，无需手工维护。
  - 每次补图后重跑本脚本即可刷新两份归档文档。
"""
from __future__ import annotations

import html
import importlib.util
import os
import subprocess

BASE = os.path.dirname(os.path.abspath(__file__))
IMG_EXT = {".jpg", ".jpeg", ".png", ".webp", ".JPG", ".JPEG", ".PNG"}

spec = importlib.util.spec_from_file_location("fetch_mod", os.path.join(BASE, "fetch-activity-photos.py"))
fetch_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fetch_mod)
SECTIONS: dict[str, list[str]] = fetch_mod.SECTIONS


def dims(path: str) -> str:
    try:
        out = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", path],
                             capture_output=True, text=True).stdout
        w = h = "?"
        for line in out.splitlines():
            if "pixelWidth" in line:
                w = line.split(":")[-1].strip()
            elif "pixelHeight" in line:
                h = line.split(":")[-1].strip()
        return f"{w}×{h}"
    except Exception:  # noqa: BLE001
        return "?"


def collect() -> list[tuple[str, list[tuple[str, list[tuple[str, int, str]]]]]]:
    """返回 [(分区, [(活动, [(文件名, KB, 尺寸)])])]，保持 SECTIONS 顺序。"""
    result = []
    for section, activities in SECTIONS.items():
        acts = []
        for act in activities:
            folder = os.path.join(BASE, section, act)
            files = []
            if os.path.isdir(folder):
                for name in sorted(os.listdir(folder)):
                    fp = os.path.join(folder, name)
                    if os.path.splitext(name)[1] in IMG_EXT and os.path.isfile(fp):
                        files.append((name, os.path.getsize(fp) // 1024, dims(fp)))
            acts.append((act, files))
        result.append((section, acts))
    return result


def write_md(data) -> None:
    total_act = sum(len(a) for _, a in data)
    with_img = sum(1 for _, a in data for _, f in a if f)
    total_img = sum(len(f) for _, a in data for _, f in a)
    lines = [
        "# Empact China 官网 · 八大业务分区活动配图归档汇总",
        "",
        "- 来源：企业微信微盘（wecom-cli）",
        f"- 分区数：**{len(data)}**",
        f"- 活动目录：**{total_act}**（其中 **{with_img}** 个已有图片，**{total_act - with_img}** 个待补）",
        f"- 图片总数：**{total_img}**",
        "- 图片规则：>2MB 用 `sips` 缩至最长边 2000px；仍超限的 PNG 转同品质 JPEG",
        "",
    ]
    for section, acts in data:
        have = [a for a, f in acts if f]
        lines.append(f"## {section}")
        lines.append("")
        lines.append(f"活动 {len(acts)} 个 · 有图 {len(have)} 个 · 待补 {len(acts) - len(have)} 个")
        lines.append("")
        lines.append("| 活动 | 图片 | 体积 | 尺寸 |")
        lines.append("| --- | --- | --- | --- |")
        for act, files in acts:
            if files:
                for i, (n, kb, wh) in enumerate(files):
                    label = act if i == 0 else ""
                    lines.append(f"| {label} | {n} | {kb} KB | {wh} |")
            else:
                lines.append(f"| {act} | — 待补 — | | |")
        lines.append("")
    with open(os.path.join(BASE, "归档汇总.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")


def write_html(data) -> None:
    total_act = sum(len(a) for _, a in data)
    with_img = sum(1 for _, a in data for _, f in a if f)
    total_img = sum(len(f) for _, a in data for _, f in a)

    def esc(s: str) -> str:
        return html.escape(s, quote=True)

    parts = ["""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Empact China 官网 · 活动配图归档总览</title>
<style>
  :root{
    --bg:#f6f7f9; --panel:#ffffff; --line:#e4e7ec; --text:#1b1f24;
    --muted:#6b7280; --accent:#0f6f5c; --accent-soft:#e8f3f0; --todo:#8a94a6; --todo-soft:#f1f3f6;
    --shadow:0 1px 2px rgba(16,24,40,.06),0 4px 14px rgba(16,24,40,.05);
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);
    font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue",Segoe UI,sans-serif;
    -webkit-font-smoothing:antialiased;}
  .wrap{max-width:1220px;margin:0 auto;padding:40px 28px 72px;}
  header h1{font-size:24px;margin:0 0 6px;letter-spacing:.2px;}
  header p{margin:0;color:var(--muted);font-size:13.5px;line-height:1.7;}
  .stats{display:flex;gap:14px;flex-wrap:wrap;margin:24px 0 32px;}
  .stat{background:var(--panel);border:1px solid var(--line);border-radius:12px;
    padding:14px 20px;box-shadow:var(--shadow);min-width:132px;}
  .stat b{display:block;font-size:22px;line-height:1.2;}
  .stat span{font-size:12px;color:var(--muted);}
  .stat.ok b{color:var(--accent)}
  .theme{background:var(--panel);border:1px solid var(--line);border-radius:14px;
    padding:20px 22px 8px;margin-bottom:20px;box-shadow:var(--shadow);}
  .theme h2{font-size:15.5px;margin:0 0 2px;display:flex;align-items:center;gap:9px;flex-wrap:wrap;}
  .theme h2 em{font-style:normal;font-size:11px;font-weight:600;color:var(--accent);
    background:var(--accent-soft);border-radius:6px;padding:2px 8px;}
  .theme h2 em.todo{color:var(--todo);background:var(--todo-soft);}
  .theme .path{font-size:11.5px;color:var(--muted);margin:0 0 16px;
    font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}
  .act{margin:0 0 16px;border-top:1px dashed var(--line);padding-top:14px;}
  .act:first-of-type{border-top:0;padding-top:4px;}
  .act h3{font-size:13px;margin:0 0 10px;font-weight:600;display:flex;align-items:center;gap:8px;}
  .act h3 code{font-weight:400;font-size:11.5px;color:var(--muted);
    font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}
  .act h3 .badge{font-size:10.5px;font-weight:600;color:var(--todo);background:var(--todo-soft);
    border-radius:5px;padding:1px 7px;}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:16px;padding-bottom:6px;}
  figure{margin:0;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#fafbfc;display:flex;flex-direction:column;}
  figure .thumb{height:158px;background:#eef1f4;display:flex;align-items:center;justify-content:center;overflow:hidden;}
  figure img{max-width:100%;max-height:100%;object-fit:contain;display:block;}
  figcaption{padding:9px 11px;font-size:11.5px;line-height:1.5;}
  figcaption .n{display:block;font-weight:600;word-break:break-all;margin-bottom:2px;}
  figcaption .m{color:var(--muted);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10.5px;}
  .empty{font-size:12px;color:var(--todo);background:var(--todo-soft);border-radius:8px;
    padding:8px 12px;display:inline-block;}
  .foot{font-size:12px;color:var(--muted);line-height:1.9;border-top:1px dashed var(--line);margin-top:26px;padding-top:18px;}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Empact China 官网 · 八大业务分区活动配图归档</h1>
    <p>来源：企业微信微盘 ｜ 结构：<code>分区/日期-活动名/图片</code> ｜ 压缩：&gt;2MB 缩至 2000px，仍超限的 PNG 转 JPEG</p>
  </header>
"""]
    parts.append(f"""  <div class="stats">
    <div class="stat ok"><b>{total_img}</b><span>已归档图片</span></div>
    <div class="stat"><b>{with_img}</b><span>已有图活动</span></div>
    <div class="stat"><b>{total_act}</b><span>活动目录总数</span></div>
    <div class="stat"><b>{total_act - with_img}</b><span>待补图活动</span></div>
  </div>
""")

    for section, acts in data:
        have = [a for a, f in acts if f]
        parts.append(f'  <section class="theme">')
        parts.append(f'    <h2>{esc(section)} <em>有图 {len(have)}</em> <em class="todo">待补 {len(acts) - len(have)}</em></h2>')
        parts.append(f'    <p class="path">{esc(section)}/</p>')
        for act, files in acts:
            parts.append('    <div class="act">')
            if files:
                parts.append(f'      <h3>{esc(act)} <code>{len(files)} 张</code></h3>')
                parts.append('      <div class="grid">')
                for n, kb, wh in files:
                    src = f"{section}/{act}/{n}"
                    parts.append(
                        f'        <figure><div class="thumb"><img src="{esc(src)}" alt="{esc(act)}" loading="lazy"></div>'
                        f'<figcaption><span class="n">{esc(n)}</span><span class="m">{kb} KB · {wh}</span></figcaption></figure>'
                    )
                parts.append('      </div>')
            else:
                parts.append(f'      <h3>{esc(act)} <span class="badge">待补图</span></h3>')
            parts.append('    </div>')
        parts.append('  </section>\n')

    parts.append("""  <p class="foot">
    <strong>说明：</strong>活动目录按 8 大分区 × 全部已办活动建立，共 %d 个；其中 %d 个已配图，%d 个暂无实拍素材，保留空目录待业务补充。<br>
    微盘并非活动照片库，多数活动目录仅存方案/复盘/PPT，实拍图集中在「照片 / 活动执行 / 学员文章 / 传播」子目录，故有图活动占比有限。<br>
    本页由 <code>build-archive-overview.py</code> 自动生成，补图后重跑脚本即可刷新。
  </p>
</div>
</body>
</html>
""" % (total_act, with_img, total_act - with_img))

    with open(os.path.join(BASE, "归档总览.html"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(parts))


def main() -> None:
    data = collect()
    write_md(data)
    write_html(data)
    total_act = sum(len(a) for _, a in data)
    with_img = sum(1 for _, a in data for _, f in a if f)
    total_img = sum(len(f) for _, a in data for _, f in a)
    print(f"已生成 归档总览.html / 归档汇总.md：活动 {total_act} 个，有图 {with_img} 个，图片 {total_img} 张")


if __name__ == "__main__":
    main()
