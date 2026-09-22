import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createPublicServer } from "../scripts/public-server.js";

test("static server preserves real 404, blocks private files, switches release atomically and gates contact", async () => {
  const dir = await mkdtemp(join(tmpdir(), "empact-static-"));
  let deliveries = 0;
  const server = createPublicServer({
    root: join(dir, "current"),
    origin: "https://empact.cn",
    deliver: async () => {
      deliveries++;
    },
  });
  server.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}`;
  try {
    assert.equal((await fetch(url)).status, 503);
    await mkdir(join(dir, "one/about"), { recursive: true });
    await writeFile(join(dir, "one/index.html"), "<h1>release one</h1>");
    await writeFile(join(dir, "one/about/index.html"), "<h1>about</h1>");
    await writeFile(join(dir, "one/404.html"), "<h1>页面不存在</h1>");
    await writeFile(join(dir, "one/.env"), "must never leak");
    await writeFile(join(dir, "private.txt"), "must never leak");
    await symlink(join(dir, "private.txt"), join(dir, "one/leak.txt"));
    await symlink(join(dir, "one"), join(dir, "current"));
    const page = await fetch(url);
    assert.equal(page.status, 200);
    assert.match(
      page.headers.get("content-security-policy")!,
      /frame-ancestors 'none'/,
    );
    assert.match(await page.text(), /release one/);
    assert.equal(
      (await fetch(url + "/about", { redirect: "manual" })).status,
      301,
    );
    assert.equal((await fetch(url + "/about/")).status, 200);
    assert.equal(
      (await fetch(url + "/%2fabout", { redirect: "manual" })).status,
      404,
    );
    // A generated meta-refresh file must still be served as an HTTP redirect.
    await mkdir(join(dir, "one/youth/development-model"), { recursive: true });
    await mkdir(join(dir, "one/youth/international-talent-model"), {
      recursive: true,
    });
    await writeFile(
      join(dir, "one/youth/development-model/index.html"),
      '<meta http-equiv="refresh" content="0;url=/youth/international-talent-model/">',
    );
    await writeFile(
      join(dir, "one/youth/international-talent-model/index.html"),
      "<h1>国际人才培养模型</h1>",
    );
    for (const path of [
      "/youth/development-model",
      "/youth/development-model/",
      "/youth/development-model/index.html",
    ]) {
      for (const search of ["", "?source=bookmark&topic=learning"]) {
        for (const method of ["GET", "HEAD"]) {
          const redirect = await fetch(url + path + search, {
            method,
            redirect: "manual",
          });
          assert.equal(redirect.status, 301);
          assert.equal(
            redirect.headers.get("location"),
            "/youth/international-talent-model/" + search,
          );
          assert.equal(await redirect.text(), "");
        }
      }
    }
    const model = await fetch(url + "/youth/development-model/");
    assert.equal(model.status, 200);
    assert.equal(model.url, url + "/youth/international-talent-model/");
    assert.match(await model.text(), /国际人才培养模型/);
    assert.equal(
      (await fetch(url + "/youth/development-model/unknown")).status,
      404,
    );
    assert.equal(
      (
        await fetch(url + "/youth/development-model/", {
          method: "POST",
          redirect: "manual",
        })
      ).status,
      405,
    );
    for (const path of [
      "/projects/chatcircle",
      "/projects/chatcircle/",
      "/projects/chatcircle/?source=bookmark",
    ]) {
      for (const method of ["GET", "HEAD"]) {
        const redirect = await fetch(url + path, {
          method,
          redirect: "manual",
        });
        assert.equal(redirect.status, 301);
        assert.equal(
          redirect.headers.get("location"),
          "https://chatcircle.empact.cn",
        );
      }
    }
    assert.equal(
      (await fetch(url + "/projects/chatcircle/unknown")).status,
      404,
    );
    assert.equal((await fetch(url + "/missing")).status, 404);
    assert.equal((await fetch(url + "/.env")).status, 404);
    assert.equal((await fetch(url + "/leak.txt")).status, 404);
    assert.equal((await fetch(url, { method: "DELETE" })).status, 405);
    const body = JSON.stringify({
      business: "",
      contact: "test@example.com",
      message: "请告知项目的具体合作要求。",
      consent: true,
      idempotencyKey: randomUUID(),
    });
    const post = () =>
      fetch(url + "/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://empact.cn",
        },
        body,
      });
    assert.equal((await post()).status, 503);
    await writeFile(
      join(dir, "one/release.json"),
      JSON.stringify({ mode: "preview", contactEnabled: true }),
    );
    assert.equal((await post()).status, 503);
    await writeFile(
      join(dir, "one/release.json"),
      JSON.stringify({ mode: "production", contactEnabled: true }),
    );
    assert.equal((await post()).status, 200);
    assert.equal(deliveries, 1);
    const detailed = JSON.stringify({
      segment: "corporate",
      business: "x".repeat(120),
      businessTitle: "业".repeat(160),
      name: "姓".repeat(80),
      organization: "公".repeat(160),
      role: "职".repeat(100),
      contact: "test@example.com",
      message: "需".repeat(3000),
      goal: "目".repeat(1000),
      location: "地".repeat(120),
      timeline: "时".repeat(160),
      participants: "人".repeat(100),
      budget: "额".repeat(100),
      referenceUrl: "https://example.com/" + "a".repeat(1900),
      consent: true,
      idempotencyKey: randomUUID(),
    });
    assert.ok(Buffer.byteLength(detailed) > 16_384);
    const sendDetailed = (body: string) =>
      fetch(url + "/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://empact.cn",
        },
        body,
      });
    assert.equal((await sendDetailed(detailed)).status, 200);
    assert.equal(deliveries, 2);
    assert.equal((await sendDetailed("x".repeat(32_769))).status, 413);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
