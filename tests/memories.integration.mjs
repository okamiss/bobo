import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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

async function story(occurredOn, changes = {}) {
  const { data } = await request("/admin/entries", {
    method: "POST",
    body: {},
    status: 201,
  });
  entryIds.push(data.id);
  await request(`/admin/entries/${data.id}`, {
    method: "PUT",
    body: {
      title: `那年今日测试 ${occurredOn}（自动清理）`,
      occurredOn,
      kind: "daily",
      body: "",
      tags: [],
      status: "published",
      visibility: "public",
      milestone: false,
      featured: false,
      coverMediaId: null,
      ...changes,
    },
  });
  return data.id;
}

try {
  const login = await request("/auth/login", {
    method: "POST",
    body: { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD },
    status: 201,
  });
  cookie = login.response.headers.get("set-cookie").split(";")[0];

  // Far-future dates keep the checks independent of real stories.
  const oneYear = await story("2089-03-10");
  const twoYears = await story("2088-03-10");
  const threeMonths = await story("2089-12-10");
  const excluded = [
    await story("2089-03-11"),
    await story("2090-03-10"),
    await story("2088-12-10"),
    await story("2089-03-10", { visibility: "private" }),
    await story("2089-12-10", { status: "draft" }),
  ];

  const { data } = await request("/on-this-day?date=2090-03-10", {
    auth: false,
  });
  assert.equal(data.date, "2090-03-10");
  const found = data.items.filter((item) => entryIds.includes(item.id));
  assert.deepEqual(
    found.map((item) => [item.id, item.yearsAgo, item.monthsAgo]),
    [
      [oneYear, 1, null],
      [twoYears, 2, null],
      [threeMonths, null, 3],
    ],
  );
  assert(!found.some((item) => excluded.includes(item.id)));

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
  }).format(new Date());
  assert.equal(
    (await request("/on-this-day", { auth: false })).data.date,
    today,
  );
  await request("/on-this-day?date=2090-02-30", { auth: false, status: 400 });

  console.log(
    "那年今日：往年同日与一年内同日的公开故事按顺序返回，私密、草稿、当天与其他日期被排除，通过",
  );
} finally {
  for (const id of entryIds)
    await request(`/admin/entries/${id}`, { method: "DELETE" }).catch(() => {});
  if (cookie) await request("/auth/logout", { method: "POST" }).catch(() => {});
}
