import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { config, hashPassword } from "./config";
// Emergency reset when an account (including the owner) forgot its password.
// Run on the server: docker compose exec api node dist/reset-password.js <用户名>
async function main() {
  config();
  const username = process.argv[2];
  if (!username) throw new Error("用法：node dist/reset-password.js <用户名>");
  const db = new PrismaClient();
  try {
    const admin = await db.admin.findUnique({ where: { username } });
    if (!admin) throw new Error(`没有找到用户名为 ${username} 的账号`);
    const password = randomBytes(12).toString("base64url");
    await db.$transaction([
      db.admin.update({
        where: { id: admin.id },
        data: { passwordHash: hashPassword(password) },
      }),
      db.session.deleteMany({ where: { adminId: admin.id } }),
    ]);
    console.log(`已为 ${username} 生成新密码：${password}`);
    console.log(
      "该账号的所有设备已退出登录。请登录后台，在「修改密码」中换成自己的密码。",
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
