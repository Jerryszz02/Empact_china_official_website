import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";

export const mailSettingsSchema = z
  .object({
    inquiryEmail: z.email().max(254),
    recruitmentEmail: z.email().max(254),
  })
  .strict();
export type MailSettings = z.infer<typeof mailSettingsSchema>;
export const defaultMailSettings: MailSettings = {
  inquiryEmail: "enquiries@empact.asia",
  recruitmentEmail: "enquiries@empact.asia",
};
export const mailSettingsPath = (
  runtime = resolve(process.env.RUNTIME_DIR || ".data/site"),
) => join(runtime, "mail-settings.json");

export async function readMailSettings(
  runtime?: string,
): Promise<MailSettings> {
  let source: string;
  try {
    source = await readFile(mailSettingsPath(runtime), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { ...defaultMailSettings };
    throw error;
  }
  // Invalid or unreadable saved settings must not silently reroute submissions.
  return mailSettingsSchema.parse(JSON.parse(source));
}

export async function mailRecipient(
  kind: "inquiry" | "recruitment" | undefined,
  runtime?: string,
) {
  const settings = await readMailSettings(runtime);
  return kind === "recruitment"
    ? settings.recruitmentEmail
    : settings.inquiryEmail;
}
