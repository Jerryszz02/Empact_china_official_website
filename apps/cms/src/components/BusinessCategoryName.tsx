"use client";

import { useEffect, useRef, useState } from "react";

export function BusinessCategoryName({
  segment,
  title,
  onSave,
  onPending,
  onPublish,
  publishedTitle,
  disabled,
}: {
  segment: string;
  title: string;
  onPending: (pending: boolean) => void;
  onPublish: () => Promise<void>;
  publishedTitle?: string;
  disabled: boolean;
  onSave: (title: string, expected: string) => Promise<string>;
}) {
  const [value, setValue] = useState(title);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const draft = useRef(title);
  const saved = useRef(title);
  const saving = useRef(false);
  const composing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveHandler = useRef(onSave);
  saveHandler.current = onSave;
  const pendingHandler = useRef(onPending);
  pendingHandler.current = onPending;

  useEffect(() => {
    if (draft.current === saved.current && !saving.current) {
      draft.current = title;
      setValue(title);
    }
    if (!saving.current) saved.current = title;
  }, [title]);

  async function save() {
    clearTimeout(timer.current);
    if (saving.current || composing.current) return;
    const next = draft.current.trim();
    if (!next) {
      setError("名称不能为空，请填写后重试。");
      setStatus("");
      pendingHandler.current(false);
      return;
    }
    if (next === saved.current) {
      draft.current = next;
      setValue(next);
      setError("");
      setStatus("");
      pendingHandler.current(false);
      return;
    }
    saving.current = true;
    setError("");
    setStatus("正在保存…");
    try {
      const confirmed = await saveHandler.current(next, saved.current);
      saved.current = confirmed;
      if (draft.current.trim() === next) {
        draft.current = confirmed;
        setValue(confirmed);
        setStatus("已保存到草稿");
        pendingHandler.current(false);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败，请重试。");
      setStatus("");
      saving.current = false;
      pendingHandler.current(false);
      return;
    }
    saving.current = false;
    // Serialize requests so a slow response cannot overwrite newer typing.
    if (draft.current.trim() !== saved.current) void save();
  }

  function schedule() {
    clearTimeout(timer.current);
    setError("");
    setStatus("等待保存…");
    pendingHandler.current(true);
    if (!composing.current) timer.current = setTimeout(() => void save(), 700);
  }

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (draft.current.trim() !== saved.current || saving.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      clearTimeout(timer.current);
      // Switching dashboard tabs must flush the pending debounce.
      if (draft.current.trim() !== saved.current) void save();
    };
  }, []);

  return (
    <div className="business-category-name">
      <input
        id={`business-column-${segment}`}
        aria-label={`大类名称：${title}`}
        aria-describedby={`business-category-status-${segment}`}
        aria-invalid={Boolean(error)}
        maxLength={40}
        disabled={disabled}
        value={value}
        onChange={(event) => {
          draft.current = event.target.value;
          setValue(event.target.value);
          schedule();
        }}
        onCompositionStart={() => {
          composing.current = true;
          clearTimeout(timer.current);
        }}
        onCompositionEnd={() => {
          composing.current = false;
          schedule();
        }}
        onBlur={() => void save()}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void save();
          }
        }}
      />
      <span
        id={`business-category-status-${segment}`}
        role={error ? "alert" : "status"}
      >
        {error || status}
        {error && (
          <button
            type="button"
            className="business-category-name__retry"
            onClick={() => void save()}
          >
            重试
          </button>
        )}
      </span>
      {publishedTitle !== title &&
        draft.current.trim() === saved.current &&
        !saving.current && (
          <button
            type="button"
            className="business-category-name__retry"
            disabled={disabled}
            onClick={() => void onPublish()}
          >
            发布名称
          </button>
        )}
    </div>
  );
}
