import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Several stories can share one day. They must come back newest-published
// first, and the previous/next links must walk that same order — the two are
// built from separate queries and used to drift apart.
// Uses temporary 2089 stories, so it is independent of real data and storage.
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
// Publishing stamps the moment, so a gap keeps the expected order unambiguous.
const pause = () => new Promise((done) => setTimeout(done, 40));
async function publish(occurredOn, title) {
  const { data } = await request("/admin/entries", {
    method: "POST",
    body: {},
    status: 201,
  });
  entryIds.push(data.id);
  await request(`/admin/entries/${data.id}`, {
    method: "PUT",
    body: {
      title,
      occurredOn,
      kind: "daily",
      body: "排序测试（自动清理）",
      tags: [],
      status: "published",
      visibility: "public",
      milestone: false,
      featured: false,
      coverMediaId: null,
    },
  });
  await pause();
  return data.id;
}
const titleOf = (id, list) => list.find((e) => e.id === id)?.title;

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

  // Three stories filed under one day, published in a known order.
  const first = await publish("2089-03-03", "排序测试 一（自动清理）");
  const second = await publish("2089-03-03", "排序测试 二（自动清理）");
  const third = await publish("2089-03-03", "排序测试 三（自动清理）");
  // A fourth filed under the day before, but published last of all.
  const backdated = await publish("2089-03-02", "排序测试 补录（自动清理）");

  const listed = (await request("/entries?year=2089&limit=50", { auth: false }))
    .data.items;
  const ours = listed.filter((e) => entryIds.includes(e.id));
  assert.deepEqual(
    ours.map((e) => e.id),
    [third, second, first, backdated],
    "同一天应按发布时间从新到旧，最后发布的排最前",
  );
  // Every published story carries the stamp the order depends on.
  for (const e of ours) assert.ok(e.publishedAt, `${e.title} 缺少发布时间`);

  // The links must walk exactly the same order, in both directions.
  const walked = [ours[0].id];
  for (let step = 0; step < ours.length; step++) {
    const current = (
      await request(`/entries/${walked.at(-1)}`, { auth: false })
    ).data;
    if (!current.next || !entryIds.includes(current.next.id)) break;
    walked.push(current.next.id);
  }
  assert.deepEqual(
    walked,
    ours.map((e) => e.id),
    "「下一篇」应与时间线顺序一致",
  );
  const back = [ours.at(-1).id];
  for (let step = 0; step < ours.length; step++) {
    const current = (await request(`/entries/${back.at(-1)}`, { auth: false }))
      .data;
    if (!current.previous || !entryIds.includes(current.previous.id)) break;
    back.push(current.previous.id);
  }
  assert.deepEqual(
    back,
    ours.map((e) => e.id).reverse(),
    "「上一篇」应与时间线倒序一致",
  );

  // Pulling a story back to a draft keeps the stamp of when it first went up,
  // so it holds its place in the day instead of jumping around.
  await request(`/admin/entries/${second}`, {
    method: "PUT",
    body: {
      title: titleOf(second, ours),
      occurredOn: "2089-03-03",
      kind: "daily",
      body: "排序测试（自动清理）",
      tags: [],
      status: "draft",
      visibility: "private",
      milestone: false,
      featured: false,
      coverMediaId: null,
    },
  });
  const admin = (await request("/admin/entries?year=2089&limit=50")).data.items;
  const mine = admin.filter((e) => entryIds.includes(e.id));
  assert.deepEqual(
    mine.map((e) => e.id),
    [third, second, first, backdated],
    "改回草稿后仍保留首次发布时间，位置不变",
  );
  assert.equal(
    mine.find((e) => e.id === second).status,
    "draft",
    "这一篇确实已经变回草稿",
  );

  // A story that was never published has no stamp, so it falls back to when it
  // was written and sits after that day's published ones.
  const { data: blank } = await request("/admin/entries", {
    method: "POST",
    body: {},
    status: 201,
  });
  entryIds.push(blank.id);
  await request(`/admin/entries/${blank.id}`, {
    method: "PUT",
    body: {
      title: "排序测试 草稿（自动清理）",
      occurredOn: "2089-03-03",
      kind: "daily",
      body: "排序测试（自动清理）",
      tags: [],
      status: "draft",
      visibility: "private",
      milestone: false,
      featured: false,
      coverMediaId: null,
    },
  });
  const withDraft = (
    await request("/admin/entries?year=2089&limit=50")
  ).data.items.filter((e) => entryIds.includes(e.id));
  assert.deepEqual(
    withDraft.map((e) => e.id),
    [third, second, first, blank.id, backdated],
    "从未发布过的草稿排在当天已发布记录之后",
  );
  assert.equal(
    (await request("/entries?year=2089&limit=50", { auth: false })).data.items
      .filter((e) => entryIds.includes(e.id))
      .some((e) => e.id === blank.id),
    false,
    "草稿不会出现在前台",
  );

  console.log(
    "排序：同一天按发布时间从新到旧，上一篇/下一篇与时间线一致，草稿排在当天已发布之后，通过",
  );
} finally {
  for (const id of entryIds)
    await request(`/admin/entries/${id}`, { method: "DELETE" }).catch(() => {});
  if (cookie) await request("/auth/logout", { method: "POST" }).catch(() => {});
}
