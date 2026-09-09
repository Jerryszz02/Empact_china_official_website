import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createContactHandler, smtpDelivery } from "../scripts/contact.js";

const origin = "https://empact.cn";
const inquiry = () => ({
  business: "企业服务",
  contact: "test@example.com",
  message: "希望了解企业志愿活动的合作流程。",
  consent: true,
  idempotencyKey: randomUUID(),
});
test("contact validates origin, consent and payload without delivering", async () => {
  let count = 0;
  const handle = createContactHandler({
    origin,
    deliver: async () => {
      count++;
    },
  });
  assert.equal(
    (await handle(inquiry(), "https://evil.invalid", "1")).status,
    403,
  );
  assert.equal(
    (await handle({ ...inquiry(), consent: false }, origin, "1")).status,
    400,
  );
  assert.equal(
    (await handle({ ...inquiry(), contact: "a\nb" }, origin, "1")).status,
    400,
  );
  assert.equal(
    (await handle({ ...inquiry(), website: "spam" }, origin, "1")).status,
    400,
  );
  assert.equal(count, 0);
});
test("contact only succeeds on delivery; repeated key never sends twice", async () => {
  let count = 0;
  const handle = createContactHandler({
    origin,
    deliver: async () => {
      count++;
    },
  });
  const data = inquiry();
  assert.equal((await handle(data, origin, "2")).status, 200);
  assert.equal((await handle(data, origin, "2")).status, 200);
  assert.equal(count, 1);
  assert.equal(
    (
      await handle(
        { ...data, message: "已经更改的咨询正文需要重新提交。" },
        origin,
        "2",
      )
    ).status,
    409,
  );
});
test("missing config and transport failure return unavailable, retry can succeed", async () => {
  assert.equal(smtpDelivery({}), undefined);
  assert.equal(
    (await createContactHandler({ origin })(inquiry(), origin, "3")).status,
    503,
  );
  let fail = true;
  const handle = createContactHandler({
    origin,
    deliver: async () => {
      if (fail) throw Error("secret must not appear");
    },
  });
  const data = inquiry();
  const result = await handle(data, origin, "3");
  assert.equal(result.status, 503);
  assert.ok(!result.message.includes("secret"));
  fail = false;
  assert.equal((await handle(data, origin, "3")).status, 200);
});
test("rate limiting expires; in-flight duplicate is rejected", async () => {
  let now = 0;
  const handle = createContactHandler({
    origin,
    now: () => now,
    limit: 1,
    deliver: async () => {},
  });
  assert.equal((await handle(inquiry(), origin, "4")).status, 200);
  assert.equal((await handle(inquiry(), origin, "4")).status, 429);
  now = 16 * 60_000;
  assert.equal((await handle(inquiry(), origin, "4")).status, 200);
  let done!: () => void;
  const concurrent = createContactHandler({
    origin,
    deliver: () =>
      new Promise<void>((resolve) => {
        done = resolve;
      }),
  });
  const data = inquiry();
  const first = concurrent(data, origin, "5");
  assert.equal((await concurrent(data, origin, "5")).status, 409);
  done();
  assert.equal((await first).status, 200);
});
