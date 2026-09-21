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
const source = `测试#/'${suffix}`;
const renamed = `改名#/'${suffix}`;
const target = `合并${suffix}`;
const removable = `删除${suffix}`;
const fixed = `固定${suffix}`;
const fixedRenamed = `常用${suffix}`;
const cleanupTags = new Set([
  source,
  renamed,
  target,
  removable,
  fixed,
  fixedRenamed,
]);

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
  for (const [method, body] of [
    ["POST", { name: fixed }],
    ["PUT", { name: fixed, newName: fixedRenamed }],
    ["DELETE", { name: fixed }],
  ])
    await request("/admin/tags", {
      method,
      cookie: "",
      body,
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
  await request("/admin/tags", { cookie: member });
  for (const [method, body] of [
    ["POST", { name: fixed }],
    ["PUT", { name: fixed, newName: fixedRenamed }],
    ["DELETE", { name: fixed }],
  ])
    await request("/admin/tags", {
      method,
      cookie: member,
      body,
      status: 403,
    });
  await request("/admin/tags", {
    method: "POST",
    body: { name: " " },
    status: 400,
  });
  await request("/admin/tags", {
    method: "PUT",
    body: { name: fixed, newName: " " },
    status: 400,
  });

  assert.deepEqual(
    (
      await request("/admin/tags", {
        method: "POST",
        body: { name: fixed },
        status: 201,
      })
    ).data,
    { name: fixed, count: 0 },
  );
  await request("/admin/tags", {
    method: "POST",
    body: { name: fixed },
    status: 409,
  });
  assert.deepEqual(
    (await request("/admin/tags")).data.find((item) => item.name === fixed),
    { name: fixed, count: 0 },
  );
  assert.deepEqual(
    (
      await request("/admin/tags", {
        method: "PUT",
        body: { name: fixed, newName: fixedRenamed },
      })
    ).data,
    { name: fixedRenamed, count: 0, merged: false },
  );

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
            tags: [source, target, removable],
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
    all.find((item) => item.name === source),
    { name: source, count: 3 },
  );
  assert.ok(
    (await request("/entries?limit=1", { cookie: "" })).data.tags.includes(
      source,
    ),
  );
  assert.deepEqual(
    (
      await request("/admin/tags", {
        method: "PUT",
        body: { name: source, newName: renamed },
      })
    ).data,
    { name: renamed, count: 3, merged: false },
  );
  assert.deepEqual(
    (
      await request("/admin/tags", {
        method: "PUT",
        body: { name: renamed, newName: target },
      })
    ).data,
    { name: target, count: 3, merged: true },
  );
  assert.equal(
    (
      await request("/admin/tags", {
        method: "DELETE",
        body: { name: removable },
      })
    ).data.count,
    3,
  );
  assert.equal(
    (
      await request("/admin/tags", {
        method: "DELETE",
        body: { name: fixedRenamed },
      })
    ).data.count,
    0,
  );

  const after = (await request("/admin/tags")).data;
  for (const removed of [source, renamed, removable, fixed, fixedRenamed])
    assert.equal(
      after.some((item) => item.name === removed),
      false,
    );
  assert.equal(after.find((item) => item.name === target).count, 3);
  const publicTags = (await request("/entries?limit=1", { cookie: "" })).data
    .tags;
  assert.equal(publicTags.includes(source), false);
  assert.equal(publicTags.includes(renamed), false);
  assert.equal(publicTags.includes(removable), false);
  assert.ok(publicTags.includes(target));

  for (const original of originals) {
    const current = (await request(`/admin/entries/${original.id}`)).data;
    assert.deepEqual(current.tags, [target]);
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

  const logs = (await request("/admin/audit-logs")).data;
  assert.ok(logs.some((log) => log.summary === `新增了标签「${fixed}」`));
  assert.ok(
    logs.some(
      (log) =>
        log.summary ===
        `将标签「${renamed}」改为「${target}」，已同步 3 篇记录并合并同名标签`,
    ),
  );
  assert.ok(
    logs.some(
      (log) =>
        log.summary === `删除了标签「${removable}」，已从 3 篇记录中移除`,
    ),
  );
  await request("/admin/tags", {
    method: "PUT",
    body: { name: `不存在${suffix}`, newName: target },
    status: 404,
  });
  console.log(
    "标签管理：权限、固定标签新增、重命名与合并、精确删除、公开/私密/草稿同步、内容保留及操作记录，通过",
  );
} finally {
  if (owner) {
    for (const id of ids)
      await request(`/admin/entries/${id}`, { method: "DELETE" });
    for (const name of cleanupTags)
      await request("/admin/tags", { method: "DELETE", body: { name } });
    if (memberId)
      await request(`/admin/accounts/${memberId}`, { method: "DELETE" });
  }
}
