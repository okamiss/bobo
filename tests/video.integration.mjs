import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Needs the site running and host ffmpeg/ffprobe with libx265 and libx264.
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
const dir = join("test-results", "video");
let cookie = "";
let entryId = "";

async function request(path, { method = "GET", body, status = 200 } = {}) {
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
  return text ? JSON.parse(text) : null;
}
const ffmpeg = (...args) =>
  execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "pipe" });
const probe = (file) =>
  JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_format", "-show_streams", "-of", "json", file],
      { encoding: "utf8" },
    ),
  );
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

// Uploads through the same flow as the admin page and waits for processing.
// A failure arrives either as a 400 or, for background work, via status.
async function upload(file, mime) {
  const bytes = readFileSync(file);
  const permit = await request("/admin/media/authorize", {
    method: "POST",
    body: { entryId, name: file, mime, size: bytes.length },
    status: 201,
  });
  const put = await fetch(new URL(permit.url, base), {
    method: "PUT",
    headers: {
      ...permit.headers,
      Origin: base,
      ...(permit.url.startsWith("/") ? { Cookie: cookie } : {}),
    },
    body: bytes,
  });
  assert.equal(put.status, 200);
  const response = await fetch(
    `${base}/api/admin/media/${permit.id}/complete`,
    { method: "POST", headers: { Origin: base, Cookie: cookie } },
  );
  const done = await response.json();
  if (response.status === 400) return { id: permit.id, error: done.message };
  assert.equal(response.status, 201, JSON.stringify(done));
  for (let state = done.state; state !== "ready"; ) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const status = await request(`/admin/media/${permit.id}/status`);
    if (status.state === "pending")
      return { id: permit.id, error: status.error };
    state = status.state;
  }
  return { id: permit.id, bytes };
}
async function download(id, name) {
  const media = await request(`/media/${id}/access`);
  const response = await fetch(new URL(media.url, base));
  assert.equal(response.status, 200);
  const file = join(dir, name);
  writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  return { media, file };
}

mkdirSync(dir, { recursive: true });
try {
  const iphone = join(dir, "iphone-hdr.mov");
  ffmpeg(
    ...["-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=60"],
    ...["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000"],
    ...["-t", "3", "-c:v", "libx265", "-pix_fmt", "yuv420p10le"],
    // HLG tags must be written by the encoder itself, as an iPhone does.
    "-x265-params",
    "log-level=error:colorprim=bt2020:transfer=arib-std-b67:colormatrix=bt2020nc",
    ...["-tag:v", "hvc1", "-c:a", "aac", "-f", "mov"],
    join(dir, "unrotated.mov"),
  );
  ffmpeg(
    ...["-display_rotation", "90", "-i", join(dir, "unrotated.mov")],
    ...["-c", "copy", "-f", "mov", iphone],
  );
  const source = probe(iphone).streams.find((s) => s.codec_type === "video");
  assert.equal(source.color_transfer, "arib-std-b67");
  const h264 = join(dir, "compatible.mp4");
  ffmpeg(
    ...["-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30"],
    ...["-f", "lavfi", "-i", "sine=frequency=330:sample_rate=48000"],
    ...["-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p"],
    ...["-c:a", "aac", "-movflags", "+faststart", h264],
  );
  const long = join(dir, "long.mp4");
  ffmpeg(
    ...["-f", "lavfi", "-i", "color=c=gray:s=32x32:r=1:d=181"],
    ...["-c:v", "libx264", "-pix_fmt", "yuv420p", long],
  );
  const fake = join(dir, "fake.mov");
  writeFileSync(fake, Buffer.alloc(4096, 7));

  const login = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({
      username: env.ADMIN_USERNAME,
      password: env.ADMIN_PASSWORD,
    }),
  });
  cookie = login.headers.get("set-cookie").split(";")[0];
  entryId = (
    await request("/admin/entries", { method: "POST", body: {}, status: 201 })
  ).id;

  // Unsupported types and oversized videos get a readable message.
  const rejected = await request("/admin/media/authorize", {
    method: "POST",
    body: { entryId, name: "a.webm", mime: "video/webm", size: 100 },
    status: 400,
  });
  assert.match(rejected.message, /只支持 JPG、PNG、WebP 图片和 MP4、MOV 视频/);
  const huge = await request("/admin/media/authorize", {
    method: "POST",
    body: {
      entryId,
      name: "big.mov",
      mime: "video/quicktime",
      size: 501 * 1024 * 1024,
    },
    status: 400,
  });
  assert.match(huge.message, /视频最大 500MB/);

  // An iPhone-style HEVC HDR MOV becomes a portrait 30 fps H.264 MP4.
  const converted = await upload(iphone, "video/quicktime");
  assert.equal(converted.error, undefined, converted.error);
  const out = await download(converted.id, "converted.mp4");
  assert.equal(out.media.mime, "video/mp4");
  assert.deepEqual([out.media.width, out.media.height], [720, 1280]);
  assert.ok(Math.abs(out.media.duration - 3) < 0.2);
  const info = probe(out.file);
  const video = info.streams.find((s) => s.codec_type === "video");
  const audio = info.streams.find((s) => s.codec_type === "audio");
  assert.equal(video.codec_name, "h264");
  assert.equal(video.pix_fmt, "yuv420p");
  assert.deepEqual([video.width, video.height], [720, 1280]);
  assert.equal(video.color_transfer, "bt709");
  assert.equal(eval(video.avg_frame_rate) <= 30, true);
  assert.equal(audio.codec_name, "aac");
  assert.ok(
    !video.side_data_list?.some((d) => d.rotation),
    "rotation is applied to the frames",
  );

  // A browser-ready H.264 MP4 is stored exactly as uploaded.
  const kept = await upload(h264, "video/mp4");
  const same = await download(kept.id, "kept.mp4");
  assert.equal(sha(readFileSync(same.file)), sha(kept.bytes));

  const tooLong = await upload(long, "video/mp4");
  assert.match(tooLong.error, /视频最长 3 分钟/);
  const broken = await upload(fake, "video/quicktime");
  assert.match(broken.error, /无法识别这个视频文件/);
  await request(`/admin/media/${tooLong.id}`, { method: "DELETE" });
  await request(`/admin/media/${broken.id}`, { method: "DELETE" });

  console.log(
    "视频：iPhone HEVC/HDR MOV 转为竖屏 30fps H.264 MP4，兼容 MP4 原样保留，超长、损坏、不支持的类型和超大文件给出中文提示，通过",
  );
} finally {
  if (entryId)
    await request(`/admin/entries/${entryId}`, { method: "DELETE" }).catch(
      () => {},
    );
  rmSync(dir, { recursive: true, force: true });
}
