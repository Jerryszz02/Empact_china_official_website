"use client";
import {
  useAllFormFields,
  useDocumentInfo,
  useFormModified,
  useFormInitializing,
} from "@payloadcms/ui";
import { useEffect, useRef, useState } from "react";

type Status = { live: boolean; modified: boolean; lastError?: string };
export function ContentDocumentActions() {
  const { id, data } = useDocumentInfo();
  const modified = useFormModified();
  const initializing = useFormInitializing();
  const [fields, dispatchFields] = useAllFormFields();
  const kind = fields.kind?.value ?? data?.kind;
  const [status, setStatus] = useState<Status>();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    message?: string;
    previewUrl?: string;
    url?: string;
    error?: boolean;
  }>({});
  const initialized = useRef(false);
  async function refresh() {
    if (!id) return;
    const response = await fetch("/api/business-admin/state", {
      cache: "no-store",
    });
    if (response.ok) {
      const body = await response.json();
      setStatus(
        body.items.find((item: { id: string }) => item.id === String(id)),
      );
    }
  }
  useEffect(() => {
    void refresh();
  }, [id, modified]);
  useEffect(() => {
    if (initialized.current || id || initializing || !fields.kind) return;
    initialized.current = true;
    const params = new URLSearchParams(window.location.search);
    const nextKind = params.get("kind");
    if (nextKind !== "business" && nextKind !== "case") return;
    dispatchFields({ type: "UPDATE", path: "kind", value: nextKind });
    if (nextKind === "business")
      dispatchFields({
        type: "UPDATE",
        path: "segment",
        value: params.get("segment") === "corporate" ? "corporate" : "youth",
      });
    if (nextKind === "case" && params.get("parent"))
      dispatchFields({
        type: "UPDATE",
        path: "parent",
        value: Number(params.get("parent")),
      });
  }, [id, dispatchFields, initializing, fields.kind]);
  if (kind !== "business" && kind !== "case") return null;
  async function run(action: "preview" | "publish" | "unpublish" | "delete") {
    if (!id || modified) return;
    if (
      action !== "preview" &&
      !window.confirm(
        {
          publish: "发布到官网",
          unpublish: "从官网撤下",
          delete: "撤下并删除",
        }[action] + `“${data?.title ?? "当前内容"}”？`,
      )
    )
      return;
    setBusy(true);
    setResult({});
    try {
      const response = await fetch(`/api/business-admin/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: String(id), confirmed: true }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "操作失败，请重试。");
      if (action === "delete") {
        window.location.assign("/admin");
        return;
      }
      setResult(body);
      await refresh();
    } catch (error) {
      setResult({
        message:
          error instanceof Error
            ? error.message
            : "连接中断，请刷新核对结果后重试。",
        error: true,
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="content-document-actions" aria-label="业务内容操作">
      <a className="text-link" href="/admin">
        ← 返回业务与案例
      </a>
      <p className="document-publish-status">
        {status?.live
          ? status.modified || modified
            ? "有未发布修改 · 官网仍显示上次发布的版本"
            : "已发布"
          : "草稿 · 尚未公开"}
      </p>
      <div className="content-document-actions__buttons">
        <button
          type="button"
          className="button button--quiet"
          disabled={busy || modified || !id}
          onClick={() => void run("preview")}
        >
          预览草稿
        </button>
        <button
          type="button"
          className="button button--primary"
          disabled={busy || modified || !id}
          onClick={() => void run("publish")}
        >
          {status?.live ? "发布更新" : "发布到官网"}
        </button>
        {status?.live && (
          <button
            type="button"
            className="button button--quiet"
            disabled={busy || modified}
            onClick={() => void run("unpublish")}
          >
            撤下
          </button>
        )}
        {id && (
          <button
            type="button"
            className="button button--danger"
            disabled={busy || modified}
            onClick={() => void run("delete")}
          >
            删除
          </button>
        )}
      </div>
      {(!id || modified) && (
        <p>请先保存草稿，再预览或发布；保存不会改变官网。</p>
      )}
      {busy && <p role="status">正在处理，请稍候…</p>}
      {(result.message || status?.lastError) && (
        <p
          className={result.error ? "admin-error" : "admin-notice"}
          role={result.error ? "alert" : "status"}
        >
          {result.message || status?.lastError}
        </p>
      )}
      {(result.previewUrl || result.url) && (
        <a
          href={result.previewUrl || result.url}
          target="_blank"
          rel="noreferrer"
        >
          打开结果页面 ↗
        </a>
      )}
    </section>
  );
}
