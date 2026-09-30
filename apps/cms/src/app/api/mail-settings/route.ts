import { getPayload } from "payload";
import config from "@payload-config";
import {
  readMailSettings,
  mailSettingsSchema,
} from "../../../../../../scripts/mail-settings.js";
import { saveMailSettings } from "../../../mail-settings.js";

export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
};
async function permitted(request: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: request.headers });
  return user?.collection === "users" && user.role === "admin";
}
export async function GET(request: Request) {
  if (!(await permitted(request)))
    return Response.json({ error: "请先登录后台。" }, { status: 401, headers });
  try {
    return Response.json(await readMailSettings(), { headers });
  } catch {
    return Response.json(
      { error: "暂时无法读取收件设置，请联系维护人。" },
      { status: 503, headers },
    );
  }
}
export async function POST(request: Request) {
  if (!(await permitted(request)))
    return Response.json({ error: "请先登录后台。" }, { status: 401, headers });
  if (
    request.headers.get("origin") !==
    new URL(process.env.CMS_URL || "http://127.0.0.1:3000").origin
  )
    return Response.json({ error: "请求来源无效。" }, { status: 403, headers });
  const parsed = mailSettingsSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return Response.json(
      { error: "请为咨询和招聘各填写一个有效的邮箱地址。" },
      { status: 400, headers },
    );
  try {
    return Response.json(await saveMailSettings(parsed.data), { headers });
  } catch {
    return Response.json(
      { error: "收件设置保存失败，请重试或联系维护人。" },
      { status: 503, headers },
    );
  }
}
