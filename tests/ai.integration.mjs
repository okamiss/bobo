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

  // Conversations: private to the account that owns them. Sending a message
  // would spend a model call, so only the plumbing around it is exercised.
  await request("/admin/ai/conversations", { cookie: "", status: 401 });
  const mine = (
    await request("/admin/ai/conversations", { method: "POST", status: 201 })
  ).data;
  assert.equal(mine.title, "新的聊天");
  const listed = (await request("/admin/ai/conversations")).data;
  assert.equal(
    listed.some((c) => c.id === mine.id),
    true,
  );
  const opened = (await request(`/admin/ai/conversations/${mine.id}`)).data;
  assert.deepEqual(opened.messages, []);

  // The other family member sees neither the conversation nor its messages,
  // and cannot delete it or post into it.
  const theirs = (await request("/admin/ai/conversations", { cookie: member }))
    .data;
  assert.equal(
    theirs.some((c) => c.id === mine.id),
    false,
  );
  await request(`/admin/ai/conversations/${mine.id}`, {
    cookie: member,
    status: 404,
  });
  await request(`/admin/ai/conversations/${mine.id}`, {
    method: "DELETE",
    cookie: member,
    status: 404,
  });
  await request(`/admin/ai/conversations/${mine.id}/messages`, {
    method: "POST",
    cookie: member,
    body: { text: "偷看一下" },
    status: status.enabled ? 404 : 503,
  });
  // Still there after the failed attempts.
  await request(`/admin/ai/conversations/${mine.id}`);
  await request(`/admin/ai/conversations/${mine.id}`, { method: "DELETE" });
  await request(`/admin/ai/conversations/${mine.id}`, { status: 404 });
  report.push("聊天会话按账号隔离，别人既读不到也删不掉");

  if (status.enabled) {
    // An empty or oversized question never reaches the model. The member is
    // the account that has agreed above, so consent is not what is refusing.
    const chat = (
      await request("/admin/ai/conversations", {
        method: "POST",
        cookie: member,
        status: 201,
      })
    ).data;
    await request(`/admin/ai/conversations/${chat.id}/messages`, {
      method: "POST",
      cookie: member,
      body: { text: "   " },
      status: 400,
    });
    await request(`/admin/ai/conversations/${chat.id}/messages`, {
      method: "POST",
      cookie: member,
      body: { text: "问".repeat(1001) },
      status: 400,
    });
    await request(`/admin/ai/conversations/${chat.id}`, {
      method: "DELETE",
      cookie: member,
    });
    report.push("提问内容为空或过长时在调用模型前拦截");
  }

  // The public pages decide whether to show the chat entry from a readable
  // cookie, because the session cookie is HttpOnly. It must reach accounts
  // that signed in before this feature existed, not only signIn logins.
  const signIn = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({
      username: env.ADMIN_USERNAME,
      password: env.ADMIN_PASSWORD,
    }),
  });
  const issued = signIn.headers.getSetCookie();
  const hint = issued.find((c) => c.startsWith("bobo_family="));
  assert.ok(hint, "登录时应下发 bobo_family");
  assert.equal(/HttpOnly/i.test(hint), false, "前台 JS 必须能读到提示 cookie");
  assert.match(hint, /SameSite=Strict/i);
  const sessionOnly = issued
    .find((c) => c.startsWith("bobo_session="))
    .split(";")[0];

  // An older session carrying only bobo_session gets the hint backfilled.
  const backfill = await fetch(`${base}/api/profile`, {
    headers: { Cookie: sessionOnly },
  });
  assert.ok(
    backfill.headers.getSetCookie().some((c) => c.startsWith("bobo_family=1")),
    "已登录但没有提示 cookie 时应补发",
  );
  // Already has it: nothing is re-sent.
  const settled = await fetch(`${base}/api/profile`, {
    headers: { Cookie: `${sessionOnly}; bobo_family=1` },
  });
  assert.equal(settled.headers.getSetCookie().length, 0);
  // Left over without a session: cleared, so the entry disappears.
  const stale = await fetch(`${base}/api/profile`, {
    headers: { Cookie: "bobo_family=1" },
  });
  assert.ok(
    stale.headers.getSetCookie().some((c) => /^bobo_family=;/.test(c)),
    "没有会话时应清除提示 cookie",
  );
  // A visitor is given nothing at all.
  const visitor = await fetch(`${base}/api/profile`);
  assert.equal(visitor.headers.getSetCookie().length, 0);
  report.push(
    "前台聊天入口的提示 cookie：登录下发、老会话补发、失效清除、访客没有",
  );

  // The daily allowance belongs to the owner: members see neither the panel
  // nor the setting, and the change applies without a restart.
  const quotas = (await request("/admin/ai/quotas")).data;
  const original = { draft: quotas.draft, chat: quotas.chat };
  assert.equal(typeof quotas.draft, "number");
  assert.equal(Array.isArray(quotas.today), true);
  await request("/admin/ai/quotas", { cookie: member, status: 403 });
  await request("/admin/ai/quotas", {
    method: "PUT",
    cookie: member,
    body: { draft: 999, chat: 999 },
    status: 403,
  });
  for (const bad of [
    { draft: -1, chat: 5 },
    { draft: 5, chat: 501 },
    { draft: 1.5, chat: 5 },
    { draft: "x", chat: 5 },
  ])
    await request("/admin/ai/quotas", {
      method: "PUT",
      body: bad,
      status: 400,
    });
  await request("/admin/ai/quotas", {
    method: "PUT",
    body: { draft: 3, chat: 7 },
  });
  const seen = (await request("/admin/ai/status", { cookie: member })).data;
  assert.equal(seen.quota, 3);
  assert.equal(seen.chatQuota, 7);

  // Zero is the owner's off switch, without touching .env.
  await request("/admin/ai/quotas", {
    method: "PUT",
    body: { draft: 0, chat: 0 },
  });
  if (status.enabled) {
    const refused = await request("/admin/ai/draft", {
      method: "POST",
      cookie: member,
      body: draft(),
      status: 403,
    });
    assert.match(refused.data.message, /关闭/);
  }
  const log = (await request("/admin/audit-logs")).data;
  assert.match(log[0].summary, /AI 额度/);
  await request("/admin/ai/quotas", { method: "PUT", body: original });
  report.push(
    "AI 额度只有家庭管理员能改，改后立即生效、可设 0 关闭并记入操作记录",
  );

  console.log(JSON.stringify({ enabled: status.enabled, report }, null, 2));
} finally {
  if (memberId)
    await request(`/admin/accounts/${memberId}`, { method: "DELETE" }).catch(
      () => {},
    );
}
