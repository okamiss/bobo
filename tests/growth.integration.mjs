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
let owner = "";
let member = "";
let memberId = "";
let visibleBefore = null;
const ids = [];

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
  const text = await response.text();
  assert.equal(response.status, status, `${method} ${path}: ${text}`);
  return { response, data: text ? JSON.parse(text) : null };
}
const login = async (username, password) =>
  (
    await request("/auth/login", {
      method: "POST",
      cookie: "",
      body: { username, password },
      status: 201,
    })
  ).response.headers
    .get("set-cookie")
    .split(";")[0];
const record = (changes = {}) => ({
  measuredOn: "2001-01-01",
  weight: null,
  height: null,
  note: "",
  ...changes,
});

try {
  owner = await login(env.ADMIN_USERNAME, env.ADMIN_PASSWORD);
  visibleBefore = (await request("/admin/growth")).data.public;
  await request("/admin/growth", { cookie: "", status: 401 });

  // Validation: a value is required, values must be sensible, no future dates.
  const invalid = async (body, pattern) =>
    assert.match(
      (
        await request("/admin/growth", {
          method: "POST",
          body: record(body),
          status: 400,
        })
      ).data.message,
      pattern,
    );
  await invalid({}, /体重和肩高至少填写一项/);
  await invalid({ weight: 0 }, /体重需要大于 0/);
  await invalid({ height: 200 }, /肩高不能超过 150 cm/);
  await invalid({ measuredOn: "2999-01-01", weight: 1 }, /不能记录今天以后/);

  // Values are rounded to 0.01 kg and 0.1 cm; one record per day.
  const first = (
    await request("/admin/growth", {
      method: "POST",
      body: record({ weight: 1.234, height: 20.26, note: "测试备注" }),
      status: 201,
    })
  ).data;
  ids.push(first.id);
  assert.deepEqual([first.weight, first.height], [1.23, 20.3]);
  await request("/admin/growth", {
    method: "POST",
    body: record({ weight: 2 }),
    status: 409,
  });
  const second = (
    await request("/admin/growth", {
      method: "POST",
      body: record({ measuredOn: "2001-02-01", weight: 2.5 }),
      status: 201,
    })
  ).data;
  ids.push(second.id);
  await request(`/admin/growth/${first.id}`, {
    method: "PUT",
    body: record({ measuredOn: "2001-02-01", weight: 1 }),
    status: 409,
  });
  await request(`/admin/growth/${first.id}`, {
    method: "PUT",
    body: record({ weight: 1.5, height: 21, note: "改过" }),
  });

  // Only the owner manages growth records.
  const suffix = Date.now().toString(36);
  memberId = (
    await request("/admin/accounts", {
      method: "POST",
      body: {
        username: `growth_${suffix}`,
        displayName: "成长测试家人",
        password: `Growth-${suffix}-safe`,
      },
      status: 201,
    })
  ).data.id;
  member = await login(`growth_${suffix}`, `Growth-${suffix}-safe`);
  await request("/admin/growth", { cookie: member, status: 403 });
  await request("/admin/growth", {
    method: "POST",
    cookie: member,
    body: record({ measuredOn: "2001-03-01", weight: 3 }),
    status: 403,
  });

  // Visitors see the curve only when it is public, and never the notes.
  const ours = (items) =>
    items.filter((m) => ["2001-01-01", "2001-02-01"].includes(m.measuredOn));
  await request("/admin/growth-visibility", {
    method: "PUT",
    body: { public: false },
  });
  const hidden = (await request("/growth", { cookie: "" })).data;
  assert.deepEqual([hidden.public, hidden.items.length], [false, 0]);
  await request("/admin/growth-visibility", {
    method: "PUT",
    body: { public: true },
  });
  const shown = (await request("/growth", { cookie: "" })).data;
  assert.equal(shown.public, true);
  assert.deepEqual(ours(shown.items), [
    { measuredOn: "2001-01-01", weight: 1.5, height: 21 },
    { measuredOn: "2001-02-01", weight: 2.5, height: null },
  ]);

  console.log(
    "成长曲线：仅管理员可管理，数值校验与取整、每天一条、公开开关与隐藏备注，通过",
  );
} finally {
  for (const id of ids)
    await request(`/admin/growth/${id}`, { method: "DELETE" }).catch(() => {});
  if (visibleBefore !== null)
    await request("/admin/growth-visibility", {
      method: "PUT",
      body: { public: visibleBefore },
    }).catch(() => {});
  if (memberId)
    await request(`/admin/accounts/${memberId}`, { method: "DELETE" }).catch(
      () => {},
    );
}
