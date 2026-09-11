import assert from "node:assert/strict";
import sharp from "sharp";

/** Runs against the isolated authenticated CMS and its real built public site. */
export async function verifyBusinessWorkflow(options: {
  base: string;
  publicURL: string;
  cookies: string;
  businessId: string;
  coverId: number;
  request: (path: string, method?: string, data?: unknown) => Promise<any>;
  lexical: (text: string) => any;
}) {
  const { base, publicURL, cookies, businessId, coverId, request, lexical } =
    options;
  const action = (name: string, id: string) =>
    request(`/api/business-admin/${name}`, "POST", { id, confirmed: true });
  const publicText = async (path: string) =>
    (await fetch(publicURL + path)).text();
  assert.equal((await fetch(base + "/api/business-admin/state")).status, 401);
  const forbidden = await fetch(base + "/api/business-admin/publish", {
    method: "POST",
    headers: {
      Cookie: cookies,
      Origin: "https://invalid.example",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: businessId, confirmed: true }),
  });
  assert.ok([401, 403].includes(forbidden.status));

  const form = new FormData();
  form.set(
    "_payload",
    JSON.stringify({
      alt: "仅在正文中使用的图片",
      usageApproval: "隔离测试素材",
      approved: false,
    }),
  );
  form.set(
    "file",
    new Blob(
      [
        await sharp({
          create: { width: 30, height: 20, channels: 3, background: "#125284" },
        })
          .png()
          .toBuffer(),
      ],
      { type: "image/png" },
    ),
    "body.png",
  );
  const imageResponse = await fetch(base + "/api/media", {
    method: "POST",
    headers: { Cookie: cookies, Origin: base },
    body: form,
  });
  const image = (await imageResponse.json()).doc;
  assert.equal(imageResponse.status, 201);
  const body = lexical("案例原版正文。");
  body.root.children.push({
    type: "upload",
    version: 3,
    relationTo: "media",
    value: image.id,
    fields: { caption: "活动现场图注" },
    format: "",
  });
  const created = await request("/api/content", "POST", {
    kind: "case",
    slug: "business-workflow-case",
    title: "图文案例验收",
    summary: "独立案例摘要。",
    body,
    parent: Number(businessId),
    image: coverId,
    approved: false,
  });
  const id = String(created.doc.id),
    url = "/cases/business-workflow-case/";
  assert.equal((await fetch(publicURL + url)).status, 404);
  const invalidBody = structuredClone(body);
  invalidBody.root.children.at(-1).value = 999999;
  const invalidReference = await fetch(base + `/api/content/${id}`, {
    method: "PATCH",
    headers: {
      Cookie: cookies,
      Origin: base,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body: invalidBody }),
  });
  assert.equal(
    invalidReference.status,
    400,
    "missing inline media is rejected on save",
  );
  assert.equal(
    (await request("/api/business-admin/state")).items.some(
      (item: any) => item.id === id,
    ),
    true,
  );

  const deletedMedia = await fetch(base + `/api/media/${image.id}`, {
    method: "DELETE",
    headers: { Cookie: cookies, Origin: base },
  });
  assert.ok(
    [400, 403, 409].includes(deletedMedia.status),
    "draft inline image must be protected",
  );
  const preview = await action("preview", id);
  assert.ok(preview.previewUrl.includes(url));
  assert.equal((await fetch(base + preview.previewUrl)).status, 401);
  const previewPage = await fetch(base + preview.previewUrl, {
    headers: { Cookie: cookies, "Sec-Fetch-Site": "same-origin" },
  });
  assert.equal(previewPage.status, 200);
  assert.match(await previewPage.text(), /案例原版正文/);
  await action("publish", id);
  const firstDate = (await request(`/api/content/${id}`)).publishedAt;
  assert.ok(firstDate);
  assert.match(await publicText(url), /案例原版正文/);
  assert.match(await publicText(url), /活动现场图注/);
  assert.match(await publicText(url), new RegExp(image.filename));
  assert.equal(
    (await fetch(publicURL + `/media/${image.filename}`)).status,
    200,
  );
  assert.match(
    await publicText("/sitemap.xml"),
    /cases\/business-workflow-case/,
  );

  await request(`/api/content/${id}`, "PATCH", {
    body: lexical("案例修改后正文。"),
  });
  assert.match(await publicText(url), /案例原版正文/);
  let items = (await request("/api/business-admin/state")).items;
  assert.equal(items.find((item: any) => item.id === id).modified, true);
  const otherBusiness = items.find(
    (item: any) =>
      item.kind === "business" && item.live && item.id !== businessId,
  );
  assert.ok(otherBusiness);
  await request(`/api/content/${id}`, "PATCH", {
    parent: Number(otherBusiness.id),
  });
  await action("publish", id);
  assert.match(await publicText(url), /案例修改后正文/);
  assert.equal((await request(`/api/content/${id}`)).publishedAt, firstDate);
  assert.match(
    await publicText(otherBusiness.url),
    /cases\/business-workflow-case/,
  );

  const blocked = await fetch(base + "/api/business-admin/delete", {
    method: "POST",
    headers: {
      Cookie: cookies,
      Origin: base,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: otherBusiness.id, confirmed: true }),
  });
  assert.ok(
    [400, 409, 422].includes(blocked.status),
    "cannot delete nonempty business",
  );
  await action("unpublish", id);
  assert.equal((await fetch(publicURL + url)).status, 404);
  assert.doesNotMatch(
    await publicText("/sitemap.xml"),
    /cases\/business-workflow-case/,
  );
  assert.ok(await request(`/api/content/${id}`));
  await action("publish", id);
  assert.equal((await fetch(publicURL + url)).status, 200);
  await action("delete", id);
  assert.equal((await fetch(publicURL + url)).status, 404);
  items = (await request("/api/business-admin/state")).items;
  assert.equal(
    items.some((item: any) => item.id === id),
    false,
  );

  const empty = await request("/api/content", "POST", {
    kind: "business",
    slug: "empty-business-workflow",
    title: "新业务验收",
    summary: "新业务简介。",
    body: lexical("新业务完整介绍。"),
    segment: "corporate",
    order: 2,
  });
  await action("publish", String(empty.doc.id));
  assert.match(await publicText("/corporate/"), /empty-business-workflow/);
  await action("delete", String(empty.doc.id));
  assert.equal(
    (await fetch(publicURL + "/corporate/empty-business-workflow/")).status,
    404,
  );
  assert.doesNotMatch(
    await publicText("/corporate/"),
    /empty-business-workflow/,
  );
  console.log(
    "PASS: business CRUD, rich case preview/publish/edit/transfer/unpublish/delete, inline media protection, stable date and sitemap.",
  );
}
