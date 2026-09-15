import { spawnSync } from "node:child_process";

async function main() {
  const maximumAttempts = 12;

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    const migration = spawnSync(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["prisma", "migrate", "deploy"],
      { encoding: "utf8" },
    );

    process.stdout.write(migration.stdout ?? "");
    process.stderr.write(migration.stderr ?? "");

    if (migration.status === 0) {
      const initialize = spawnSync(process.execPath, ["dist/init.js"], {
        stdio: "inherit",
      });
      process.exit(initialize.status ?? 1);
    }

    const output = `${migration.stdout ?? ""}\n${migration.stderr ?? ""}`;
    const transientDatabaseStartup = output.includes("P1001");
    if (!transientDatabaseStartup || attempt === maximumAttempts) {
      process.exit(migration.status ?? 1);
    }

    console.log(
      `数据库仍在完成首次启动，2 秒后重试迁移（${attempt}/${maximumAttempts}）…`,
    );
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

void main();
