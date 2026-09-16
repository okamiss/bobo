import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
const require = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
);
const sharp = require("sharp");
const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const base = env.APP_ORIGIN;
let cookie = "";
const entries = [],
  albums = [],
  siteMedia = [];
let profileBefore = null;
let checks = 0;
const report = [];
async function request(
  path,
  {
    method = "GET",
    body,
    auth = true,
    status = 200,
    origin = base,
    raw,
    headers = {},
  } = {},
) {
  const r = await fetch(base + "/api" + path, {
    method,
    headers: {
      Origin: origin,
      ...(auth && cookie ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: raw || (body ? JSON.stringify(body) : undefined),
  });
  const text = await r.text();
  assert.equal(r.status, status, `${method} ${path}: ${r.status} ${text}`);
  checks++;
  return { data: text ? JSON.parse(text) : null, response: r };
}
const payload = (changes = {}) => ({
  title: "测试记录（自动清理）",
  occurredOn: "2024-02-29",
  kind: "daily",
  body: "## 一个测试段落\n- 第一项\n> 引用\n纯文本 <script>alert(1)</script>",
  tags: ["测试"],
  status: "draft",
  visibility: "private",
  milestone: false,
  featured: false,
  coverMediaId: null,
  ...changes,
});
async function create() {
  const { data } = await request("/admin/entries", {
    method: "POST",
    body: {},
    status: 201,
  });
  entries.push(data.id);
  return data.id;
}
async function save(id, changes) {
  return (
    await request(`/admin/entries/${id}`, {
      method: "PUT",
      body: payload(changes),
    })
  ).data;
}
async function upload(id, bytes, mime, name) {
  const { data } = await request("/admin/media/authorize", {
    method: "POST",
    body: { entryId: id, name, mime, size: bytes.length },
    status: 201,
  });
  const r = await fetch(new URL(data.url, base), {
    method: "PUT",
    headers: {
      ...data.headers,
      Origin: base,
      ...(data.url.startsWith("/") ? { Cookie: cookie } : {}),
    },
    body: bytes,
  });
  assert.equal(r.status, 200);
  await request(`/admin/media/${data.id}/complete`, {
    method: "POST",
    status: 201,
  });
  return data.id;
}
mkdirSync("test-results", { recursive: true });
try {
  await request("/health", { auth: false });
  await request("/admin/entries", { auth: false, status: 401 });
  await request("/auth/login", {
    method: "POST",
    origin: "https://wrong.example",
    body: { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD },
    status: 403,
  });
  const login = await request("/auth/login", {
    method: "POST",
    body: { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD },
    status: 201,
  });
  cookie = login.response.headers.get("set-cookie").split(";")[0];
  assert.match(login.response.headers.get("set-cookie"), /HttpOnly/i);
  report.push("登录、会话与跨来源写入限制通过");
  const a = await create(),
    b = await create(),
    c = await create();
  await request(`/admin/entries/${a}`, {
    method: "PUT",
    body: payload({ occurredOn: "2025-02-29" }),
    status: 400,
  });
  const image = await sharp({
    create: { width: 80, height: 60, channels: 3, background: "#a0b38d" },
  })
    .png()
    .toBuffer();
  const ma = await upload(a, image, "image/png", "测试图片.png"),
    mb = await upload(b, image, "image/png", "私密图片.png");
  const bad = await request("/admin/media/authorize", {
    method: "POST",
    body: { entryId: c, name: "伪装图片.png", mime: "image/png", size: 4 },
    status: 201,
  });
  await request(`/admin/media/${bad.data.id}/upload`, {
    method: "PUT",
    raw: Buffer.from("oops"),
    headers: { "Content-Type": "image/png" },
  });
  await request(`/admin/media/${bad.data.id}/complete`, {
    method: "POST",
    status: 400,
  });
  await request(`/admin/media/${bad.data.id}`, { method: "DELETE" });
  await request("/admin/media/authorize", {
    method: "POST",
    body: {
      entryId: a,
      name: "huge.png",
      mime: "image/png",
      size: 21 * 1024 * 1024,
    },
    status: 400,
  });
  const videoPath = join("test-results", "test-clip.mp4");
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=0x73836b:s=160x120:d=1",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-an",
    "-y",
    videoPath,
  ]);
  const mv = await upload(
    a,
    readFileSync(videoPath),
    "video/mp4",
    "测试短视频.mp4",
  );
  await save(a, {
    status: "published",
    visibility: "public",
    milestone: true,
    featured: true,
    coverMediaId: ma,
    media: [
      { id: mv, caption: "视频说明" },
      { id: ma, caption: "图片说明" },
    ],
  });
  await save(b, {
    status: "published",
    visibility: "private",
    tags: ["私密专属标签"],
  });
  const unpublished = await upload(a, image, "image/png", "未保存的新照片.png");
  await request(`/media/${unpublished}/access`, { auth: false, status: 404 });
  assert.equal(
    (await request(`/entries/${a}`, { auth: false })).data.media.length,
    2,
  );
  await request(`/admin/media/${unpublished}`, { method: "DELETE" });
  await save(c, {
    status: "draft",
    visibility: "public",
    body: "啵".repeat(50000),
  });
  report.push("5 万字中文正文可以完整保存");
  const publicList = (
    await request(
      "/entries?year=2024&tag=%E6%B5%8B%E8%AF%95&q=%E6%B5%8B%E8%AF%95",
      { auth: false },
    )
  ).data;
  assert(publicList.items.some((x) => x.id === a));
  assert(!publicList.items.some((x) => x.id === b || x.id === c));
  assert(!publicList.tags.includes("私密专属标签"));
  await request(`/admin/entries/${a}`, {
    method: "PUT",
    body: payload({ coverMediaId: mb }),
    status: 400,
  });
  await request(`/admin/entries/${a}`, {
    method: "PUT",
    body: payload({ media: [{ id: mb, caption: "" }] }),
    status: 400,
  });
  await request(`/entries/${b}`, { auth: false, status: 404 });
  await request(`/entries/${c}`, { auth: false, status: 404 });
  await request(`/media/${mb}/access`, { auth: false, status: 404 });
  const detail = (await request(`/entries/${a}`, { auth: false })).data;
  assert.equal(detail.media[0].id, mv);
  const pic = detail.media.find((x) => x.id === ma);
  const imageResponse = await fetch(new URL(pic.url, base));
  assert.equal(imageResponse.status, 200);
  const metadata = await sharp(
    Buffer.from(await imageResponse.arrayBuffer()),
  ).metadata();
  assert.equal(metadata.format, "webp");
  assert(!metadata.exif);
  const vid = detail.media.find((x) => x.id === mv);
  const vr = await fetch(new URL(vid.url, base), {
    headers: { Range: "bytes=0-31" },
  });
  assert.equal(vr.status, 206);
  assert.equal((await vr.arrayBuffer()).byteLength, 32);
  const unsigned = new URL(pic.url, base);
  unsigned.searchParams.set("token", "0".repeat(64));
  assert.equal((await fetch(unsigned)).status, 401);
  report.push("真实图片处理、视频封面、范围播放、格式与大小校验通过");
  const album = (
    await request("/admin/albums", { method: "POST", status: 201 })
  ).data;
  albums.push(album.id);
  await request(`/admin/albums/${album.id}`, {
    method: "PUT",
    body: {
      title: "测试相册（自动清理）",
      description: "权限验收",
      visibility: "public",
      coverMediaId: mb,
      mediaIds: [mb, ma, mv],
    },
  });
  let publicAlbum = (await request(`/albums/${album.id}`, { auth: false }))
    .data;
  assert.equal(publicAlbum.items.length, 2);
  assert.equal(publicAlbum.coverMediaId, ma);
  await save(a, {
    visibility: "private",
    status: "published",
    coverMediaId: ma,
  });
  await request(`/media/${ma}/access`, { auth: false, status: 404 });
  publicAlbum = (await request(`/albums/${album.id}`, { auth: false })).data;
  assert.equal(publicAlbum.items.length, 0);
  assert.equal(publicAlbum.coverMediaId, null);
  report.push("公开列表、搜索、详情、相册及新媒体授权的私密隔离通过");
  await request(`/admin/albums/${album.id}`, { method: "DELETE" });
  albums.pop();
  const retained = (await request(`/admin/entries/${a}`)).data;
  assert.equal(retained.media.length, 2);
  report.push("删除相册保留原始故事和媒体通过");
  const neighbors = [];
  for (const occurredOn of ["2024-02-29", "2024-02-29", "2024-03-01"]) {
    const id = await create();
    await save(id, { occurredOn, status: "published", visibility: "public" });
    neighbors.push(id);
  }
  const ordered = [];
  for (let page = 1; ; page++) {
    const list = (
      await request(`/entries?limit=50&page=${page}`, { auth: false })
    ).data;
    ordered.push(...list.items.map((x) => x.id));
    if (!list.items.length || ordered.length >= list.total) break;
  }
  for (const id of neighbors) {
    const i = ordered.indexOf(id);
    const story = (await request(`/entries/${id}`, { auth: false })).data;
    assert.equal(story.previous?.id ?? null, ordered[i - 1] ?? null);
    assert.equal(story.next?.id ?? null, ordered[i + 1] ?? null);
  }
  report.push("公开故事的上一篇、下一篇与时间线顺序一致");
  profileBefore = (await request("/admin/profile")).data;
  const siteCover = await upload(null, image, "image/png", "测试封面.png");
  siteMedia.push(siteCover);
  assert(!(await request("/admin/media")).data.some((m) => m.id === siteCover));
  assert(
    (await request("/admin/site-media")).data.some((m) => m.id === siteCover),
  );
  await request(`/media/${siteCover}/access`, { auth: false, status: 404 });
  await request("/admin/profile", {
    method: "PUT",
    body: { ...profileBefore, aboutCoverMediaId: siteCover },
  });
  const publicProfile = (await request("/profile", { auth: false })).data;
  assert.equal(publicProfile.aboutCover.id, siteCover);
  assert.equal(publicProfile.coverMediaId, profileBefore.coverMediaId);
  await request(`/media/${siteCover}/access`, { auth: false });
  await request("/admin/profile", {
    method: "PUT",
    body: { ...profileBefore, aboutCoverMediaId: ma },
    status: 400,
  });
  await request("/admin/media/authorize", {
    method: "POST",
    body: { entryId: null, name: "封面.mp4", mime: "video/mp4", size: 100 },
    status: 400,
  });
  report.push("页面封面支持上传图片，且只在被选为封面时公开");
  if (process.argv.includes("--keep")) {
    writeFileSync(
      "test-results/persistence.json",
      JSON.stringify({ entryId: a, mediaId: ma, entries }, null, 2),
    );
    entries.splice(0);
    report.push("已保留明确标注的私密测试记录，供重建持久化检查，检查后清理");
  }
  console.log(JSON.stringify({ checks, report }, null, 2));
  writeFileSync(
    "test-results/integration.json",
    JSON.stringify({ at: new Date().toISOString(), checks, report }, null, 2),
  );
} finally {
  if (profileBefore)
    await request("/admin/profile", {
      method: "PUT",
      body: profileBefore,
    }).catch(() => {});
  for (const id of siteMedia)
    await request(`/admin/media/${id}`, { method: "DELETE" }).catch(() => {});
  for (const id of albums)
    await request(`/admin/albums/${id}`, { method: "DELETE" }).catch(() => {});
  for (const id of entries)
    await request(`/admin/entries/${id}`, { method: "DELETE" }).catch(() => {});
  rmSync(join("test-results", "test-clip.mp4"), { force: true });
}
