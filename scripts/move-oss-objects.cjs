// Moves this site's OSS objects from the bucket root into OSS_PREFIX (default
// "bobo/"). Only objects referenced by this database's media, plus root
// backups/bobo-*.dump, are touched, so other projects in a shared bucket are
// safe. Runs inside the api container (old or new image), which has the OSS
// credentials and database access:
//
//   docker compose exec -T api node - copy   < scripts/move-oss-objects.cjs
//   docker compose exec -T api node - delete < scripts/move-oss-objects.cjs
//
// "copy" never removes anything and can be repeated. "delete" removes a root
// object only when its copy under the prefix has the same ETag and size; run it
// once every environment that uses the bucket reads from the prefix.
const OSS = require("ali-oss");
const { PrismaClient } = require("@prisma/client");

const mode = process.argv[2];
const e = process.env;

function normalize(value) {
  const prefix = value.replace(/^\/+|\/+$/g, "");
  if (!prefix) return "";
  if (prefix.split("/").some((s) => !/^[\w.-]+$/.test(s) || /^\.\.?$/.test(s)))
    throw new Error("OSS_PREFIX 只能包含字母、数字、点、横线、下划线和斜杠");
  return `${prefix}/`;
}

async function head(oss, key) {
  try {
    const { res } = await oss.head(key);
    return { etag: res.headers.etag, size: res.headers["content-length"] };
  } catch (err) {
    if (err.status === 404 || err.code === "NoSuchKey") return null;
    throw err;
  }
}

async function main() {
  if (!["copy", "delete"].includes(mode))
    throw new Error(
      "用法：docker compose exec -T api node - copy|delete < scripts/move-oss-objects.cjs",
    );
  if (e.STORAGE_DRIVER !== "oss") {
    console.log("当前不是 OSS 存储，无需迁移。");
    return;
  }
  const prefix = normalize(e.OSS_PREFIX ?? "bobo");
  if (!prefix) {
    console.log("OSS_PREFIX 为空，对象本来就在根目录，无需迁移。");
    return;
  }
  const oss = new OSS({
    region: e.OSS_REGION,
    bucket: e.OSS_BUCKET,
    accessKeyId: e.OSS_ACCESS_KEY_ID,
    accessKeySecret: e.OSS_ACCESS_KEY_SECRET,
    secure: true,
    authorizationV4: true,
  });
  const db = new PrismaClient();
  const keys = [];
  try {
    for (const m of await db.media.findMany({ select: { key: true } }))
      for (const variant of ["original", "display", "thumb"])
        keys.push(`${m.key}.${variant}`);
  } finally {
    await db.$disconnect();
  }
  let marker;
  do {
    // V4 signing breaks if an undefined query parameter is passed.
    const page = await oss.list({
      prefix: "backups/bobo-",
      "max-keys": 1000,
      ...(marker ? { marker } : {}),
    });
    for (const o of page.objects || []) keys.push(o.name);
    marker = page.isTruncated ? page.nextMarker : undefined;
  } while (marker);

  const counts = {};
  const count = (label) => (counts[label] = (counts[label] || 0) + 1);
  for (const key of keys) {
    const source = await head(oss, key);
    if (!source) {
      count(
        mode === "copy"
          ? "根目录不存在（已迁移或无此文件）"
          : "根目录已无此文件",
      );
      continue;
    }
    const target = await head(oss, prefix + key);
    const same =
      target && target.etag === source.etag && target.size === source.size;
    if (mode === "copy") {
      if (same) count("已在目标目录");
      else if (target) {
        count("目标已存在但内容不同，已跳过");
        console.warn(`跳过：${prefix}${key} 已存在且与根目录文件不同`);
      } else {
        await oss.copy(prefix + key, key);
        count("已复制");
      }
    } else if (same) {
      await oss.delete(key);
      count("已删除根目录旧文件");
    } else {
      count("目标缺失或不一致，未删除");
      console.warn(
        `未删除：${key}（${prefix}${key} 不存在或内容不一致，请先执行 copy）`,
      );
    }
  }
  console.log(`模式：${mode}，目标目录：${prefix}，检查对象：${keys.length}`);
  for (const [label, n] of Object.entries(counts))
    console.log(`  ${label}：${n}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
