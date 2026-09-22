import { createHash } from "node:crypto";
import { z } from "zod";
import nodemailer from "nodemailer";
import {
  contactSchema,
  inquiryBusinessLabel,
  type Inquiry,
} from "@empact/content/inquiry";

export { contactSchema };
export type { Inquiry };
type Delivery = (inquiry: Inquiry) => Promise<void>;
type Result = { status: number; message: string };

/** In-memory abuse/idempotency records contain hashes only, never submitted text. */
export function createContactHandler(options: {
  origin: string;
  deliver?: Delivery;
  now?: () => number;
  limit?: number;
}) {
  const attempts = new Map<string, { count: number; until: number }>();
  const delivered = new Map<string, { digest: string; until: number }>();
  const pending = new Set<string>();
  const now = options.now ?? Date.now;
  const hash = (v: string) => createHash("sha256").update(v).digest("hex");
  return async (
    input: unknown,
    origin: string | undefined,
    ip: string,
  ): Promise<Result> => {
    if (origin !== options.origin)
      return { status: 403, message: "请从官网咨询页面提交。" };
    const time = now();
    for (const [key, value] of attempts)
      if (value.until <= time) attempts.delete(key);
    for (const [key, value] of delivered)
      if (value.until <= time) delivered.delete(key);
    const address = hash(ip);
    if (!attempts.has(address) && attempts.size >= 10_000)
      return { status: 429, message: "提交较频繁，请 15 分钟后再试。" };
    const previous = attempts.get(address) ?? {
      count: 0,
      until: time + 15 * 60_000,
    };
    previous.count++;
    attempts.set(address, previous);
    if (previous.count > (options.limit ?? 5)) {
      return { status: 429, message: "提交较频繁，请 15 分钟后再试。" };
    }
    const result = contactSchema.safeParse(input);
    if (!result.success || result.data.website)
      return {
        status: 400,
        message:
          "请检查咨询方向、称呼、联系方式及资料链接，填写至少 10 字的需求，并同意隐私告知。",
      };
    if (!options.deliver)
      return {
        status: 503,
        message: "在线咨询暂未开放，请使用页面列出的联系方式。",
      };
    const inquiry = result.data;
    const key = hash(inquiry.idempotencyKey);
    const { idempotencyKey: _, website: __, ...deliveredFields } = inquiry;
    const digest = hash(JSON.stringify(deliveredFields));
    const existing = delivered.get(key);
    if (existing)
      return existing.digest === digest
        ? { status: 200, message: "您的咨询已送达，请勿重复提交。" }
        : { status: 409, message: "内容已更改，请刷新页面后重新提交。" };
    if (pending.has(key)) return { status: 409, message: "正在提交，请稍候。" };
    pending.add(key);
    try {
      await options.deliver(inquiry);
      delivered.set(key, { digest, until: time + 24 * 60 * 60_000 });
      return {
        status: 200,
        message: "咨询已送达，我们会通过您留下的联系方式回复。",
      };
    } catch {
      return {
        status: 503,
        message: "咨询未能送达，请稍后重试或使用页面列出的联系方式。",
      };
    } finally {
      pending.delete(key);
    }
  };
}

export function inquiryMailText(inquiry: Inquiry) {
  return [
    `业务方向：${inquiryBusinessLabel(inquiry)}`,
    `称呼：${inquiry.name || "未填写"}`,
    `联系方式：${inquiry.contact}`,
    `机构名称：${inquiry.organization || "未填写"}`,
    `职位：${inquiry.role || "未填写"}`,
    "",
    `需求说明：\n${inquiry.message}`,
    `合作目标：\n${inquiry.goal || "未填写"}`,
    "",
    `地点：${inquiry.location || "未确定"}`,
    `预计时间：${inquiry.timeline || "未确定"}`,
    `人数：${inquiry.participants || "未确定"}`,
    `预算：${inquiry.budget || "未确定"}`,
    `资料链接：${inquiry.referenceUrl || "未填写"}`,
    "",
    "已同意官网隐私告知。",
  ].join("\n");
}

export function smtpDelivery(
  env: Partial<NodeJS.ProcessEnv>,
): Delivery | undefined {
  const required = [
    "SMTP_HOST",
    "SMTP_USER",
    "SMTP_PASS",
    "CONTACT_FROM",
    "CONTACT_TO",
    "CONTACT_RECEIVER_NAME",
  ];
  if (env.CONTACT_ENABLED !== "true" || required.some((name) => !env[name]))
    return undefined;
  const email = z.email();
  email.parse(env.CONTACT_FROM);
  email.parse(env.CONTACT_TO);
  const port = Number(env.SMTP_PORT || 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("SMTP_PORT invalid");
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: env.SMTP_SECURE !== "false",
    requireTLS: env.SMTP_SECURE === "false",
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return async (inquiry) => {
    const result = await transport.sendMail({
      from: env.CONTACT_FROM,
      to: env.CONTACT_TO,
      subject: "Empact 官网咨询",
      text: inquiryMailText(inquiry),
    });
    if (!result.accepted?.length || result.rejected?.length)
      throw new Error("Delivery rejected");
  };
}
