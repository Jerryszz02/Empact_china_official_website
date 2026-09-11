"use client";
import { useRef, useState } from "react";

export function CreateContentButton({
  kind,
  parentId,
  segment,
  label,
}: {
  kind: "business" | "case";
  parentId?: string;
  segment?: "corporate" | "youth";
  label: string;
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
            : { parent: Number(parentId) }),
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
        aria-label={kind === "business" ? "新建业务" : "新建案例"}
      >
        <form onSubmit={create}>
          <h2>{kind === "business" ? "新建业务类型" : "新建案例"}</h2>
          <p>先填写名称和简短介绍，随后编辑完整图文内容。</p>
          <label>
            名称 / 标题
            <input name="title" required autoFocus maxLength={120} />
          </label>
          <label>
            简短介绍 / 案例摘要
            <textarea name="summary" required rows={3} maxLength={500} />
          </label>
          {kind === "business" && (
            <label>
              业务分组
              <select name="segment" defaultValue={segment || "corporate"}>
                <option value="corporate">企业服务</option>
                <option value="youth">青少年与青年</option>
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
