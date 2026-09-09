import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { previewSnapshot } from "@empact/content/fixtures";
import { createPublicServer } from "../scripts/public-server.js";
const execute = promisify(execFile),
  repository = resolve("."),
  cms = join(repository, "apps/cms");
const directory = await mkdtemp(join(tmpdir(), "empact-cms-live-"));
const runtime = join(directory, "site"),
  media = join(directory, "media");
await mkdir(media);
await mkdir(runtime);
const website = createPublicServer({
  root: join(runtime, "current"),
  origin: "https://empact.cn",
});
website.listen(0, "127.0.0.1");
await new Promise<void>((done) => website.once("listening", done));
const publicURL = `http://127.0.0.1:${(website.address() as { port: number }).port}`;
const base = "http://127.0.0.1:3001";
const email = "isolated-test@example.invalid",
  password = randomBytes(24).toString("base64url");
const env = {
  ...process.env,
  NODE_ENV: "production",
  PAYLOAD_SECRET: randomBytes(48).toString("hex"),
  DATABASE_URL: `file:${join(directory, "cms.db")}`,
  MEDIA_DIR: media,
  RUNTIME_DIR: runtime,
  REPOSITORY_DIR: repository,
  CMS_URL: base,
  PUBLIC_HEALTH_URL: `${publicURL}/release.json`,
  ADMIN_EMAIL: email,
  ADMIN_PASSWORD: password,
  NEXT_TELEMETRY_DISABLED: "1",
};
let child: ReturnType<typeof spawn> | undefined,
  logs = "";
