"use client";

import { useFormModified } from "@payloadcms/ui";
import { useEffect, useRef, useState } from "react";

type GalleryState = { live: boolean; modified: boolean };

export function OfficeGalleryActions() {
  const modified = useFormModified();
  const [state, setState] = useState<GalleryState>();
  const [preview, setPreview] = useState<{ id: string; url: string }>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const editRevision = useRef(0);
  const modifiedRef = useRef(modified);
  modifiedRef.current = modified;

  async function refresh() {
    const response = await fetch("/api/publication/state", {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("暂时无法读取办公空间照片状态。");
    const result = await response.json();
    setState(result.officeGallery);
  }

  useEffect(() => {
    if (modified) {
      editRevision.current += 1;
      setPreview(undefined);
    } else void refresh().catch(() => setError("暂时无法读取办公空间照片状态。"));
  }, [modified]);

  async function run(action: "preview" | "publish") {
    if (modified || busy) return;
    if (
      action === "publish" &&
      !window.confirm("发布刚才预览的办公空间照片到官网？")
    )
      return;
    setBusy(true);
    setMessage("");
    setError("");
    const revisionAtRequest = editRevision.current;
    try {
      const response = await fetch(`/api/publication/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ids: [],
          includeOfficeGallery: true,
          ...(action === "publish"
            ? { previewId: preview?.id, confirmed: true }
            : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "操作失败，请重试。");
      if (action === "preview") {
        if (editRevision.current !== revisionAtRequest || modifiedRef.current) {
          setError("照片或说明已修改，请保存后重新生成预览。");
          return;
        }
        const url = String(result.previewUrl || "");
        const id = url.match(/^\/preview\/([a-zA-Z0-9_-]+)\/$/)?.[1];
        if (!id) throw new Error("预览地址无效，请重试。");
        setPreview({ id, url });
      } else {
        setPreview(undefined);
        await refresh();
      }
      setMessage(result.message || "操作完成。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="content-document-actions" aria-label="办公空间照片操作">
      <a className="text-link" href="/admin">
        ← 返回项目管理
      </a>
      <p className="document-publish-status">
        {state?.live
          ? state.modified || modified
            ? "官网仍显示上次发布的照片"
            : "办公空间照片已发布"
          : "办公空间照片尚未单独发布"}
      </p>
      <p>先保存下方照片和说明，再生成预览；确认效果后发布该预览版本。</p>
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
          className="button"
          disabled={busy || modified || !preview}
          onClick={() => void run("publish")}
        >
          发布预览版本
        </button>
      </div>
      {preview && (
        <p>
          <a href={`${preview.url}join-us/`} target="_blank" rel="noreferrer">
            打开办公空间预览 ↗
          </a>
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
