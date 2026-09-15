import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const stored = JSON.parse(
  readFileSync("test-results/persistence.json", "utf8"),
);
const base = env.APP_ORIGIN;
const login = await fetch(`${base}/api/auth/login`, {
  method: "POST",
  headers: { Origin: base, "Content-Type": "application/json" },
  body: JSON.stringify({
    username: env.ADMIN_USERNAME,
    password: env.ADMIN_PASSWORD,
  }),
});
assert.equal(login.status, 201, "已有管理员密码在重建后仍有效");
const cookie = login.headers.get("set-cookie").split(";")[0];
const response = await fetch(`${base}/api/admin/entries/${stored.entryId}`, {
  headers: { Cookie: cookie },
});
assert.equal(response.status, 200);
const entry = await response.json();
assert.equal(entry.title, "测试记录（自动清理）");
assert.equal(entry.occurredOn, "2024-02-29");
assert.equal(entry.media.length, 2);
assert(entry.media.some((m) => m.id === stored.mediaId));
for (const m of entry.media) {
  const r = await fetch(new URL(m.url, base));
  assert.equal(r.status, 200);
  assert((await r.arrayBuffer()).byteLength > 0);
}
if (process.argv.includes("--cleanup"))
  for (const id of stored.entries) {
    const r = await fetch(`${base}/api/admin/entries/${id}`, {
      method: "DELETE",
      headers: { Cookie: cookie, Origin: base },
    });
    assert.equal(r.status, 200);
  }
const report = {
  at: new Date().toISOString(),
  result: "重建后登录、记录、日期、照片及视频保留",
  cleaned: process.argv.includes("--cleanup"),
};
writeFileSync(
  "test-results/persistence-result.json",
  JSON.stringify(report, null, 2),
);
console.log(report);
