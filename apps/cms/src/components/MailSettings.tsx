"use client";

import { useEffect, useState } from "react";
import type { MailSettings as Settings } from "../../../../scripts/mail-settings.js";

export function MailSettings() {
  const [settings, setSettings] = useState<Settings>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function load() {
    setError("");
    try {
      const response = await fetch("/api/mail-settings", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSettings(data);
    } catch {
      setError("暂时无法读取收件设置，请重试。");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <form
      aria-label="收件邮箱设置"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!settings || busy) return;
        setBusy(true);
        setError("");
        setMessage("");
        try {
          const response = await fetch("/api/mail-settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(settings),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "保存失败，请重试。");
          setSettings(data);
          setMessage("已保存，后续咨询和招聘申请将发送到对应邮箱。");
        } catch (caught) {
          setError(
            caught instanceof Error ? caught.message : "保存失败，请重试。",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        保存后立即用于后续提交，无需重新发布页面。两个邮箱可以相同，也可以分别设置。
      </p>
      {!settings ? (
        error ? (
          <button
            type="button"
            className="button button--quiet"
            onClick={() => void load()}
          >
            重新读取设置
          </button>
        ) : (
          <p role="status">正在读取收件设置…</p>
        )
      ) : (
        <>
          <div className="admin-filters">
            {(
              [
                ["inquiryEmail", "咨询收件邮箱"],
                ["recruitmentEmail", "招聘收件邮箱"],
              ] as const
            ).map(([key, label]) => (
              <label className="admin-filters__field" key={key}>
                {label}
                <input
                  type="email"
                  required
                  maxLength={254}
                  value={settings[key]}
                  disabled={busy}
                  onChange={(event) => {
                    setSettings({ ...settings, [key]: event.target.value });
                    setMessage("");
                  }}
                />
              </label>
            ))}
          </div>
          <button type="submit" className="button" disabled={busy}>
            {busy ? "保存中…" : "保存收件设置"}
          </button>
        </>
      )}
      {message && (
        <p className="admin-notice" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
