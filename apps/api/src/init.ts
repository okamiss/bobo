import { PrismaClient } from "@prisma/client";
import { config, hashPassword } from "./config";
async function main() {
  config();
  const db = new PrismaClient();
  try {
    const username = process.env.ADMIN_USERNAME,
      password = process.env.ADMIN_PASSWORD;
    if (!username || !password || password.length < 12)
      throw new Error("首次管理员用户名必填，密码至少 12 位");
    const admin = await db.admin.findFirst();
    if (!admin)
      await db.admin.create({
        data: {
          username,
          displayName: username,
          passwordHash: hashPassword(password),
          role: "owner",
        },
      });
    await db.profile.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
    });
    console.log("数据库和管理员初始化完成；已有数据保持不变。");
  } finally {
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
