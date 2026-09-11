import { getPayload } from "payload";
import config from "@payload-config";
import {
  businessAdminMutation,
  businessAdminState,
  type BusinessAdminAction,
} from "../../../../business-admin.js";

export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
};

async function authenticate(request: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: request.headers });
  return {
    payload,
    permitted: user?.collection === "users" && user.role === "admin",
  };
}

export async function GET(request: Request) {
  const { payload, permitted } = await authenticate(request);
  if (!permitted)
    return Response.json({ error: "请先登录后台。" }, { status: 401, headers });
  return Response.json(await businessAdminState(payload), { headers });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  const { payload, permitted } = await authenticate(request);
  if (!permitted)
    return Response.json({ error: "请先登录后台。" }, { status: 401, headers });
  const origin = request.headers.get("origin");
  if (origin !== new URL(process.env.CMS_URL || "http://127.0.0.1:3000").origin)
    return Response.json({ error: "请求来源无效。" }, { status: 403, headers });
  const { action } = await context.params;
  if (!["preview", "publish", "unpublish", "delete"].includes(action))
    return Response.json({ error: "操作不存在。" }, { status: 404, headers });
  try {
    const body = (await request.json()) as {
      id?: unknown;
      confirmed?: unknown;
    };
    if (typeof body.id !== "string" || !body.id)
      throw new Error("缺少内容 ID。");
    if (action !== "preview" && body.confirmed !== true)
      throw new Error("请先勾选确认本次操作。");
    return Response.json(
      await businessAdminMutation(
        payload,
        action as BusinessAdminAction,
        body.id,
      ),
      { headers },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "操作失败，请联系维护人。",
      },
      { status: 400, headers },
    );
  }
}
