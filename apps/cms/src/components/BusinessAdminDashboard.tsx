"use client";

import { CreateContentButton } from "./CreateContentButton.js";
import { isFixedYouthModel } from "@empact/content/business";
import { useEffect, useRef, useState } from "react";
import {
  BusinessTypeBoard,
  itemStatus,
  segmentLabels,
  type AdminItem as Item,
} from "./BusinessTypeBoard.js";

const parts = [
  {
    id: "new-project",
    title: "新增项目",
    description: "填写信息，创建新的项目草稿",
  },
  {
    id: "published",
    title: "管理已发布项目",
    description: "查看官网项目，编辑更新或撤下",
  },
  { id: "drafts", title: "管理草稿", description: "继续编辑、预览并发布项目" },
  {
    id: "business-types",
    title: "新增业务类型",
    description: "添加业务类型，维护业务介绍与子业务排序",
  },
] as const;
type Part = (typeof parts)[number]["id"];
export function BusinessAdminDashboard() {
  const [items, setItems] = useState<Item[]>([]);
  const [part, setPart] = useState<Part>("new-project");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [error, setError] = useState("");
  const [segment, setSegment] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [search, setSearch] = useState("");

  const orderSaving = useRef(false);

  async function refresh(showLoading = true) {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/business-admin/state", {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "项目数据暂时无法加载");
      setItems(Array.isArray(data.items) ? data.items : []);
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "项目数据暂时无法加载",
      );
      return false;
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    const selectPart = () => {
      const next = parts.find((item) => `#${item.id}` === window.location.hash);
      setPart(next?.id || "new-project");
    };
    selectPart();
    window.addEventListener("hashchange", selectPart);
    void refresh();
    return () => window.removeEventListener("hashchange", selectPart);
  }, []);

  const businesses = items
    .filter((item) => item.kind === "business" && !isFixedYouthModel(item))
    .sort(
      (a, b) =>
        (a.segment ?? "").localeCompare(b.segment ?? "") ||
        (a.order || 0) - (b.order || 0),
    );
  const filteredBusinesses = businesses.filter(
    (item) => segment && item.segment === segment,
  );
  const segmentBusinessIds = new Set(filteredBusinesses.map((item) => item.id));
  const projects = items
    .filter((item) => item.kind === "case")
    .sort(
      (a, b) =>
        (Date.parse(b.publishedAt || "") || 0) -
        (Date.parse(a.publishedAt || "") || 0),
    );
  const published = projects.filter((item) => item.live);
  const drafts = projects.filter((item) => !item.live);
  const currentPart = parts.find((item) => item.id === part)!;
  const isProjectList = part === "published" || part === "drafts";
  const listItems =
    part === "published" ? published : part === "drafts" ? drafts : businesses;
  const query = search.trim().toLocaleLowerCase();
  const hasFilters = Boolean(segment || businessId || query);
  const visibleItems = isProjectList
    ? listItems.filter(
        (item) =>
          (!segment || segmentBusinessIds.has(item.parentId ?? "")) &&
          (!businessId || item.parentId === businessId) &&
          (!query || item.title.toLocaleLowerCase().includes(query)),
      )
    : listItems;

  function clearFilters() {
    setSegment("");
    setBusinessId("");
    setSearch("");
  }

  async function moveBusiness(item: Item, targetIndex: number) {
    if (busy || loading || orderSaving.current) return;
    const group = businesses.filter((entry) => entry.segment === item.segment);
    const currentIndex = group.findIndex((entry) => entry.id === item.id);
    if (
      currentIndex === targetIndex ||
      targetIndex < 0 ||
      targetIndex >= group.length
    )
      return;
    orderSaving.current = true;
    setBusy(true);
    setMessage("");
    setError("");
    setResultUrl("");
    try {
      const response = await fetch("/api/business-admin/reorder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          targetIndex,
          expected: group.map((entry) => ({
            id: entry.id,
            order: entry.order ?? 0,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "排序保存失败，请重试。");
      const changes = new Map<string, number>(
        data.changes.map((change: { id: string; order: number }) => [
          change.id,
          change.order,
        ]),
      );
      setItems((current) =>
        current.map((entry) => {
          const order = changes.get(entry.id);
          return order === undefined
            ? entry
            : {
                ...entry,
                order,
                modified: entry.live || entry.modified,
              };
        }),
      );
      setMessage(data.message);
      // Keep the board mounted so focus and scroll survive each move.
      if (!(await refresh(false)))
        setError("排序已保存，但最新发布状态暂时无法加载，请稍后刷新。");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "排序保存失败，请重试。",
      );
    } finally {
      orderSaving.current = false;
      setBusy(false);
    }
  }

  async function action(
    type: "preview" | "publish" | "unpublish" | "delete",
    item: Item,
  ) {
    if (
      type !== "preview" &&
      !window.confirm(
        type === "delete"
          ? `确定删除“${item.title}”？已发布内容会先撤下；有依赖的业务类型无法删除。`
          : type === "publish"
            ? `发布“${item.title}”？请确认已保存最新修改。`
            : `撤下“${item.title}”？撤下后可在草稿中继续管理。`,
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

  function renderActions(item: Item) {
    return (
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
        {(!item.live || item.modified) && (
          <button
            className="button button--primary"
            disabled={busy}
            onClick={() => void action("publish", item)}
          >
            {item.live ? "发布更新" : "发布到官网"}
          </button>
        )}
        {item.live && (
          <>
            <a
              className="button button--quiet"
              href={item.url}
              target="_blank"
              rel="noreferrer"
            >
              查看详情 ↗
            </a>
            <button
              className="button button--quiet"
              disabled={busy}
              onClick={() => void action("unpublish", item)}
            >
              撤下
            </button>
          </>
        )}
        <button
          className="button button--danger"
          disabled={busy}
          onClick={() => void action("delete", item)}
        >
          删除
        </button>
      </div>
    );
  }

  return (
    <main className="business-admin" aria-label="项目管理">
      <header className="business-admin__hero">
        <div>
          <p className="eyebrow">EMPACT CONTENT STUDIO</p>
          <h1>项目管理</h1>
          <p>新增项目、维护已发布内容，或从草稿继续。</p>
        </div>
      </header>
      <nav className="admin-parts" aria-label="内容管理入口">
        {parts.map((item, index) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={`admin-part ${part === item.id ? "is-selected" : ""}`}
            aria-current={part === item.id ? "page" : undefined}
          >
            <span className="admin-part__number">0{index + 1}</span>
            <strong>{item.title}</strong>
            <span>{item.description}</span>
            {!loading && (item.id === "published" || item.id === "drafts") && (
              <span>
                {item.id === "published" ? published.length : drafts.length}{" "}
                个项目
              </span>
            )}
          </a>
        ))}
      </nav>
      <a className="home-gallery-entry" href="/admin/globals/home-gallery">
        <span>
          <strong>首页照片</strong>
          <small>管理首屏轮播照片和展示样式，保存后可预览、发布。</small>
        </span>
        <span className="home-gallery-entry__action" aria-hidden="true">
          编辑照片 ↗
        </span>
      </a>
      <a className="office-gallery-entry" href="/admin/globals/office-gallery">
        <span>
          <strong>办公空间照片</strong>
          <small>管理“加入我们”的办公空间照片和图片说明，保存后可预览、发布。</small>
        </span>
        <span className="home-gallery-entry__action" aria-hidden="true">
          编辑照片 ↗
        </span>
      </a>
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
      <section
        className="admin-workspace"
        aria-labelledby="workspace-title"
        aria-busy={loading || busy}
      >
        <div className="section-heading">
          <div>
            <h2 id="workspace-title">{currentPart.title}</h2>
            <p>{currentPart.description}</p>
          </div>
          <button
            className="button button--quiet"
            onClick={() => void refresh()}
            disabled={busy || loading}
          >
            刷新
          </button>
        </div>
        {loading ? (
          <p role="status">正在加载项目…</p>
        ) : part === "new-project" ? (
          <div className="empty-state">
            <strong>先填写项目信息，再选择详情展示方式</strong>
            <p>
              标题、摘要和所属业务类型必填。创建后可继续添加封面，填写外链或站内网页正文。
            </p>
            {businesses.length ? (
              <CreateContentButton
                kind="case"
                businesses={businesses}
                label="新增项目"
              />
            ) : (
              <>
                <p>请先新增一个业务类型，再创建项目。</p>
                <a className="button button--primary" href="#business-types">
                  前往新增业务类型
                </a>
              </>
            )}
          </div>
        ) : (
          <>
            {part === "business-types" && (
              <div className="admin-workspace__create">
                <CreateContentButton kind="business" label="新增业务类型" />
                <p>
                  使用上下箭头移动一位，或拖动手柄调整组内顺序。排序自动保存到草稿；发布有未发布修改的业务后，官网才会更新。
                </p>
              </div>
            )}
            {part === "published" && (
              <p className="admin-workspace__hint">
                已发布项目的修改仍在这里管理；保存草稿后，点击“发布更新”才会更新官网。
              </p>
            )}
            {isProjectList && (
              <div
                className="admin-filters"
                role="search"
                aria-label="筛选项目"
              >
                <div className="admin-filters__field">
                  <label htmlFor="project-segment-filter">业务范围</label>
                  <select
                    id="project-segment-filter"
                    value={segment}
                    onChange={(event) => {
                      setSegment(event.target.value);
                      setBusinessId("");
                    }}
                  >
                    <option value="">全部业务范围</option>
                    {Object.entries(segmentLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="admin-filters__field">
                  <label htmlFor="project-business-filter">子业务</label>
                  <select
                    id="project-business-filter"
                    value={businessId}
                    disabled={!segment}
                    onChange={(event) => setBusinessId(event.target.value)}
                  >
                    <option value="">
                      {segment ? "全部子业务" : "请先选择业务范围"}
                    </option>
                    {filteredBusinesses.map((business) => (
                      <option key={business.id} value={business.id}>
                        {business.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="admin-filters__field">
                  <label htmlFor="project-name-search">项目名称</label>
                  <input
                    id="project-name-search"
                    type="search"
                    placeholder="输入项目名称关键词"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="button button--quiet"
                  disabled={!segment && !businessId && !search}
                  onClick={clearFilters}
                >
                  清空筛选
                </button>
                <p className="admin-filters__count" role="status">
                  显示 {visibleItems.length} / {listItems.length} 个项目
                </p>
              </div>
            )}
            {part === "business-types" ? (
              <BusinessTypeBoard
                items={businesses}
                busy={busy || loading}
                onMove={moveBusiness}
                renderActions={renderActions}
              />
            ) : (
              <div className="case-list">
                {visibleItems.length === 0 ? (
                  <div className="empty-state">
                    <strong>
                      {isProjectList && hasFilters
                        ? "没有符合筛选条件的项目"
                        : part === "published"
                          ? "还没有已发布项目"
                          : part === "drafts"
                            ? "目前没有项目草稿"
                            : "还没有业务类型"}
                    </strong>
                    {isProjectList && hasFilters ? (
                      <p>
                        请调整业务类型或名称关键词，或清空筛选查看全部项目。
                      </p>
                    ) : (
                      <a className="text-link" href="#new-project">
                        新增一个项目 →
                      </a>
                    )}
                  </div>
                ) : (
                  visibleItems.map((item) => {
                    const current = itemStatus(item);
                    const business = businesses.find(
                      (candidate) => candidate.id === item.parentId,
                    );
                    return (
                      <article className="case-row" key={item.id}>
                        <div className="case-row__body">
                          <span className={`status status--${current.tone}`}>
                            {current.label}
                          </span>
                          <h3>{item.title}</h3>
                          <p>
                            {item.kind === "case"
                              ? `所属业务：${business?.title || "未选择"}`
                              : item.segment
                                ? segmentLabels[item.segment]
                                : "未选择业务分组"}
                          </p>
                          <p>{item.summary || "暂无摘要"}</p>
                          {item.lastError && (
                            <p className="admin-error">{item.lastError}</p>
                          )}
                        </div>
                        {renderActions(item)}
                      </article>
                    );
                  })
                )}
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
