"use client";
import { useRef, useState } from "react";

export function CreateContentButton({
  kind,
  parentId,
  segment,
  label,
  businesses = [],
}: {
  kind: "business" | "case";
  parentId?: string;
  segment?: "corporate" | "youth" | "school" | "community";
  label: string;
  businesses?: { id: string; title: string }[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/content", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          title: form.get("title"),
          summary: form.get("summary"),
          ...(kind === "business"
            ? { segment: form.get("segment"), order: 0 }
            : { parent: Number(parentId || form.get("parent")) }),
          approved: false,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.errors?.[0]?.message || "创建失败，请检查名称和摘要。",
        );
      window.location.assign(`/admin/collections/content/${data.doc.id}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "创建失败，请重试。");
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="button button--primary"
        onClick={() => dialog.current?.showModal()}
      >
        {label}
      </button>
      <dialog
        ref={dialog}
        className="content-create-dialog"
        aria-label={kind === "business" ? "新增业务类型" : "新增项目"}
      >
        <form onSubmit={create}>
          <h2>{kind === "business" ? "新增业务类型" : "新增项目"}</h2>
          <p>先填写必填信息，创建草稿后继续编辑封面和详情。</p>
          <label>
            名称 / 标题（必填）
            <input name="title" required autoFocus maxLength={120} />
          </label>
          <label>
            简短介绍 / 项目摘要（必填）
            <textarea name="summary" required rows={3} maxLength={500} />
          </label>
          {kind === "business" && (
            <label>
              业务分组（必填）
              <select
                name="segment"
                required
                defaultValue={segment || "corporate"}
              >
                <option value="corporate">企业服务</option>
                <option value="youth">青少年与青年</option>
                <option value="school">学校业务</option>
                <option value="community">社区业务</option>
              </select>
            </label>
          )}
          {kind === "case" && !parentId && (
            <label>
              所属业务类型（必填）
              <select name="parent" required defaultValue="">
                <option value="" disabled>
                  请选择业务类型
                </option>
                {businesses.map((business) => (
                  <option key={business.id} value={business.id}>
                    {business.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          {error && (
            <p role="alert" className="admin-error">
              {error}
            </p>
          )}
          <div className="content-document-actions__buttons">
            <button
              type="button"
              className="button button--quiet"
              disabled={busy}
              onClick={() => dialog.current?.close()}
            >
              取消
            </button>
            <button
              type="submit"
              className="button button--primary"
              disabled={busy}
            >
              {busy ? "正在创建…" : "创建并编辑"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
