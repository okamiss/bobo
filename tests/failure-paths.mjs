import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const project = "bobo-failure-test";
let failed = false;
let failureOutput = '';
try {
  try {
    execFileSync(
      "docker",
      [
        "compose",
        "-p",
        project,
        "up",
        "-d",
        "--no-build",
        "--wait",
        "--wait-timeout",
        "180",
      ],
      {
        env: { ...process.env, ADMIN_PASSWORD: "short", HTTP_PORT: "18080" },
        stdio: "pipe",
        timeout: 240000,
      },
    );
  } catch (e) {
    failed = true;
    failureOutput = String(e.stderr || e.message);
    assert.notEqual(e.status, 0);
  }
  assert(failed, "初始化失败必须返回失败");
  const running = execFileSync(
    "docker",
    ["compose", "-p", project, "ps", "--services", "--status", "running"],
    { encoding: "utf8" },
  )
    .trim()
    .split(/\r?\n/);
  assert(!running.includes("api"));
  assert(!running.includes("web"));
  const logs = execFileSync(
    "docker",
    ["compose", "-p", project, "logs", "init"],
    { encoding: "utf8" },
  );
  assert(logs.includes("密码至少 12 位"), failureOutput + '\n' + logs);
  console.log("初始化失败阻止 API / Web 启动，通过。");
} finally {
  execFileSync("docker", ["compose", "-p", project, "down", "-v"], {
    stdio: "pipe",
  });
}
let ossFailed = false;
try {
  execFileSync(
    "docker",
    [
      "compose",
      "run",
      "--rm",
      "--no-deps",
      "-e",
      "STORAGE_DRIVER=oss",
      "-e",
      "OSS_REGION=",
      "api",
    ],
    { stdio: "pipe", timeout: 30000 },
  );
} catch (e) {
  ossFailed = true;
  assert((String(e.stderr) + String(e.stdout)).includes('OSS 模式缺少'));
}
assert(ossFailed);
writeFileSync(
  "test-results/failure-paths.json",
  JSON.stringify(
    {
      at: new Date().toISOString(),
      initFailureBlocks: true,
      ossMissingConfigFails: true,
    },
    null,
    2,
  ),
);
console.log("OSS 配置缺失时服务拒绝启动，通过。");
