import { z } from "zod";

export const inquirySegments = [
  { value: "youth", label: "青少年项目" },
  { value: "corporate", label: "企业服务" },
  { value: "school", label: "学校业务" },
  { value: "community", label: "社区业务" },
  { value: "other", label: "其他／暂不确定" },
] as const;

const line = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((value) => !/[\r\n]/.test(value));
const optionalLine = (max: number) => line(max).default("");

/** New fields stay optional for pages opened before the form upgrade. */
export const contactSchema = z
  .object({
    kind: z.literal("inquiry").optional(),
    business: optionalLine(120),
    segment: z
      .enum(["youth", "corporate", "school", "community", "other"])
      .optional(),
    businessTitle: optionalLine(160),
    name: optionalLine(80),
    organization: optionalLine(160),
    role: optionalLine(100),
    contact: line(160).refine((value) => value.length >= 3),
    message: z.string().trim().min(10).max(3000),
    goal: z.string().trim().max(1000).default(""),
    location: optionalLine(120),
    timeline: optionalLine(160),
    participants: optionalLine(100),
    budget: optionalLine(100),
    referenceUrl: z
      .union([
        z.literal(""),
        z
          .url()
          .max(2000)
          .refine((value) => /^https?:\/\//i.test(value)),
      ])
      .default(""),
    consent: z.literal(true),
    website: z.string().max(200).optional(),
    idempotencyKey: z.string().uuid(),
  })
  .strict()
  .refine((value) => !value.segment || Boolean(value.name && value.business), {
    message: "请填写称呼并选择咨询方向。",
  });

export type Inquiry = z.infer<typeof contactSchema>;

const httpUrl = z
  .union([
    z.literal(""),
    z
      .url()
      .max(2000)
      .refine((value) => /^https?:\/\//i.test(value)),
  ])
  .default("");

export const recruitmentApplicationSchema = z
  .object({
    kind: z.literal("recruitment"),
    jobId: line(120).min(1),
    name: line(80).min(1),
    email: z.email().max(254),
    contact: optionalLine(160),
    experience: z.string().trim().min(10).max(3000),
    availability: line(160).min(1),
    resumeUrl: httpUrl,
    portfolioUrl: httpUrl,
    consent: z.literal(true),
    website: z.string().max(200).optional(),
    idempotencyKey: z.string().uuid(),
  })
  .strict()
  .refine((value) => Boolean(value.resumeUrl || value.portfolioUrl), {
    message: "请提供简历或作品链接。",
  });

export type RecruitmentApplicationRequest = z.infer<
  typeof recruitmentApplicationSchema
>;

export const contactSubmissionSchema = z.union([
  recruitmentApplicationSchema,
  contactSchema,
]);

export function inquiryBusinessLabel(inquiry: Inquiry) {
  const segment = inquirySegments.find(
    (item) => item.value === inquiry.segment,
  )?.label;
  const business = inquiry.businessTitle || inquiry.business || "未选择";
  return segment ? `${segment} / ${business}` : business;
}
