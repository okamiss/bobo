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
let ownerCookie = "";
let memberCookie = "";
let accountId = "";
let albumId = "";
const entryIds = [];

async function request(
  path,
  { method = "GET", body, cookie = ownerCookie, status = 200 } = {},
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

const story = (changes = {}) => ({
  title: "家庭账号署名测试",
  occurredOn: "2026-09-15",
  kind: "daily",
  body: "这是一篇会自动清理的测试记录。",
  tags: ["测试"],
  status: "published",
  visibility: "public",
  milestone: false,
  featured: false,
  coverMediaId: null,
  media: [],
  ...changes,
});

try {
  const ownerLogin = await request("/auth/login", {
    method: "POST",
    cookie: "",
    body: {
      username: env.ADMIN_USERNAME,
      password: env.ADMIN_PASSWORD,
    },
    status: 201,
  });
  ownerCookie = ownerLogin.response.headers.get("set-cookie").split(";")[0];
  assert.equal(ownerLogin.data.role, "owner");

  const suffix = Date.now().toString(36);
  const displayName = `测试家人${suffix.slice(-4)}`;
  const member = await request("/admin/accounts", {
    method: "POST",
    body: {
      username: `family_${suffix}`,
      displayName: `${displayName}旧`,
      password: `Family-${suffix}-safe`,
    },
    status: 201,
  });
  accountId = member.data.id;
  await request(`/admin/accounts/${accountId}/name`, {
    method: "PUT",
    body: { displayName },
  });

  const memberLogin = await request("/auth/login", {
    method: "POST",
    cookie: "",
    body: {
      username: member.data.username,
      password: `Family-${suffix}-safe`,
    },
    status: 201,
  });
  memberCookie = memberLogin.response.headers.get("set-cookie").split(";")[0];
  assert.equal(memberLogin.data.displayName, displayName);
  await request("/admin/accounts", { cookie: memberCookie, status: 403 });

  // Changing your own password keeps this session and signs out other devices.
  const login = (password, status = 201) =>
    request("/auth/login", {
      method: "POST",
      cookie: "",
      body: { username: member.data.username, password },
      status,
    });
  const cookieOf = (response) =>
    response.headers.get("set-cookie").split(";")[0];
  const otherDevice = cookieOf((await login(`Family-${suffix}-safe`)).response);
  await request("/auth/password", {
    method: "PUT",
    cookie: memberCookie,
    body: { currentPassword: "not-the-password", newPassword: "x".repeat(12) },
    status: 400,
  });
  await request("/auth/password", {
    method: "PUT",
    cookie: memberCookie,
    body: {
      currentPassword: `Family-${suffix}-safe`,
      newPassword: `Family-${suffix}-changed`,
    },
  });
  await request("/auth/me", { cookie: memberCookie });
  await request("/auth/me", { cookie: otherDevice, status: 401 });
  await login(`Family-${suffix}-safe`, 401);

  // Only the owner resets member passwords, which signs the member out.
  await request(`/admin/accounts/${accountId}/password`, {
    method: "PUT",
    cookie: memberCookie,
    body: { password: "x".repeat(12) },
    status: 403,
  });
  await request(`/admin/accounts/${ownerLogin.data.id}/password`, {
    method: "PUT",
    body: { password: "x".repeat(12) },
    status: 400,
  });
  await request(`/admin/accounts/${accountId}/password`, {
    method: "PUT",
    body: { password: `Family-${suffix}-reset` },
  });
  await request("/auth/me", { cookie: memberCookie, status: 401 });
  memberCookie = cookieOf((await login(`Family-${suffix}-reset`)).response);

  // Members can read the owner's story but cannot change it or its media.
  const ownerEntry = await request("/admin/entries", {
    method: "POST",
    body: { occurredOn: "2026-09-15" },
    status: 201,
  });
  entryIds.push(ownerEntry.data.id);
  await request(`/admin/entries/${ownerEntry.data.id}`, {
    cookie: memberCookie,
  });
  await request(`/admin/entries/${ownerEntry.data.id}`, {
    method: "PUT",
    cookie: memberCookie,
    body: story(),
    status: 403,
  });
  await request(`/admin/entries/${ownerEntry.data.id}`, {
    method: "DELETE",
    cookie: memberCookie,
    status: 403,
  });
  await request("/admin/media/authorize", {
    method: "POST",
    cookie: memberCookie,
    body: {
      entryId: ownerEntry.data.id,
      name: "test.png",
      mime: "image/png",
      size: 100,
    },
    status: 403,
  });

  // Members edit shared site content too; the owner sees who did what.
  await request("/admin/site-media", { cookie: memberCookie });
  await request("/admin/profile", { cookie: memberCookie });
  albumId = (
    await request("/admin/albums", {
      method: "POST",
      cookie: memberCookie,
      status: 201,
    })
  ).data.id;
  await request(`/admin/albums/${albumId}`, {
    method: "PUT",
    cookie: memberCookie,
    body: {
      title: "家人整理的测试相册",
      description: "",
      visibility: "private",
      coverMediaId: null,
      mediaIds: [],
    },
  });
  await request(`/admin/albums/${albumId}`, {
    method: "DELETE",
    cookie: memberCookie,
  });
  albumId = "";
  await request("/admin/audit-logs", { cookie: memberCookie, status: 403 });
  const logs = (await request("/admin/audit-logs")).data;
  const mine = logs
    .filter((log) => log.actorName === displayName)
    .map((log) => log.summary);
  assert.deepEqual(mine.slice(0, 3), [
    "删除了相册「家人整理的测试相册」",
    "修改了相册「新的相册」，并改名为「家人整理的测试相册」",
    "新建了相册「新的相册」",
  ]);

  // Members manage their own stories, and attribution stays with them even
  // after the owner edits the story.
  const memberEntry = await request("/admin/entries", {
    method: "POST",
    cookie: memberCookie,
    body: { occurredOn: "2026-09-15" },
    status: 201,
  });
  entryIds.push(memberEntry.data.id);
  await request(`/admin/entries/${memberEntry.data.id}`, {
    method: "PUT",
    cookie: memberCookie,
    body: story({ status: "draft" }),
  });
  await request(`/admin/entries/${memberEntry.data.id}`, {
    method: "PUT",
    body: story({ title: "管理员替成员发布" }),
  });
  const publicEntry = await request(`/entries/${memberEntry.data.id}`, {
    cookie: "",
  });
  assert.equal(publicEntry.data.author.displayName, displayName);
  await request(`/admin/entries/${memberEntry.data.id}`, {
    method: "DELETE",
    cookie: memberCookie,
  });
  entryIds.splice(entryIds.indexOf(memberEntry.data.id), 1);

  await request(`/admin/entries/${ownerEntry.data.id}`, { method: "DELETE" });
  entryIds.splice(0);
  await request(`/admin/accounts/${accountId}/status`, {
    method: "PUT",
    body: { active: false },
  });
  await request("/auth/me", { cookie: memberCookie, status: 401 });
  await request(`/admin/accounts/${accountId}`, { method: "DELETE" });
  accountId = "";

  console.log(
    "家庭账号创建、修改与重置密码、成员只能修改自己的记录、成员可管理相册且留下操作记录、署名保留、停用与清理通过",
  );
} finally {
  if (albumId)
    await request(`/admin/albums/${albumId}`, { method: "DELETE" }).catch(
      () => {},
    );
  for (const id of entryIds)
    await request(`/admin/entries/${id}`, { method: "DELETE" }).catch(() => {});
  if (accountId)
    await request(`/admin/accounts/${accountId}`, { method: "DELETE" }).catch(
      () => {},
    );
}
