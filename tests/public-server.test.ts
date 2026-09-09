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
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
