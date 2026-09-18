import { getPayload } from "payload";
import config from "../../payload.config.js";
const email = process.env.ADMIN_EMAIL,
  password = process.env.ADMIN_PASSWORD,
  username = process.env.ADMIN_USERNAME?.trim().toLowerCase();
if (!email || !password || password.length < 8)
  throw new Error("请设置 ADMIN_EMAIL 和至少 8 位的 ADMIN_PASSWORD。");
const payload = await getPayload({ config });
const existing = await payload.find({
  collection: "users",
  where: { email: { equals: email } },
  limit: 1,
  overrideAccess: true,
});
if (existing.totalDocs) {
  await payload.update({
    collection: "users",
    id: existing.docs[0]!.id,
    data: {
      password,
      ...(username ? { username } : {}),
      role: "admin",
      sessions: [],
      loginAttempts: 0,
      lockUntil: null,
    },
    overrideAccess: true,
  });
  console.log("管理员密码已恢复。");
} else {
  await payload.create({
    collection: "users",
    data: { email, password, ...(username ? { username } : {}), role: "admin" },
    overrideAccess: true,
  });
  console.log("管理员已创建。");
}

await payload.destroy();
