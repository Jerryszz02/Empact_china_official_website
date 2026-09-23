import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  contactSchema,
  createContactHandler,
  inquiryMailText,
  recruitmentApplicationSchema,
  recruitmentMailText,
  smtpDelivery,
  type ContactMessage,
} from "../scripts/contact.js";

const origin = "https://empact.cn";
const inquiry = () => ({
  business: "企业服务",
  contact: "test@example.com",
  message: "希望了解企业志愿活动的合作流程。",
  consent: true,
  idempotencyKey: randomUUID(),
});
const detailedInquiry = () => ({
  ...inquiry(),
  segment: "corporate",
  business: "corporate-volunteering",
  businessTitle: "企业志愿者、CSR与公益咨询",
  name: "测试联系人",
  organization: "测试机构",
  role: "项目负责人",
  goal: "让团队参与社区服务",
  location: "上海",
  timeline: "十月至十一月",
  participants: "30—50 人",
  budget: "人民币 5 万元以内",
  referenceUrl: "https://example.com/project",
});
const application = () => ({
  kind: "recruitment" as const,
  jobId: "program-coordinator",
  name: "申请人",
  email: "candidate@example.com",
  contact: "13800000000",
  experience: "曾负责社区项目协调与志愿者培训。",
  availability: "2026 年 10 月",
  resumeUrl: "https://example.com/resume.pdf",
  portfolioUrl: "https://example.com/portfolio",
  consent: true,
  website: "",
  idempotencyKey: randomUUID(),
});
test("new inquiry validates optional details and produces a complete readable email", () => {
  const data = contactSchema.parse(detailedInquiry());
  const mail = inquiryMailText(data);
  assert.match(mail, /企业服务 \/ 企业志愿者、CSR与公益咨询/);
  for (const key of [
    "name",
    "organization",
    "role",
    "goal",
    "location",
    "timeline",
    "participants",
    "budget",
    "referenceUrl",
  ] as const)
    assert.ok(mail.includes(data[key]), key);
  assert.equal(
    contactSchema.safeParse({ ...detailedInquiry(), name: " " }).success,
    false,
  );
  assert.equal(
    contactSchema.safeParse({ ...detailedInquiry(), business: "" }).success,
    false,
  );
  for (const referenceUrl of [
    "javascript:alert(1)",
    "ftp://example.com/file",
    "not a link",
  ])
    assert.equal(
      contactSchema.safeParse({ ...detailedInquiry(), referenceUrl }).success,
      false,
    );
  assert.equal(
    contactSchema.safeParse({ ...detailedInquiry(), role: "name\nInjected" })
      .success,
    false,
  );
  assert.equal(
    contactSchema.safeParse(inquiry()).success,
    true,
    "legacy requests remain accepted",
  );
});
test("changing any delivered new field invalidates a reused submission key", async () => {
  for (const field of [
    "segment",
    "businessTitle",
    "name",
    "organization",
    "role",
    "goal",
    "location",
    "timeline",
    "participants",
    "budget",
    "referenceUrl",
  ] as const) {
    let delivered = 0;
    const handle = createContactHandler({
      origin,
      deliver: async () => {
        delivered++;
      },
    });
    const original = detailedInquiry();
    assert.equal((await handle(original, origin, field)).status, 200);
    const changed =
      field === "segment"
        ? "school"
        : field === "referenceUrl"
          ? "https://example.com/changed"
          : "已修改";
    assert.equal(
      (await handle({ ...original, [field]: changed }, origin, field)).status,
      409,
      field,
    );
    assert.equal(delivered, 1);
  }
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

test("recruitment application validates links and sends canonical job details", async () => {
  const data = application();
  assert.equal(recruitmentApplicationSchema.safeParse(data).success, true);
  for (const bad of [
    "javascript:alert(1)",
    "ftp://example.com/cv",
    "not a link",
  ])
    assert.equal(
      recruitmentApplicationSchema.safeParse({ ...data, resumeUrl: bad })
        .success,
      false,
    );
  assert.equal(
    recruitmentApplicationSchema.safeParse({
      ...data,
      resumeUrl: "",
      portfolioUrl: "",
    }).success,
    false,
  );
  assert.equal(
    recruitmentApplicationSchema.safeParse({
      ...data,
      availability: "Now\nBcc: evil@example.com",
    }).success,
    false,
  );
  const delivered: ContactMessage[] = [];
  const handle = createContactHandler({
    origin,
    getJob: async () => ({
      title: "项目协调员",
      status: "open",
      isExample: false,
    }),
    deliver: async (message) => {
      delivered.push(message);
    },
  });
  assert.equal(
    (await handle({ ...data, jobTitle: "伪造岗位" }, origin, "recruit-1"))
      .status,
    400,
  );
  assert.equal((await handle(data, origin, "recruit-1")).status, 200);
  assert.equal(delivered.length, 1);
  const message = delivered[0];
  assert.equal(message.kind, "recruitment");
  if (message.kind !== "recruitment") throw new Error("unexpected inquiry");
  assert.equal(message.jobTitle, "项目协调员");
  const text = recruitmentMailText(message);
  for (const value of [
    "项目协调员",
    data.name,
    data.email,
    data.contact,
    data.experience,
    data.availability,
    data.resumeUrl,
    data.portfolioUrl,
  ])
    assert.ok(text.includes(value), value);
  assert.equal((await handle(data, origin, "recruit-1")).status, 200);
  assert.equal(delivered.length, 1);
  assert.equal(
    (
      await handle(
        { ...data, experience: "增加了新的相关工作经验。" },
        origin,
        "recruit-1",
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await handle(
        { ...inquiry(), idempotencyKey: data.idempotencyKey },
        origin,
        "recruit-1",
      )
    ).status,
    409,
    "one key cannot be reused between inquiry and recruitment",
  );
});

test("recruitment rejects missing, closed and example jobs before delivery", async () => {
  for (const job of [
    undefined,
    { title: "已关闭岗位", status: "closed" as const, isExample: false },
    { title: "示例岗位", status: "open" as const, isExample: true },
  ]) {
    let deliveries = 0;
    const handle = createContactHandler({
      origin,
      getJob: async () => job,
      deliver: async () => {
        deliveries++;
      },
    });
    assert.equal(
      (await handle(application(), origin, "recruit-2")).status,
      409,
    );
    assert.equal(deliveries, 0);
  }
});
