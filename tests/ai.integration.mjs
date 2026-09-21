import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Covers the writing-help API without spending a model call: permissions,
// per-account consent, input limits and the behaviour of a site that has no
// API key configured. Works whether or not DEEPSEEK_API_KEY is set.
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
const draft = (changes = {}) => ({
  mediaIds: [],
  occurredOn: "2003-01-01",
  kind: "daily",
  hint: "测试",
  ...changes,
});
const report = [];

try {
  owner = await login(env.ADMIN_USERNAME, env.ADMIN_PASSWORD);

  // Writing help is admin-only; visitors never reach it.
  await request("/admin/ai/status", { cookie: "", status: 401 });
  await request("/admin/ai/consent", {
    method: "PUT",
    cookie: "",
    status: 401,
  });
  await request("/admin/ai/draft", {
    method: "POST",
    cookie: "",
    body: draft(),
    status: 401,
  });
  report.push("未登录访客无法使用写作助手");

  const status = (await request("/admin/ai/status")).data;
  assert.equal(typeof status.enabled, "boolean");
  assert.equal(typeof status.consented, "boolean");
  assert.equal(status.quota > 0, true);

  const memberName = `测试家人${Date.now()}`;
  const created = (
    await request("/admin/accounts", {
      method: "POST",
      body: {
        username: `ai-test-${Date.now()}`,
        displayName: memberName,
        password: "test-password-123456",
      },
      status: 201,
    })
  ).data;
  memberId = created.id;
  member = await login(created.username, "test-password-123456");

  // Consent belongs to the account, not the site: a new family member has not
  // agreed to anything yet.
  const fresh = (await request("/admin/ai/status", { cookie: member })).data;
  assert.equal(fresh.consented, false);
  assert.equal(fresh.enabled, status.enabled);
  await request("/admin/ai/draft", {
    method: "POST",
    cookie: member,
    body: draft(),
    status: status.enabled ? 403 : 503,
  });
  const agreed = (
    await request("/admin/ai/consent", { method: "PUT", cookie: member })
  ).data;
  assert.equal(agreed.consented, true);
  // Agreeing on one account does not agree for anyone else.
  assert.equal(
    (await request("/admin/ai/status")).data.consented,
    status.consented,
  );
  report.push("同意状态按账号保存，家人之间互不影响");

  if (status.enabled) {
    // Photos are checked before anything is sent to the model.
    await request("/admin/ai/draft", {
      method: "POST",
      cookie: member,
      body: draft({
        mediaIds: Array.from(
          { length: 5 },
          () => "00000000-0000-0000-0000-000000000000",
        ),
      }),
      status: 400,
    });
    await request("/admin/ai/draft", {
      method: "POST",
      cookie: member,
      body: draft({ mediaIds: ["00000000-0000-0000-0000-000000000000"] }),
      status: 400,
    });
    await request("/admin/ai/draft", {
      method: "POST",
      cookie: member,
      body: draft({ kind: "unknown" }),
      status: 400,
    });
    report.push("照片数量、照片可用性与字段校验在调用模型前拦截");
  } else {
    // The common case for a fresh server: no key, feature off, site unharmed.
    assert.equal(status.remaining, 0);
    await request("/admin/ai/draft", {
      method: "POST",
      body: draft(),
      status: 503,
    });
    const entries = (await request("/entries?limit=1", { cookie: "" })).data;
    assert.equal(Array.isArray(entries.items), true);
    report.push("未配置 API key 时功能关闭，网站其余部分不受影响");
  }

  console.log(JSON.stringify({ enabled: status.enabled, report }, null, 2));
} finally {
  if (memberId)
    await request(`/admin/accounts/${memberId}`, { method: "DELETE" }).catch(
      () => {},
    );
}