try {
  await execute(
    process.execPath,
    [
      "--import",
      "tsx",
      join(repository, "node_modules/payload/bin.js"),
      "migrate",
    ],
    { cwd: cms, env, timeout: 60_000 },
  );
  await execute(
    process.execPath,
    ["--import", "tsx", "src/cli/create-admin.ts"],
    { cwd: cms, env, timeout: 30_000 },
  );
  child = spawn(
    process.execPath,
    [
      join(repository, "node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3001",
    ],
    { cwd: cms, env, stdio: ["ignore", "pipe", "pipe"] },
  );
  child.stdout?.on("data", (data) => {
    logs = (logs + data).slice(-6000);
  });
  child.stderr?.on("data", (data) => {
    logs = (logs + data).slice(-6000);
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(`${base}/admin/login`);
      if (response.status === 200) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((done) => setTimeout(done, 500));
  }
  assert.ok(ready, `CMS did not become ready: ${logs}`);
  for (const path of [
    "/api/content",
    "/api/media",
    "/api/publication/state",
    "/preview/unknown/",
  ])
    assert.ok([401, 403].includes((await fetch(base + path)).status), path);
  assert.equal(
    (
      await fetch(base + "/api/users/first-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
    ).status,
    403,
  );
  const login = await fetch(base + "/api/users/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(login.status, 200);
  const cookies = login.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const request = async (path: string, method = "GET", data?: unknown) => {
    const response = await fetch(base + path, {
      method,
      headers: {
        Cookie: cookies,
        Origin: base,
        "Content-Type": "application/json",
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    const raw = await response.text();
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new Error(
        `${method} ${path}: ${response.status} non-JSON response. ${logs}`,
      );
    }
    if (!response.ok)
      throw new Error(
        `${method} ${path}: ${response.status} ${JSON.stringify(body)}`,
      );
    return body;
  };
  const responseFor = async (path: string, data: unknown) =>
    fetch(base + path, {
      method: "POST",
      headers: {
        Cookie: cookies,
        Origin: base,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
  const lexical = (text: string) => ({
    root: {
      type: "root",
      version: 1,
      direction: null,
      format: "",
      indent: 0,
      children: [
        {
          type: "paragraph",
          version: 1,
          direction: null,
          format: "",
          indent: 0,
          children: [
            {
              type: "text",
              version: 1,
              text,
              format: 0,
              detail: 0,
              mode: "normal",
              style: "",
            },
          ],
        },
      ],
    },
  });
  const ids: string[] = [];
  for (const entry of previewSnapshot.entries.filter(
    (entry) => entry.kind === "page" || entry.kind === "business",
  )) {
    const result = await request("/api/content", "POST", {
      kind: entry.kind,
      slug: entry.slug,
      title: `验收-${entry.slug}`,
      summary: "自动验收使用的隔离内容摘要。",
      body: lexical("自动验收专用正文，不能作为正式公司资料。"),
      segment: entry.segment,
      approved: true,
    });
    ids.push(String(result.doc.id));
  }
  const approvalDocId = ids[0];
  await request(`/api/content/${approvalDocId}`, "PATCH", {
    title: "审批回退测试修改",
    approved: true,
  });
  assert.equal(
    (await request(`/api/content/${approvalDocId}`)).approved,
    false,
  );
  await request(`/api/content/${approvalDocId}`, "PATCH", { approved: true });
  assert.equal((await request(`/api/content/${approvalDocId}`)).approved, true);
  const state = await request("/api/publication/state");
  const business = state.items.find(
    (item: { kind: string }) => item.kind === "business",
  );
  await request("/api/globals/company", "POST", {
    name: "隔离验收",
    legalName: "隔离验收主体",
    email: "test@example.invalid",
    description: "仅用于本机自动验收。",
    approved: true,
    privacyApproved: true,
    contactEnabled: false,
    retentionDays: 30,
  });
  const form = new FormData();
  form.set(
    "_payload",
    JSON.stringify({
      alt: "隔离图片",
      usageApproval: "测试夹具",
      approved: true,
    }),
  );
  form.set(
    "file",
    new Blob(
      [
        await sharp({
          create: { width: 32, height: 32, channels: 3, background: "#087e80" },
        })
          .png()
          .toBuffer(),
      ],
      { type: "image/png" },
    ),
    "fixture.png",
  );
  const upload = await fetch(base + "/api/media", {
    method: "POST",
    headers: { Cookie: cookies, Origin: base },
    body: form,
  });
  const uploaded = await upload.json();
  assert.equal(upload.status, 201, JSON.stringify(uploaded) + "\n" + logs);
  assert.ok(
    [401, 403].includes(
      (await fetch(base + new URL(uploaded.doc.url, base).pathname)).status,
    ),
  );
  const news = await request("/api/content", "POST", {
    kind: "news",
    slug: "operations-news",
    title: "运营新闻验收",
    summary: "新闻摘要。",
    body: lexical("新闻原版正文。"),
    publishedAt: "2026-09-01T00:00:00Z",
    parent: Number(business.id),
    image: uploaded.doc.id,
    approved: true,
    featured: true,
  });
  const project = await request("/api/content", "POST", {
    kind: "project",
    slug: "operations-project",
    title: "运营项目验收",
    summary: "项目摘要。",
    body: lexical("项目实践正文。"),
    parent: Number(business.id),
    approved: true,
    projectStatus: "consultation",
    audience: "验收对象",
    location: "验收地点",
    duration: "一天",
    operator: "验收运营方",
  });
  ids.push(String(news.doc.id), String(project.doc.id));
  const preview = await request("/api/publication/preview", "POST", {
    ids,
    includeCompany: true,
  });
  const previewResponse = await fetch(base + preview.previewUrl, {
    headers: { Cookie: cookies, "Sec-Fetch-Site": "same-origin" },
  });
  assert.equal(previewResponse.status, 200);
  assert.match(await previewResponse.text(), /结构预览/);
  assert.equal((await fetch(base + preview.previewUrl)).status, 401);
  assert.equal(
    (
      await responseFor("/api/publication/publish", {
        ids,
        includeCompany: true,
        confirmed: true,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await responseFor("/api/publication/publish", {
        ids: ids.slice(0, -1),
        includeCompany: true,
        confirmed: true,
        previewId: preview.previewUrl.split("/")[2],
      })
    ).status,
    400,
  );
  const expiredPreview = await request("/api/publication/preview", "POST", {
    ids,
    includeCompany: true,
  });
  await writeFile(
    join(
      runtime,
      "previews",
      expiredPreview.previewUrl.split("/")[2],
      "expires.json",
    ),
    JSON.stringify({ expiresAt: Date.now() - 1 }),
  );
  assert.equal(
    (
      await responseFor("/api/publication/publish", {
        ids,
        includeCompany: true,
        confirmed: true,
        previewId: expiredPreview.previewUrl.split("/")[2],
      })
    ).status,
    400,
  );
  const draftImage = await fetch(
    base + preview.previewUrl + `media/${uploaded.doc.filename}`,
  );
  assert.equal(draftImage.status, 401);
  const first = await request("/api/publication/publish", "POST", {
    ids,
    includeCompany: true,
    confirmed: true,
    previewId: preview.previewUrl.split("/")[2],
  });
  assert.equal(first.result.state, "published");
  assert.equal(
    (await request("/api/publication/state")).items.find(
      (item: { id: string }) => item.id === String(news.doc.id),
    ).modified,
    false,
  );
  assert.equal(
    (
      await fetch(base + `/api/content/${news.doc.id}`, {
        method: "PATCH",
        headers: {
          Cookie: cookies,
          Origin: base,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ slug: "changed-after-publication" }),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(base + `/api/media/${uploaded.doc.id}`, {
        method: "DELETE",
        headers: { Cookie: cookies, Origin: base },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + "/api/publication/publish", {
        method: "POST",
        headers: { Cookie: cookies, Origin: "https://invalid.example" },
        body: JSON.stringify({ ids, confirmed: true }),
      })
    ).status,
    401,
  );
  assert.match(
    await (await fetch(publicURL + "/news/operations-news/")).text(),
    /新闻原版正文/,
  );
  assert.equal(
    (await fetch(publicURL + `/media/${uploaded.doc.filename}`)).status,
    200,
  );
  assert.match(
    await (await fetch(publicURL + business.url)).text(),
    /operations-project/,
  );
  await request(`/api/content/${news.doc.id}`, "PATCH", {
    body: lexical("尚未选择发布的新正文。"),
  });
  await request(`/api/content/${news.doc.id}`, "PATCH", { approved: true });
  assert.equal(
    (await request("/api/publication/state")).items.find(
      (item: { id: string }) => item.id === String(news.doc.id),
    ).modified,
    true,
  );
  assert.match(
    await (await fetch(publicURL + "/news/operations-news/")).text(),
    /新闻原版正文/,
  );
  const editedPreview = await request("/api/publication/preview", "POST", {
    ids: [String(news.doc.id)],
    includeCompany: false,
  });
  await request(`/api/content/${news.doc.id}`, "PATCH", {
    body: lexical("预览之后的新正文，仍应留在草稿中。"),
  });
  const edited = await request("/api/publication/publish", "POST", {
    ids: [String(news.doc.id)],
    confirmed: true,
    previewId: editedPreview.previewUrl.split("/")[2],
  });
  assert.equal(edited.result.state, "published");
  assert.match(
    await (await fetch(publicURL + "/news/operations-news/")).text(),
    /尚未选择发布的新正文/,
  );
  assert.equal(
    (await request("/api/publication/state")).items.find(
      (item: { id: string }) => item.id === String(news.doc.id),
    ).modified,
    true,
  );
  assert.equal(
    (
      await responseFor("/api/publication/publish", {
        ids: [String(news.doc.id)],
        confirmed: true,
        previewId: editedPreview.previewUrl.split("/")[2],
      })
    ).status,
    422,
  );
  const off = await request("/api/publication/unpublish", "POST", {
    ids: [String(news.doc.id)],
    confirmed: true,
  });
  assert.equal(off.result.state, "unpublished");
  assert.equal((await fetch(publicURL + "/news/operations-news/")).status, 404);
  const restored = await request("/api/publication/rollback", "POST", {
    version: first.result.version,
    confirmed: true,
  });
  assert.equal(restored.result.state, "rolled_back");
  assert.equal(
    (await (await fetch(publicURL + "/release.json")).json()).version,
    first.result.version,
  );
  assert.match(
    await (await fetch(publicURL + "/news/operations-news/")).text(),
    /新闻原版正文/,
  );
  console.log(
    "PASS: migrated fresh SQLite, login, private drafts/media, image upload, protected preview, publish, edit isolation, project association, unpublish, and exact rollback.",
  );
} finally {
  child?.kill("SIGTERM");
  if (child && child.exitCode === null)
    await new Promise<void>((done) => {
      child!.once("exit", () => done());
      setTimeout(() => {
        child!.kill("SIGKILL");
        done();
      }, 5000).unref();
    });
  await new Promise<void>((done) => website.close(() => done()));
  await rm(directory, { recursive: true, force: true });
}
