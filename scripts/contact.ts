import { createHash } from "node:crypto";
import { z } from "zod";
import nodemailer from "nodemailer";
import {
  contactSubmissionSchema,
  inquiryBusinessLabel,
  type RecruitmentApplicationRequest,
  type Inquiry,
} from "@empact/content/inquiry";

export {
  contactSchema,
  recruitmentApplicationSchema,
} from "@empact/content/inquiry";
export type { Inquiry, RecruitmentApplicationRequest };
export type RecruitmentJobForApplication = {
  title: string;
  status: "open" | "closed";
  isExample: boolean;
};
export type RecruitmentApplication = RecruitmentApplicationRequest & {
  jobTitle: string;
};
export type ContactMessage = Inquiry | RecruitmentApplication;
type Delivery = (message: ContactMessage) => Promise<void>;
type Result = { status: number; message: string };

/** In-memory abuse/idempotency records contain hashes only, never submitted text. */
export function createContactHandler(options: {
  origin: string;
  deliver?: Delivery;
  getJob?: (jobId: string) => Promise<RecruitmentJobForApplication | undefined>;
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
      return { status: 403, message: "请从官网表单提交。" };
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
    const result = contactSubmissionSchema.safeParse(input);
    if (!result.success || result.data.website)
      return {
        status: 400,
        message:
          input &&
          typeof input === "object" &&
          "kind" in input &&
          input.kind === "recruitment"
            ? "请检查姓名、邮箱、经历、可到岗时间及简历或作品链接，并同意隐私告知。"
            : "请检查咨询方向、称呼、联系方式及资料链接，填写至少 10 字的需求，并同意隐私告知。",
      };
    if (!options.deliver)
      return {
        status: 503,
        message:
          result.data.kind === "recruitment"
            ? "在线申请暂未开放，请稍后重试。"
            : "在线咨询暂未开放，请使用页面列出的联系方式。",
      };
    const submitted = result.data;
    let message: ContactMessage;
    if (submitted.kind === "recruitment") {
      let job: RecruitmentJobForApplication | undefined;
      try {
        job = await options.getJob?.(submitted.jobId);
      } catch {
        return { status: 503, message: "暂时无法核对岗位状态，请稍后重试。" };
      }
      if (
        !job ||
        job.status !== "open" ||
        job.isExample ||
        !job.title.trim() ||
        /[\r\n]/.test(job.title)
      )
        return {
          status: 409,
          message: "该岗位已停止招聘，请返回招聘页选择其他岗位。",
        };
      message = { ...submitted, jobTitle: job.title };
    } else message = submitted;
    const key = hash(message.idempotencyKey);
    const { idempotencyKey: _, website: __, ...deliveredFields } = message;
    const digest = hash(JSON.stringify(deliveredFields));
    const existing = delivered.get(key);
    if (existing)
      return existing.digest === digest
        ? {
            status: 200,
            message:
              message.kind === "recruitment"
                ? "您的申请已送达，请勿重复提交。"
                : "您的咨询已送达，请勿重复提交。",
          }
        : { status: 409, message: "内容已更改，请刷新页面后重新提交。" };
    if (pending.has(key)) return { status: 409, message: "正在提交，请稍候。" };
    pending.add(key);
    try {
      await options.deliver(message);
      delivered.set(key, { digest, until: time + 24 * 60 * 60_000 });
      return {
        status: 200,
        message:
          message.kind === "recruitment"
            ? "申请已送达，我们会通过您留下的联系方式回复。"
            : "咨询已送达，我们会通过您留下的联系方式回复。",
      };
    } catch {
      return {
        status: 503,
        message:
          message.kind === "recruitment"
            ? "申请未能送达，请稍后重试。"
            : "咨询未能送达，请稍后重试或使用页面列出的联系方式。",
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

export function recruitmentMailText(application: RecruitmentApplication) {
  return [
    `申请岗位：${application.jobTitle}`,
    `岗位 ID：${application.jobId}`,
    `申请人姓名：${application.name}`,
    `邮箱：${application.email}`,
    `其他联系方式：${application.contact || "未填写"}`,
    "",
    `相关经历：\n${application.experience}`,
    `可到岗时间：${application.availability}`,
    `简历链接：${application.resumeUrl || "未填写"}`,
    `作品链接：${application.portfolioUrl || "未填写"}`,
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
  return async (message) => {
    const result = await transport.sendMail({
      from: env.CONTACT_FROM,
      to: env.CONTACT_TO,
      subject:
        message.kind === "recruitment"
          ? `Empact 官网招聘申请：${message.jobTitle}`
          : "Empact 官网咨询",
      text:
        message.kind === "recruitment"
          ? recruitmentMailText(message)
          : inquiryMailText(message),
    });
    if (!result.accepted?.length || result.rejected?.length)
      throw new Error("Delivery rejected");
  };
}
