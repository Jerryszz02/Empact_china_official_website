"use client";

import { CreateContentButton } from "./CreateContentButton.js";
import { useEffect, useMemo, useState } from "react";

type Item = {
  id: string;
  title: string;
  kind: string;
  segment?: "youth" | "corporate";
  parentId?: string;
  summary?: string;
  slug: string;
  order?: number;
  live?: boolean;
  modified?: boolean;
  approved?: boolean;
  url?: string;
  publishedAt?: string;
  lastError?: string;
  lastAction?: string;
};

const segmentLabels = { corporate: "企业服务", youth: "青少年与青年" } as const;

function status(item: Item) {
  if (item.lastError) return { label: "操作失败 · 可重试", tone: "changed" };
  if (item.live && item.modified)
    return { label: "已上线 · 有修改", tone: "changed" };
  if (item.live) return { label: "已上线", tone: "live" };
  return {
    label: item.lastAction === "unpublished" ? "已撤下" : "草稿",
    tone: "draft",
  };
}

export function BusinessAdminDashboard() {
  const [items, setItems] = useState<Item[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    setError("");
    try {
      const response = await fetch("/api/business-admin/state", {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "业务数据暂时无法加载");
      setItems(Array.isArray(data.items) ? data.items : []);
      setSelectedId((current) =>
        current && data.items.some((item: Item) => item.id === current)
          ? current
          : data.items.find((item: Item) => item.kind === "business")?.id,
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "业务数据暂时无法加载",
      );
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const businesses = useMemo(
    () =>
      items
        .filter((item) => item.kind === "business")
        .sort((a, b) => (a.order || 0) - (b.order || 0)),
    [items],
  );
  const selected =
    businesses.find((item) => item.id === selectedId) || businesses[0];
  const cases = selected
    ? items
        .filter((item) => item.parentId === selected.id && item.kind === "case")
        .sort(
          (a, b) =>
            (Date.parse(b.publishedAt || "") || 0) -
            (Date.parse(a.publishedAt || "") || 0),
        )
    : [];

  async function action(
    type: "preview" | "publish" | "unpublish" | "delete",
    item: Item,
  ) {
    if (
      type === "delete" &&
      !window.confirm(
        `确定删除“${item.title}”？已上线内容会先撤下；有依赖的业务无法删除。`,
      )
    )
      return;
    if (
      (type === "publish" || type === "unpublish") &&
      !window.confirm(
        type === "publish"
          ? `发布“${item.title}”？请确认已保存最新修改。`
          : `撤下“${item.title}”？`,
      )
    )
      return;
    setBusy(true);
    setMessage("");
    setError("");
    setResultUrl("");
    try {
      const response = await fetch(`/api/business-admin/${type}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: item.id, confirmed: true }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "操作失败，请先保存内容后重试");
      setMessage(data.message || "操作完成");
      setResultUrl(data.previewUrl || data.url || "");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="business-admin" aria-label="业务与案例管理">
      <header className="business-admin__hero">
        <div>
          <p className="eyebrow">EMPACT CONTENT STUDIO</p>
          <h1>业务与案例</h1>
          <p>把业务方向、案例内容和官网状态放在同一个工作台。</p>
        </div>
        <CreateContentButton kind="business" label="+ 新建业务" />
      </header>
      {message && (
        <p className="admin-notice" role="status">
          {message}
          {resultUrl && (
            <>
              {" "}
              <a href={resultUrl} target="_blank" rel="noreferrer">
                打开结果页面 ↗
              </a>
            </>
          )}
        </p>
      )}
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      <div className="business-admin__layout">
        <section
          className="business-list"
          aria-labelledby="business-list-title"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">业务类型</p>
              <h2 id="business-list-title">选择要管理的业务</h2>
            </div>
            <button
              className="button button--quiet"
              onClick={() => void refresh()}
              disabled={busy}
            >
              刷新
            </button>
          </div>
          {businesses.length === 0 ? (
            <div className="empty-state">
              <strong>还没有业务方向</strong>
              <p>先创建一个业务，再把案例放到对应业务下。</p>
              <CreateContentButton kind="business" label="创建第一个业务" />
            </div>
          ) : (
            <div className="business-cards">
              {(["corporate", "youth"] as const).map((segment) => (
                <section key={segment}>
                  <h3>{segmentLabels[segment]}</h3>
                  {businesses
                    .filter((item) => item.segment === segment)
                    .map((item) => {
                      const current = status(item);
                      return (
                        <button
                          key={item.id}
                          className={`business-card ${selected?.id === item.id ? "is-selected" : ""}`}
                          onClick={() => setSelectedId(item.id)}
                        >
                          <span className="business-card__mark">
                            {item.segment
                              ? segmentLabels[item.segment]
                              : "业务方向"}
                          </span>
                          <strong>{item.title}</strong>
                          <span>{item.summary || "还没有导读"}</span>
                          <em className={`status status--${current.tone}`}>
                            {current.label}
                          </em>
                        </button>
                      );
                    })}
                </section>
              ))}
            </div>
          )}
        </section>
        {selected && (
          <section
            className="business-detail"
            aria-labelledby="business-detail-title"
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">当前业务</p>
                <h2 id="business-detail-title">{selected.title}</h2>
                <p>
                  {selected.summary ||
                    "为这项业务补充一段导读，让团队和访客快速理解它。"}
                </p>
              </div>
              <a
                className="button button--secondary"
                href={`/admin/collections/content/${selected.id}`}
              >
                编辑介绍
              </a>
            </div>
            <div className="detail-toolbar">
              <div className="case-row__actions">
                <button
                  className="button button--quiet"
                  disabled={busy}
                  onClick={() => void action("preview", selected)}
                >
                  预览草稿
                </button>
                <button
                  className="button button--primary"
                  disabled={busy}
                  onClick={() => void action("publish", selected)}
                >
                  {selected.live ? "发布更新" : "发布到官网"}
                </button>
                {selected.live && (
                  <button
                    className="button button--quiet"
                    disabled={busy}
                    onClick={() => void action("unpublish", selected)}
                  >
                    撤下
                  </button>
                )}
                <button
                  className="button button--danger"
                  disabled={busy}
                  onClick={() => void action("delete", selected)}
                >
                  删除
                </button>
              </div>
              <CreateContentButton
                kind="case"
                parentId={selected.id}
                label="+ 新建案例"
              />
            </div>
            <div className="case-list">
              <div className="case-list__head">
                <h3>案例内容</h3>
                <span>{cases.length} 个案例</span>
              </div>
              {cases.length === 0 ? (
                <div className="empty-state empty-state--small">
                  <strong>这个业务还没有案例</strong>
                  <p>新建一个案例后，它会自动出现在这里。</p>
                  <CreateContentButton
                    kind="case"
                    parentId={selected.id}
                    label="创建案例"
                  />
                </div>
              ) : (
                cases.map((item) => {
                  const current = status(item);
                  return (
                    <article className="case-row" key={item.id}>
                      <div className="case-row__body">
                        <span className={`status status--${current.tone}`}>
                          {current.label}
                        </span>
                        <h3>{item.title}</h3>
                        <p>{item.summary || "暂无摘要"}</p>
                        {item.lastError && (
                          <p className="admin-error">{item.lastError}</p>
                        )}
                      </div>
                      <div className="case-row__actions">
                        <a
                          className="button button--quiet"
                          href={`/admin/collections/content/${item.id}`}
                        >
                          编辑
                        </a>
                        <button
                          className="button button--quiet"
                          disabled={busy}
                          onClick={() => void action("preview", item)}
                        >
                          预览草稿
                        </button>
                        <button
                          className="button button--quiet"
                          disabled={busy}
                          onClick={() =>
                            void action(
                              item.live
                                ? item.modified
                                  ? "publish"
                                  : "unpublish"
                                : "publish",
                              item,
                            )
                          }
                        >
                          {item.live
                            ? item.modified
                              ? "发布更新"
                              : "撤下"
                            : "发布"}
                        </button>
                        <button
                          className="button button--danger"
                          disabled={busy}
                          onClick={() => void action("delete", item)}
                        >
                          删除
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
