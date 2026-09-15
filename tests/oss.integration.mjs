import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
);
const sharp = require("sharp");
const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.trimStart().startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);

assert.equal(env.STORAGE_DRIVER, "oss", "请先将 STORAGE_DRIVER 设置为 oss");
const origin = env.APP_ORIGIN.replace(/\/$/, "");
const base = (process.env.VERIFY_BASE_URL || origin).replace(/\/$/, "");
let cookie = "";
let entryId = "";
let signedReadUrl = "";

async function api(
  path,
  { method = "GET", body, expected = 200, auth = true } = {},
) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      Origin: origin,
      ...(auth && cookie ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  assert.equal(response.status, expected, `${method} ${path}: ${text}`);
  return { response, data: text ? JSON.parse(text) : null };
}

try {
  await api("/health", { auth: false });
  const login = await api("/auth/login", {
    method: "POST",
    expected: 201,
    auth: false,
    body: {
      username: env.ADMIN_USERNAME,
      password: env.ADMIN_PASSWORD,
    },
  });
  cookie = login.response.headers.get("set-cookie")?.split(";")[0] || "";
  assert(cookie, "登录后没有收到会话 Cookie");

  const created = await api("/admin/entries", {
    method: "POST",
    expected: 201,
    body: {},
  });
  entryId = created.data.id;
  const bytes = await sharp({
    create: {
      width: 96,
      height: 72,
      channels: 3,
      background: "#819474",
    },
  })
    .png()
    .toBuffer();

  const authorized = await api("/admin/media/authorize", {
    method: "POST",
    expected: 201,
    body: {
      entryId,
      name: "OSS 联调测试图片（自动清理）.png",
      mime: "image/png",
      size: bytes.length,
    },
  });
  const uploadUrl = authorized.data.url;
  assert.match(uploadUrl, /^https:\/\//, "API 没有返回 OSS HTTPS 直传地址");

  const preflight = await fetch(uploadUrl, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "PUT",
      "Access-Control-Request-Headers": "content-type",
    },
  });
  const allowedOrigin = preflight.headers.get("access-control-allow-origin");
  assert(
    preflight.ok && (allowedOrigin === "*" || allowedOrigin === origin),
    `OSS CORS 未允许 ${origin} 的 PUT 请求，请检查 Bucket CORS`,
  );

  const uploaded = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/png", Origin: origin },
    body: bytes,
  });
  assert.equal(uploaded.status, 200, `OSS 直传失败：HTTP ${uploaded.status}`);
  const completed = await api(
    `/admin/media/${authorized.data.id}/complete`,
    { method: "POST", expected: 201 },
  );
  assert.equal(completed.data.state, "ready", "服务端媒体处理未完成");

  await api(`/admin/entries/${entryId}`, {
    method: "PUT",
    body: {
      title: "OSS 联调测试（自动清理）",
      occurredOn: "2026-09-15",
      kind: "daily",
      body: "验证 OSS 直传、图片处理和私有签名读取。",
      tags: ["OSS联调"],
      status: "published",
      visibility: "public",
      milestone: false,
      featured: false,
      coverMediaId: authorized.data.id,
      media: [{ id: authorized.data.id, caption: "OSS 联调测试" }],
    },
  });

  const story = await api(`/entries/${entryId}`, { auth: false });
  assert.equal(story.data.media.length, 1);
  signedReadUrl = story.data.media[0].url;
  assert.match(signedReadUrl, /^https:\/\//, "公开接口没有返回 OSS 签名读取地址");
  const downloaded = await fetch(signedReadUrl);
  const downloadedBytes = Buffer.from(await downloaded.arrayBuffer());
  assert.equal(
    downloaded.status,
    200,
    `OSS 签名读取失败：${downloaded.status} ${downloadedBytes.toString("utf8").slice(0, 500)}`,
  );
  assert.match(
    downloaded.headers.get("content-type") || "",
    /image\/webp/,
    "展示图不是 WebP",
  );
  assert(downloadedBytes.byteLength > 0, "OSS 展示图为空");

  console.log(
    JSON.stringify(
      {
        ok: true,
        checks: [
          "API 已使用 OSS HTTPS 预签名直传地址",
          "Bucket CORS 允许当前网站 Origin 的 PUT",
          "服务端从 OSS 回读并生成展示图和缩略图",
          "公开接口签发私有对象的短期 GET 地址",
          "签名地址可读取 WebP 展示图",
        ],
        cleanup: "测试记录与测试对象将在脚本结束时清理",
      },
      null,
      2,
    ),
  );
} finally {
  if (entryId && cookie) {
    await api(`/admin/entries/${entryId}`, { method: "DELETE" }).catch(
      (error) => console.error(`测试数据清理失败：${error.message}`),
    );
  }
  if (signedReadUrl) {
    const afterDelete = await fetch(signedReadUrl).catch(() => null);
    if (afterDelete?.ok)
      console.error("测试对象删除后仍可读取，请检查 RAM 删除权限");
  }
  if (cookie)
    await api("/auth/logout", { method: "POST" }).catch(() => {});
}
