import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
if (!existsSync(".env")) {
  let text = readFileSync(".env.example", "utf8");
  for (const key of ["DB_PASSWORD", "SESSION_SECRET", "ADMIN_PASSWORD"])
    text = text.replace(
      new RegExp(`^${key}=$`, "m"),
      `${key}=${randomBytes(24).toString("hex")}`,
    );
  writeFileSync(".env", text, { mode: 0o600 });
  console.log(
    "已生成本地 .env 和独立随机凭据。管理员用户名 owner，密码见 .env 的 ADMIN_PASSWORD。",
  );
} else console.log(".env 已存在，配置与凭据保持不变。");
