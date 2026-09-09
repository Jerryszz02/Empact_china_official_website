import config from "@payload-config";
import {
  REST_DELETE,
  REST_GET,
  REST_OPTIONS,
  REST_PATCH,
  REST_POST,
  REST_PUT,
} from "@payloadcms/next/routes";
export const GET = REST_GET(config);
const restPost = REST_POST(config);
export const POST: typeof restPost = (request, context) => {
  const path = new URL(request.url).pathname;
  if (/\/users\/(first-register|forgot-password|reset-password)\/?$/.test(path))
    return Promise.resolve(
      Response.json(
        { errors: [{ message: "请联系维护人通过本机命令管理账号。" }] },
        { status: 403 },
      ),
    );
  return restPost(request, context);
};
export const DELETE = REST_DELETE(config);
export const PATCH = REST_PATCH(config);
export const PUT = REST_PUT(config);
export const OPTIONS = REST_OPTIONS(config);
