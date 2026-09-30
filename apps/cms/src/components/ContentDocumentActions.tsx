"use client";
import { isFixedYouthModel } from "@empact/content/business";
import {
  useAllFormFields,
  useDocumentInfo,
  useFormModified,
  useFormInitializing,
} from "@payloadcms/ui";
import { useEffect, useRef, useState } from "react";

type Status = {
  live: boolean;
  modified: boolean;
  lastError?: string;
  syncReceiptId?: string;
  syncStatus?: "pending" | "complete" | "skipped" | "superseded";
};
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
  async function refresh(): Promise<boolean> {
    if (!id) return false;
    try {
      const response = await fetch("/api/business-admin/state", {
        cache: "no-store",
      });
      if (!response.ok) return false;
      const body = await response.json();
      setStatus(
        body.items.find((item: { id: string }) => item.id === String(id)),
      );
      return true;
    } catch {
      return false;
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
  if (
    kind === "page" &&
    ["youth", "corporate", "school", "community"].includes(String(data?.slug))
  )
    return <PageIntroActions id={String(id)} slug={String(data?.slug)} />;
  if (kind !== "business" && kind !== "case") return null;
  if (isFixedYouthModel({ kind, slug: fields.slug?.value ?? data?.slug }))
    return (
      <p>
        国际人才培养模型为固定页面，始终显示在青少年业务首位，无需后台编辑。
        <a href="/admin#business-types">返回业务管理</a>
      </p>
    );
  async function run(
    action: "preview" | "publish" | "sync" | "unpublish" | "delete",
  ) {
    if (!id || modified) return;
    if (
      action !== "preview" &&
      !window.confirm(
        {
          publish: "发布到官网",
          sync: "重试后台状态同步",
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
        body: JSON.stringify({
          id: String(id),
          confirmed: true,
          ...(action === "sync" ? { receiptId: status?.syncReceiptId } : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "操作失败，请重试。");
      if (action === "delete") {
        window.location.assign("/admin");
        return;
      }
      setResult(body);
      if (!(await refresh()))
        setResult({
          ...body,
          message: `${body.message || "操作已完成。"} 后台状态刷新失败，请稍后刷新页面核对。`,
        });
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
        ← 返回项目管理
      </a>
      <p className="document-publish-status">
        {status?.live && status.syncStatus === "pending"
          ? "已发布 · 后台状态待同步"
          : status?.live
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
        {status?.syncStatus === "pending" && status.syncReceiptId && (
          <button
            type="button"
            className="button button--quiet"
            disabled={busy || modified}
            onClick={() => void run("sync")}
          >
            重试状态同步
          </button>
        )}
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
      <p>
        {kind === "case"
          ? "标注必填的信息请先补齐；封面在发布时必填。详情填写外链或网页正文，二选一；填写外链后将直接跳转。"
          : "标注必填的信息请先补齐；业务介绍在发布时必填，展示顺序选填。"}
      </p>
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

function PageIntroActions({ id, slug }: { id: string; slug: string }) {
  const modified = useFormModified();
  const [preview, setPreview] = useState<{ id: string; url: string }>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const revision = useRef(0);
  const modifiedRef = useRef(modified);
  modifiedRef.current = modified;
  useEffect(() => {
    if (modified) {
      revision.current += 1;
      setPreview(undefined);
    }
  }, [modified]);

  async function run(action: "preview" | "publish") {
    if (busy || modified || (action === "publish" && !preview)) return;
    if (
      action === "publish" &&
      !window.confirm("发布刚才预览的页面介绍到官网？")
    )
      return;
    setBusy(true);
    setMessage("");
    setError("");
    const requestedRevision = revision.current;
    try {
      const response = await fetch(`/api/publication/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ids: [id],
          pageIntroOnly: true,
          ...(action === "publish"
            ? { previewId: preview?.id, confirmed: true }
            : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || result.message || "操作失败，请重试。");
      if (action === "preview") {
        if (requestedRevision !== revision.current || modifiedRef.current)
          throw new Error("介绍文字已修改，请保存后重新生成预览。");
        const url = String(result.previewUrl || "");
        const previewId = url.match(/^\/preview\/([a-zA-Z0-9_-]+)\/$/)?.[1];
        if (!previewId) throw new Error("预览地址无效，请重试。");
        setPreview({ id: previewId, url });
      } else setPreview(undefined);
      setMessage(result.message || "操作完成。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="content-document-actions" aria-label="页面介绍操作">
      <a className="text-link" href="/admin#page-intros">
        ← 返回页面介绍
      </a>
      <p>
        编辑下方“网页正文”中的介绍文字，先保存，再生成预览并发布。保存草稿不会改变官网；此处仅发布介绍正文，页面名称仍由“新增业务类型”中的“发布名称”管理。
      </p>
      <div className="content-document-actions__buttons">
        <button
          type="button"
          className="button button--quiet"
          disabled={busy || modified}
          onClick={() => void run("preview")}
        >
          生成预览
        </button>
        <button
          type="button"
          className="button button--primary"
          disabled={busy || modified || !preview}
          onClick={() => void run("publish")}
        >
          发布预览版本
        </button>
      </div>
      {preview && (
        <p>
          <a href={`${preview.url}${slug}/`} target="_blank" rel="noreferrer">
            打开页面介绍预览 ↗
          </a>
        </p>
      )}
      {busy && <p role="status">正在处理，请稍候…</p>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
