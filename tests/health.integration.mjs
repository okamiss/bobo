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
  kind: "vaccine",
  occurredOn: "2002-01-01",
  nextDueOn: "2002-02-01",
  note: "测试记录",
  ...changes,
});

try {
  owner = await login(env.ADMIN_USERNAME, env.ADMIN_PASSWORD);

  // Health data is authenticated-only and has no public API route.
  await request("/admin/health-records", { cookie: "", status: 401 });
  await request("/health-records", { cookie: "", status: 404 });

  const invalid = async (body, pattern) =>
    assert.match(
      (
        await request("/admin/health-records", {
          method: "POST",
          body: record(body),
          status: 400,
        })
      ).data.message,
      pattern,
    );
  await invalid({ kind: "unknown" }, /请选择疫苗、驱虫、体检或美容/);
  await invalid({ nextDueOn: "2001-12-31" }, /下次时间不能早于本次日期/);
  await invalid(
    { occurredOn: "2999-01-01", nextDueOn: null },
    /不能记录今天以后/,
  );

  const first = (
    await request("/admin/health-records", {
      method: "POST",
      body: record(),
      status: 201,
    })
  ).data;
  ids.push(first.id);
  assert.equal(first.kind, "vaccine");
  const updated = (
    await request(`/admin/health-records/${first.id}`, {
      method: "PUT",
      body: record({ kind: "checkup", nextDueOn: null, note: "复查正常" }),
    })
  ).data;
  assert.deepEqual(
    [updated.kind, updated.nextDueOn, updated.note],
    ["checkup", null, "复查正常"],
  );

  // Family members can maintain shared health history and leave an audit trail.
  const suffix = Date.now().toString(36);
  const memberName = `健康测试家人${suffix.slice(-4)}`;
  const password = `Health-${suffix}-safe`;
  const username = `health_${suffix}`;
  memberId = (
    await request("/admin/accounts", {
      method: "POST",
      body: { username, displayName: memberName, password },
      status: 201,
    })
  ).data.id;
  member = await login(username, password);
  await request("/admin/health-records", { cookie: member });
  const byMember = (
    await request("/admin/health-records", {
      method: "POST",
      cookie: member,
      body: record({
        kind: "deworming",
        occurredOn: "2002-03-01",
        nextDueOn: "2002-06-01",
        note: "家人添加",
      }),
      status: 201,
    })
  ).data;
  ids.push(byMember.id);
  await request("/admin/audit-logs", { cookie: member, status: 403 });
  const log = (await request("/admin/audit-logs")).data.find(
    (entry) => entry.actorName === memberName,
  );
  assert.equal(
    log?.summary,
    "添加了健康记录：驱虫（2002-03-01，下次 2002-06-01）",
  );

  console.log(
    "健康档案：仅后台可见，校验、家人增删改、下次时间与操作记录，通过",
  );
} finally {
  for (const id of ids)
    await request(`/admin/health-records/${id}`, { method: "DELETE" }).catch(
      () => {},
    );
  if (memberId)
    await request(`/admin/accounts/${memberId}`, { method: "DELETE" }).catch(
      () => {},
    );
}
