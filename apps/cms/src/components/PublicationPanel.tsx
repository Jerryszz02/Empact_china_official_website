"use client";
import { useCallback, useEffect, useState } from "react";

type Item = {
  id: string;
  title: string;
  kind: string;
  approved: boolean;
  live: boolean;
  modified: boolean;
  url: string;
};
type Receipt = {
  id: string;
  version: string;
  state: string;
  startedAt: string;
  error?: string;
};
const names: Record<string, string> = {
  page: "固定页面",
  business: "业务",
  project: "项目",
  news: "自有动态",
  coverage: "外部报道",
  case: "案例",
  publishing: "发布中",
  published: "已上线",
  unpublished: "已下线",
  rolled_back: "已恢复",
  failed: "失败",
};
export function PublicationPanel() {
  const [items, setItems] = useState<Item[]>([]),
    [receipts, setReceipts] = useState<Receipt[]>([]);
  const [selected, setSelected] = useState<string[]>([]),
    [company, setCompany] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState(
      "保存内容后，在这里选择本次要操作的条目。",
    ),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState(""),
    [version, setVersion] = useState(""),
    [current, setCurrent] = useState("");
  const refresh = useCallback(async () => {
    const response = await fetch("/api/publication/state", {
      cache: "no-store",
    });
    if (!response.ok) return;
    const data = await response.json();
    setItems(data.items);
    setReceipts(data.receipts);
    setCurrent(data.currentVersion || "尚未发布");
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!busy) return;
    const interval = setInterval(() => {
      void refresh();
    }, 2000);
    return () => clearInterval(interval);
  }, [busy, refresh]);
  async function action(type: string, receiptId?: string) {
    setBusy(true);
    setPreview("");
    setMessage(
      type === "preview"
        ? "正在生成受保护预览…"
        : "正在构建并检查线上版本，请勿关闭本页…",
    );
    try {
      const response = await fetch(`/api/publication/${type}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ids: selected,
          includeCompany: company,
          confirmed,
          version,
          receiptId,
        }),
      });
      const data = await response.json();
      setMessage(
        data.message || data.error || "操作失败，请刷新后查看发布记录。",
      );
      if (data.previewUrl) setPreview(data.previewUrl);
      if (response.ok) setConfirmed(false);
    } catch {
      setMessage("连接中断，请刷新发布记录核对结果，避免重复提交。");
    } finally {
      setBusy(false);
      await refresh();
    }
  }
  return (
    <section className="publication-panel" aria-label="发布控制">
      <h2>内容预览与发布</h2>
      <p>当前官网版本：{current}</p>
      <p>
        保存草稿不会改变官网。先选择条目并预览，确认后再发布。首次发布请同时选择全部固定页面与公司公开资料。
      </p>
      <fieldset disabled={busy}>
        <legend>本次内容</legend>
        <button
          type="button"
          onClick={() => {
            setSelected(items.map((item) => item.id));
            setConfirmed(false);
          }}
        >
          选择全部
        </button>{" "}
        <button type="button" onClick={() => setSelected([])}>
          清空选择
        </button>{" "}
        <button type="button" onClick={() => void refresh()}>
          刷新内容
        </button>
        <div className="publication-items">
          {items.map((item) => (
            <label key={item.id}>
              <input
                type="checkbox"
                checked={selected.includes(item.id)}
                onChange={(event) => {
                  setSelected(
                    event.target.checked
                      ? [...selected, item.id]
                      : selected.filter((id) => id !== item.id),
                  );
                  setConfirmed(false);
                }}
              />
              <span>
                {item.title} · {names[item.kind]} ·{" "}
                {item.approved ? "已审核" : "草稿"}
                {item.live
                  ? item.modified
                    ? " · 有未发布修改"
                    : " · 与官网一致"
                  : ""}
              </span>
              {item.live && item.url && (
                <a
                  href={`https://empact.cn${item.url}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  查看官网
                </a>
              )}
            </label>
          ))}
        </div>
        <label>
          <input
            type="checkbox"
            checked={company}
            onChange={(event) => {
              setCompany(event.target.checked);
              setConfirmed(false);
            }}
          />{" "}
          包含公司公开资料的修改
        </label>
      </fieldset>
      <div className="publication-actions">
        <button
          type="button"
          disabled={busy || (!selected.length && !company)}
          onClick={() => void action("preview")}
        >
          生成预览
        </button>
        {preview && (
          <a href={preview} target="_blank" rel="noreferrer">
            打开受保护预览 ↗
          </a>
        )}
      </div>
      <label>
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy}
          onChange={(event) => setConfirmed(event.target.checked)}
        />{" "}
        我已核对内容、公开授权及关联影响，确认本次发布、下线或恢复操作。
      </label>
      <div className="publication-actions">
        <button
          type="button"
          disabled={busy || !confirmed || (!selected.length && !company)}
          onClick={() => void action("publish")}
        >
          确认发布所选内容
        </button>
        <button
          type="button"
          disabled={busy || !confirmed || !selected.length}
          onClick={() => void action("unpublish")}
        >
          下线所选内容
        </button>
      </div>
      <label>
        恢复一个成功版本{" "}
        <select
          value={version}
          onChange={(event) => {
            setVersion(event.target.value);
            setConfirmed(false);
          }}
          disabled={busy}
        >
          <option value="">请选择版本</option>
          {receipts
            .filter((receipt) =>
              ["published", "unpublished", "rolled_back"].includes(
                receipt.state,
              ),
            )
            .map((receipt) => (
              <option key={receipt.id} value={receipt.version}>
                {receipt.startedAt} · {receipt.version}
              </option>
            ))}
        </select>
      </label>
      <button
        type="button"
        disabled={busy || !confirmed || !version}
        onClick={() => void action("rollback")}
      >
        恢复所选版本
      </button>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {receipts.length > 0 && (
        <details>
          <summary>发布记录（最近 {Math.min(receipts.length, 10)} 次）</summary>
          <ul>
            {receipts.slice(0, 10).map((receipt) => (
              <li key={receipt.id}>
                {names[receipt.state] || receipt.state} · {receipt.startedAt} ·{" "}
                {receipt.version}
                {receipt.error && <p>{receipt.error}</p>}
                {receipt.state === "failed" && (
                  <button
                    type="button"
                    disabled={busy || !confirmed}
                    onClick={() => void action("retry", receipt.id)}
                  >
                    重试此版本
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
