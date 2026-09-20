import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => [
      line.slice(0, line.indexOf("=")),
      line.slice(line.indexOf("=") + 1),
    ]),
);
const base = env.APP_ORIGIN;
let owner = "";
let memberId = "";
const ids = [];
const suffix = Date.now().toString(36);
// Exact matching and parameterization must preserve quotes, slashes and hashes.
const tag = `测试#/'${suffix}`;
const keep = `${tag}保留`;
async function request(
  path,
  { method = "GET", body, cookie = owner, status = 200 } = {},
) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      Origin: base,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  assert.equal(
    response.status,
    status,
    `${method} ${path}: ${JSON.stringify(data)}`,
  );
  return { response, data };
}
async function login(username, password) {
  const result = await request("/auth/login", {
    method: "POST",
    cookie: "",
    body: { username, password },
    status: 201,
  });
  return result.response.headers.get("set-cookie").split(";")[0];
}
try {
  owner = await login(env.ADMIN_USERNAME, env.ADMIN_PASSWORD);
  await request("/admin/tags", { cookie: "", status: 401 });
  await request("/admin/tags", {
    method: "DELETE",
    cookie: "",
    body: { name: tag },
    status: 401,
  });
  memberId = (
    await request("/admin/accounts", {
      method: "POST",
      status: 201,
      body: {
        username: `tag_${suffix}`,
        displayName: "标签测试家人",
        password: `Tags-${suffix}-safe`,
      },
    })
  ).data.id;
  const member = await login(`tag_${suffix}`, `Tags-${suffix}-safe`);
  await request("/admin/tags", {
    method: "DELETE",
    cookie: member,
    body: { name: tag },
    status: 403,
  });
  await request("/admin/tags", {
    method: "DELETE",
    body: { name: " " },
    status: 400,
  });
  const originals = [];
  for (const [status, visibility, cookie] of [
    ["published", "public", owner],
    ["published", "private", member],
    ["draft", "private", owner],
  ]) {
    const entry = (
      await request("/admin/entries", {
        method: "POST",
        cookie,
        body: { occurredOn: "2003-01-01" },
        status: 201,
      })
    ).data;
    ids.push(entry.id);
    originals.push(
      (
        await request(`/admin/entries/${entry.id}`, {
          method: "PUT",
          cookie,
          body: {
            title: "标签管理测试",
            occurredOn: "2003-01-01",
            kind: "daily",
            body: "正文必须保留",
            tags: [tag, keep],
            status,
            visibility,
            milestone: false,
            featured: false,
            coverMediaId: null,
            media: [],
          },
        })
      ).data,
    );
  }
  const all = (await request("/admin/tags", { cookie: member })).data;
  assert.deepEqual(
    all.find((item) => item.name === tag),
    { name: tag, count: 3 },
  );
  assert.ok(
    (await request("/entries?limit=1", { cookie: "" })).data.tags.includes(tag),
  );
  assert.equal(
    (await request("/admin/tags", { method: "DELETE", body: { name: tag } }))
      .data.count,
    3,
  );
  const after = (await request("/admin/tags")).data;
  assert.equal(
    after.some((item) => item.name === tag),
    false,
  );
  assert.equal(after.find((item) => item.name === keep).count, 3);
  assert.equal(
    (await request("/entries?limit=1", { cookie: "" })).data.tags.includes(tag),
    false,
  );
  for (const original of originals) {
    const current = (await request(`/admin/entries/${original.id}`)).data;
    assert.deepEqual(current.tags, [keep]);
    for (const key of [
      "title",
      "body",
      "authorId",
      "status",
      "visibility",
      "occurredOn",
    ])
      assert.equal(current[key], original[key]);
    assert.deepEqual(current.media, original.media);
  }
  assert.ok(
    (await request("/admin/audit-logs")).data.some(
      (log) => log.summary === `删除了标签「${tag}」，已从 3 篇记录中移除`,
    ),
  );
  assert.equal(
    (await request("/admin/tags", { method: "DELETE", body: { name: tag } }))
      .data.count,
    0,
  );
  console.log(
    "标签管理：权限、使用篇数、精确删除、公开/私密/草稿同步、正文署名保留、操作记录，通过",
  );
} finally {
  for (const id of ids)
    await request(`/admin/entries/${id}`, { method: "DELETE" });
  if (memberId)
    await request(`/admin/accounts/${memberId}`, { method: "DELETE" });
}
