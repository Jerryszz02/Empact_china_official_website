"use client";

import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";

export type AdminItem = {
  id: string;
  title: string;
  kind: string;
  slug: string;
  segment?: "youth" | "corporate" | "school" | "community";
  parentId?: string;
  summary?: string;
  order?: number;
  live?: boolean;
  modified?: boolean;
  url?: string;
  publishedAt?: string;
  lastError?: string;
  lastAction?: string;
};

export const segmentLabels = {
  youth: "青少年与青年",
  corporate: "企业服务",
  school: "学校业务",
  community: "社区业务",
} as const;

export function itemStatus(item: AdminItem) {
  if (item.lastError) return { label: "操作失败 · 可重试", tone: "changed" };
  if (item.live && item.modified)
    return { label: "已发布 · 有未发布修改", tone: "changed" };
  if (item.live) return { label: "已发布", tone: "live" };
  return {
    label: item.lastAction === "unpublished" ? "已撤下 · 草稿" : "草稿",
    tone: "draft",
  };
}

export function BusinessTypeBoard({
  items,
  busy,
  onMove,
  renderActions,
}: {
  items: AdminItem[];
  busy: boolean;
  onMove: (item: AdminItem, targetIndex: number) => Promise<void>;
  renderActions: (item: AdminItem) => ReactNode;
}) {
  const dragging = useRef<AdminItem | null>(null);
  const focusAfterMove = useRef<HTMLButtonElement | null>(null);
  const [draggedId, setDraggedId] = useState("");
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    after: boolean;
  } | null>(null);

  useEffect(() => {
    const button = focusAfterMove.current;
    if (busy || !button) return;
    focusAfterMove.current = null;
    if (!button.isConnected) return;
    // Moving a focused DOM node can blur it. At an edge, focus the available
    // reverse arrow so keyboard users can continue without finding the row again.
    const next = button.disabled
      ? button
          .closest(".business-card")
          ?.querySelector<HTMLButtonElement>(
            ".business-card__arrow:not(:disabled)",
          )
      : button;
    next?.focus({ preventScroll: true });
  }, [busy, items]);

  function clearDrag() {
    dragging.current = null;
    setDraggedId("");
    setDropTarget(null);
  }

  function canDrop(item: AdminItem) {
    return (
      !busy &&
      dragging.current &&
      dragging.current.id !== item.id &&
      dragging.current.segment === item.segment
    );
  }

  function isAfter(event: DragEvent<HTMLLIElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientY > bounds.top + bounds.height / 2;
  }

  return (
    <div className="business-board" aria-label="业务分类排序">
      {Object.entries(segmentLabels).map(([segment, label]) => {
        const group = items.filter((item) => item.segment === segment);
        const fixedCount = segment === "youth" ? 1 : 0;
        return (
          <section
            key={segment}
            className="business-column"
            aria-labelledby={`business-column-${segment}`}
          >
            <header className="business-column__heading">
              <h3 id={`business-column-${segment}`}>{label}</h3>
              <span>{group.length + fixedCount} 项</span>
            </header>
            <ol className="business-column__list" aria-label={`${label}顺序`}>
              {fixedCount > 0 && (
                <li className="business-card business-card--fixed">
                  <div className="business-card__top">
                    <span className="business-card__position">01</span>
                    <span className="business-card__fixed-label">固定首位</span>
                  </div>
                  <h4>国际人才培养模型</h4>
                  <p>固定展示，无需调整顺序。</p>
                </li>
              )}
              {group.map((item, index) => {
                const current = itemStatus(item);
                const target = dropTarget?.id === item.id ? dropTarget : null;
                return (
                  <li
                    key={item.id}
                    data-business-id={item.id}
                    className={`business-card${draggedId === item.id ? " is-dragging" : ""}${target ? (target.after ? " drop-after" : " drop-before") : ""}`}
                    onDragOver={(event) => {
                      if (!canDrop(item)) {
                        setDropTarget(null);
                        return;
                      }
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setDropTarget({ id: item.id, after: isAfter(event) });
                    }}
                    onDragLeave={(event) => {
                      if (
                        !event.currentTarget.contains(
                          event.relatedTarget as Node,
                        )
                      )
                        setDropTarget(null);
                    }}
                    onDrop={(event) => {
                      if (!canDrop(item)) return;
                      event.preventDefault();
                      const moved = dragging.current!;
                      const remaining = group.filter(
                        (entry) => entry.id !== moved.id,
                      );
                      const targetIndex =
                        remaining.findIndex((entry) => entry.id === item.id) +
                        Number(isAfter(event));
                      clearDrag();
                      void onMove(moved, targetIndex);
                    }}
                  >
                    <div className="business-card__top">
                      <span className="business-card__position">
                        {String(index + fixedCount + 1).padStart(2, "0")}
                      </span>
                      <span className={`status status--${current.tone}`}>
                        {current.label}
                      </span>
                    </div>
                    <h4>{item.title}</h4>
                    <p className="business-card__summary">
                      {item.summary || "暂无摘要"}
                    </p>
                    <div className="business-card__sorting">
                      <span
                        className="business-card__handle"
                        draggable={!busy}
                        title="拖动调整组内顺序，也可使用右侧上下箭头"
                        aria-hidden="true"
                        onDragStart={(event) => {
                          if (busy) {
                            event.preventDefault();
                            return;
                          }
                          dragging.current = item;
                          setDraggedId(item.id);
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", item.id);
                        }}
                        onDragEnd={clearDrag}
                      >
                        ⠿ <span>拖动</span>
                      </span>
                      <button
                        type="button"
                        className="button button--quiet business-card__arrow"
                        aria-label={`上移 ${item.title}`}
                        title="上移一位"
                        disabled={busy || index === 0}
                        onClick={(event) => {
                          focusAfterMove.current = event.currentTarget;
                          void onMove(item, index - 1);
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="button button--quiet business-card__arrow"
                        aria-label={`下移 ${item.title}`}
                        title="下移一位"
                        disabled={busy || index === group.length - 1}
                        onClick={(event) => {
                          focusAfterMove.current = event.currentTarget;
                          void onMove(item, index + 1);
                        }}
                      >
                        ↓
                      </button>
                    </div>
                    {item.lastError && (
                      <p className="admin-error">{item.lastError}</p>
                    )}
                    {renderActions(item)}
                  </li>
                );
              })}
            </ol>
            {group.length === 0 && (
              <p className="business-column__empty">暂无可排序的子业务</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
