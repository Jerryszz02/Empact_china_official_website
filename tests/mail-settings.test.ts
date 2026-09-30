import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import nodemailer from "nodemailer";
import { saveMailSettings } from "../apps/cms/src/mail-settings.js";
import {
  defaultMailSettings,
  mailRecipient,
  readMailSettings,
} from "../scripts/mail-settings.js";
import {
  smtpDelivery,
  contactSchema,
  recruitmentApplicationSchema,
} from "../scripts/contact.js";

test("saved recipients override the legacy recipient and change without restarting SMTP", async (t) => {
  const runtime = await mkdtemp(join(tmpdir(), "empact-mail-settings-"));
  const sent: { to: string; subject: string }[] = [];
  t.mock.method(nodemailer, "createTransport", () => ({
    sendMail: async (message: { to: string; subject: string }) => {
      sent.push(message);
      return { accepted: [message.to], rejected: [] };
    },
  }));
  try {
    const deliver = smtpDelivery(
      {
        CONTACT_ENABLED: "true",
        SMTP_HOST: "smtp.example.invalid",
        SMTP_USER: "test",
        SMTP_PASS: "fixture",
        CONTACT_FROM: "sender@example.com",
        CONTACT_TO: "legacy@example.com",
      },
      (message) => mailRecipient(message.kind, runtime),
    );
    assert.ok(deliver);
    const inquiry = contactSchema.parse({
      business: "企业服务",
      contact: "client@example.com",
      message: "希望了解企业志愿活动的合作流程。",
      consent: true,
      idempotencyKey: "00000000-0000-4000-8000-000000000001",
    });
    const application = {
      ...recruitmentApplicationSchema.parse({
        kind: "recruitment",
        jobId: "coordinator",
        name: "申请人",
        email: "candidate@example.com",
        experience: "曾负责社区项目协调与志愿者培训。",
        availability: "十月",
        resumeUrl: "https://example.com/resume.pdf",
        consent: true,
        idempotencyKey: "00000000-0000-4000-8000-000000000002",
      }),
      jobTitle: "项目协调员",
    };
    await deliver(inquiry);
    await deliver(application);
    assert.deepEqual(
      sent.map((message) => message.to),
      [defaultMailSettings.inquiryEmail, defaultMailSettings.recruitmentEmail],
    );
    await saveMailSettings(
      {
        inquiryEmail: "inquiry@example.com",
        recruitmentEmail: "jobs@example.com",
      },
      runtime,
    );
    await deliver(inquiry);
    await deliver(application);
    assert.deepEqual(
      sent.slice(2).map((message) => message.to),
      ["inquiry@example.com", "jobs@example.com"],
    );
    assert.match(sent[3].subject, /招聘申请：项目协调员/);
    await writeFile(join(runtime, "mail-settings.json"), "invalid json");
    await assert.rejects(deliver(inquiry));
    assert.equal(
      sent.length,
      4,
      "invalid settings never send to a fallback mailbox",
    );
  } finally {
    await rm(runtime, { recursive: true, force: true });
  }
});

test("invalid settings preserve the previous pair and shared file permissions remain private", async () => {
  const runtime = await mkdtemp(join(tmpdir(), "empact-mail-permissions-"));
  const previousGroup = process.env.PUBLIC_READER_GID;
  process.env.PUBLIC_READER_GID = String(process.getgid!());
  try {
    await saveMailSettings(defaultMailSettings, runtime);
    assert.equal(
      (await stat(join(runtime, "mail-settings.json"))).mode & 0o777,
      0o640,
    );
    assert.equal((await stat(runtime)).mode & 0o777, 0o710);
    for (const data of [
      { ...defaultMailSettings, inquiryEmail: "invalid" },
      {
        ...defaultMailSettings,
        recruitmentEmail: "a@example.com,b@example.com",
      },
      {
        ...defaultMailSettings,
        inquiryEmail: "a@example.com\r\nBcc: b@example.com",
      },
      { inquiryEmail: "a@example.com" },
    ])
      await assert.rejects(saveMailSettings(data, runtime));
    assert.deepEqual(await readMailSettings(runtime), defaultMailSettings);
    process.env.PUBLIC_READER_GID = "invalid";
    await assert.rejects(
      saveMailSettings(
        {
          inquiryEmail: "new@example.com",
          recruitmentEmail: "new@example.com",
        },
        runtime,
      ),
    );
    assert.deepEqual(await readMailSettings(runtime), defaultMailSettings);
  } finally {
    if (previousGroup === undefined) delete process.env.PUBLIC_READER_GID;
    else process.env.PUBLIC_READER_GID = previousGroup;
    await rm(runtime, { recursive: true, force: true });
  }
});
