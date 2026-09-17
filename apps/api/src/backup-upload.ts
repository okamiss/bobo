import { config, ossClient } from "./config";
// Offsite copy of a database backup, streamed from scripts/backup.sh:
//   docker compose exec -T api node dist/backup-upload.js <name> < backups/<name>
async function main() {
  const name = process.argv[2];
  if (!name || !/^bobo-[\w-]+\.dump$/.test(name))
    throw new Error(
      "用法：node dist/backup-upload.js <bobo-*.dump> < 备份文件",
    );
  if (config().storage !== "oss") {
    console.log("未使用 OSS 存储，跳过异地备份。");
    return;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  if (!body.length) throw new Error("备份文件为空，未上传");
  await ossClient().put(`backups/${name}`, body, {
    headers: { "Content-Type": "application/octet-stream" },
  });
  console.log(
    `已上传到 OSS：backups/${name}（${Math.ceil(body.length / 1024)} KB）`,
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
