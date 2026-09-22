import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// How a story comes into being. The editor keeps a new one in the browser and
// creates it at the first save, or when a photo is added — and a photo must
// not publish anything, so that path creates a private draft with no name yet.
// Only authorises an upload rather than performing one, so it runs under
// either storage driver.
const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    }),
);
const base = env.APP_ORIGIN;
let cookie = "";
const entryIds = [];

async function request(
  path,
  { method = "GET", body, auth = true, status = 200 } = {},
) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      Origin: base,
      ...(auth && cookie ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  assert.equal(response.status, status, `${method} ${path}: ${text}`);
  return { response, data: text ? JSON.parse(text) : null };
}
const full = (changes = {}) => ({
  title: "新建流程测试（自动清理）",
  occurredOn: "2086-04-04",
  kind: "daily",
  body: "正文",
  tags: [],
  status: "draft",
  visibility: "private",
  milestone: false,
  featured: false,
  coverMediaId: null,
  ...changes,
});
const report = [];

try {
  cookie = (
    await request("/auth/login", {
      method: "POST",
      auth: false,
      body: { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD },
      status: 201,
    })
  ).response.headers
    .get("set-cookie")
    .split(";")[0];

  // Adding a photo before writing anything: exactly what the editor sends.
  const started = (
    await request("/admin/entries", {
      method: "POST",
      body: {
        title: "",
        occurredOn: "2086-04-04",
        kind: "daily",
        body: "",
        tags: [],
        milestone: false,
        featured: false,
      },
      status: 201,
    })
  ).data;
  entryIds.push(started.id);
  assert.equal(started.title, "", "还没起名字的记录应当能建出来");
  assert.equal(started.status, "draft");
  assert.equal(started.visibility, "private");
  assert.equal(started.publishedAt, null);
  // It must not reach the public site just because a photo was added.
  const visitor = (
    await request("/entries?year=2086&limit=50", { auth: false })
  ).data;
  assert.equal(
    visitor.items.some((e) => e.id === started.id),
    false,
    "加照片起头的记录不能出现在前台",
  );
  // The upload this was created for is now allowed.
  const permit = (
    await request("/admin/media/authorize", {
      method: "POST",
      body: {
        entryId: started.id,
        name: "test.png",
        mime: "image/png",
        size: 1234,
      },
      status: 201,
    })
  ).data;
  report.push("未写标题先加照片：建成私密草稿、不进前台、可以授权上传");

  // An authorised upload that never finished blocks publishing until it is
  // dealt with, which is how the editor's failed uploads behave.
  await request(`/admin/entries/${started.id}`, {
    method: "PUT",
    body: full({ status: "published", visibility: "public" }),
    status: 400,
  });
  await request(`/admin/media/${permit.id}`, { method: "DELETE" });
  report.push("有未完成的上传时拒绝发布，移除后可以继续");

  // Saving still insists on a name, in Chinese.
  const refused = await request(`/admin/entries/${started.id}`, {
    method: "PUT",
    body: full({ title: "   " }),
    status: 400,
  });
  assert.match(refused.data.message, /起个名字/);
  report.push("保存时标题仍然必填，提示是中文");

  // The first real save is what publishes, and it stamps the moment.
  const published = (
    await request(`/admin/entries/${started.id}`, {
      method: "PUT",
      body: full({ status: "published", visibility: "public" }),
    })
  ).data;
  assert.ok(published.publishedAt, "发布时应记下时间");
  const listed = (await request("/entries?year=2086&limit=50", { auth: false }))
    .data;
  assert.equal(
    listed.items.some((e) => e.id === started.id),
    true,
  );
  report.push("保存并发布后才进入前台，并记下发布时间");

  // A body-less post still opens a blank draft for the older tests.
  const bare = (
    await request("/admin/entries", { method: "POST", body: {}, status: 201 })
  ).data;
  entryIds.push(bare.id);
  assert.equal(bare.title, "");
  assert.equal(bare.status, "draft");
  report.push("空 body 创建仍然可用，且不写入占位标题");

  console.log(JSON.stringify({ report }, null, 2));
} finally {
  for (const id of entryIds)
    await request(`/admin/entries/${id}`, { method: "DELETE" }).catch(() => {});
  if (cookie) await request("/auth/logout", { method: "POST" }).catch(() => {});
}
