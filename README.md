# 啵啵的小日子

雪纳瑞啵啵的响应式成长手账。React + Vite / NestJS / PostgreSQL + Prisma / OSS，前后端分离，全部服务通过 Docker Compose 运行。

## 一键启动

在项目根目录执行。宿主机只需要已运行的 Docker 和 Docker Compose（支持 `up --wait`）。

Windows PowerShell：

```powershell
.\scripts\deploy.ps1
```

Ubuntu：

```bash
bash scripts/deploy.sh
```

首次执行自动生成 `.env`，数据库密码、管理员密码、会话密钥均为独立随机值。用户名默认 `owner`，登录密码见本地 `.env` 的 `ADMIN_PASSWORD`。配置文件不提交、不打包进镜像、不输出到容器日志。

配置完成后，两端都可直接执行：

```bash
docker compose up -d --build --wait --wait-timeout 180
```

前台：<http://localhost:8080>，后台：<http://localhost:8080/admin>。必须使用与 `APP_ORIGIN` 完全一致的域名、协议与端口；不要将 `localhost` 随意换成 `127.0.0.1`，写入接口会校验来源。

启动链路：PostgreSQL 健康 → `init` 执行已提交的数据库迁移与首次管理员创建 → NestJS 健康 → Nginx 健康。`init` 正常退出是预期结果。`--wait` 超时或服务失败会返回非零退出码；构建耗时另计。API 使用固定摘要的官方 Node Alpine 镜像，ffmpeg 从 Alpine 官方软件仓库安装，保留软件包签名校验。

## 开始记录

1. 登录后台，进入「啵啵与网站」，填写生日、到家日期和介绍。
2. 点击「写下新的一天」，填写标题、发生日期、正文。支持小标题 `## `、列表 `- `、引用 `> `；HTML 始终按文字显示。
3. 添加照片与短视频，等待进度和校验完成；调整顺序、说明和封面。
4. 选择草稿或已发布、只有自己或所有访客，点击保存。里程碑和首页精选独立控制。
5. 创建相册，从已经上传的媒体中挑选、排序。删除相册不删除原故事或文件。
6. 首页封面从公开已发布故事的照片中选择；原故事改为私密后，公开封面自动隐藏。

初始数据库不包含演示记录。未选择首页封面时，前台使用随站点打包的啵啵真实照片；后台仍可从公开且已发布的故事照片中更换封面。生日与到家日期未填写时不显示虚构天数。界面同时支持 375 / 390 / 430px 手机、768px 平板以及 1280 / 1440 / 1920px 桌面宽度；手机端使用底部导航，后台表单和媒体编辑区会自动改为触控友好的单栏布局。

## 媒体与存储

图片：静态 JPG / PNG / WebP，最多 20MB，最多 6000 万解码像素。视频：MP4 容器、H.264 视频、可选 AAC 音轨，最多 200MB / 180 秒。不自动转码 HEIC、MOV、HEVC。

后端实际检查文件内容；图片生成 640px 缩略图和最长边 2000px 展示图，自动校正 EXIF 方向并移除展示图元数据。视频使用容器内 ffprobe 核验、ffmpeg 生成首帧封面，不自动播放，支持 HTTP Range 播放。

`STORAGE_DRIVER=local` 将文件存入 Docker 命名卷；`STORAGE_DRIVER=oss` 使用私有 OSS Bucket。切换驱动不会自动迁移既有文件，已有本地记录时需先迁移同名对象再切换。

### OSS 配置

在 `.env` 设置以下值，之后重新执行部署命令：

```dotenv
STORAGE_DRIVER=oss
OSS_REGION=oss-cn-hangzhou
OSS_BUCKET=your-private-bucket
OSS_ACCESS_KEY_ID=your-ram-key
OSS_ACCESS_KEY_SECRET=your-ram-secret
```

切换后执行完整联调：

```bash
npm run test:oss
```

该命令会创建一条明确标注的临时私密记录，验证预签名 PUT、Bucket CORS、服务端回读与图片处理、短期 GET 签名及 WebP 展示图读取，结束时自动删除测试记录和对应 OSS 对象。成功输出包含 `"ok": true`。本地原有媒体不会被切换命令自动上传；应先将同名的 `.original`、`.display`、`.thumb` 对象迁入 Bucket，确认后再切换驱动。

使用仅允许目标 Bucket 对象读写删除的 RAM 凭据。Bucket 保持私有；前端只收到短期签名 URL，不接收长期 AccessKeySecret。

Bucket 的 CORS：

- AllowedOrigin：本地 `http://localhost:8080` 和正式网站 Origin，按实际使用配置。
- AllowedMethod：`PUT`、`GET`、`HEAD`。
- AllowedHeader：`Content-Type`、`Range`。
- ExposeHeader：`ETag`、`Content-Length`、`Content-Range`、`Accept-Ranges`。

流程：登录后获取 10 分钟 PUT 签名 → 浏览器上传到 `staging/` → 后端下载并校验 → 从校验后的文件生成最终对象 → 媒体标为可用。重新上传 staging 文件不能覆盖已验证展示文件。建议为 `staging/` 配置 1 天生命周期，清除中断上传；不为正式文件配置自动删除。

公开接口只为公开已发布故事签发读取地址；默认有效期 5 分钟。记录改为私密后立即停止签发新地址，已经取得的地址到期失效。相册可见性不能覆盖原故事的私密设置。图片原片不对匿名访客提供下载。

## Ubuntu 与 HTTPS

把源代码和锁文件复制到 Ubuntu，准备 `.env`。服务器使用独立随机凭据，不直接复用本地开发凭据。证书目录内放置 `fullchain.pem` 和 `privkey.pem`。

```dotenv
APP_ORIGIN=https://your-domain.example
DEPLOY_ENV=production
HTTP_PORT=80
HTTPS_PORT=443
COMPOSE_FILE=compose.yaml:compose.https.yaml
TLS_CERT_DIR=/absolute/path/to/certs
STORAGE_DRIVER=oss
```

填写 OSS 配置后执行 `bash scripts/deploy.sh`。Compose 自动读取 `.env` 中的 `COMPOSE_FILE`，使用同一入口启用 HTTPS 配置。Windows 多 Compose 文件分隔符为 `;`，Ubuntu 为 `:`。

Nginx 挂载只读证书，公开环境只暴露 HTTP/HTTPS 入口；API 与 PostgreSQL 留在内部 Docker 网络。生产配置强制 HTTPS，并设置 Secure Cookie。域名解析、证书签发续期和服务器入口端口由实际服务器环境配置；更换证书后执行 `docker compose exec web nginx -s reload`。

## 更新、备份与恢复

更新前备份：

```powershell
.\scripts\backup.ps1
```

```bash
bash scripts/backup.sh
```

备份保存在 `backups/`，格式为 PostgreSQL custom dump。替换代码后运行原部署命令，会应用新迁移；不会自动重置数据库或覆盖已有管理员密码。修改 `ADMIN_PASSWORD` 不是已有账号的密码重置方式。版本回退需考虑迁移兼容性，不保证旧代码能读取新数据库结构。

恢复演练（备份路径为实际文件）：

```powershell
.\scripts\restore.ps1 -Backup .\backups\bobo-YYYYMMDD-HHMMSS.dump
```

```bash
bash scripts/restore.sh backups/bobo-YYYYMMDD-HHMMSS.dump
```

恢复脚本创建独立 `bobo_restore` 数据库，绝不覆盖运行中的 `bobo`。若演练数据库已存在则失败，保留旧演练结果。先检查恢复表和记录，再安排正式恢复窗口。

数据库备份不包含媒体。本地媒体另行导出：

```bash
docker compose exec -T api tar -czf /tmp/bobo-media.tar.gz -C /data/media .
docker compose cp api:/tmp/bobo-media.tar.gz backups/bobo-media.tar.gz
```

媒体导出期间暂停新增/删除操作以获得一致的数据库与文件备份。OSS 对象使用 Bucket 版本控制或独立备份规则保护，数据库备份不能代替对象备份。

日常排查：

```bash
docker compose ps -a
docker compose logs --tail 100 init api web
docker compose restart api web
docker compose down
```

普通 `down` 保留命名卷。不要将 `down -v` 用于更新，它会删除数据库和本地媒体。日志设置轮转，单文件 10MB、保留 3 份。

## 开发与验证

```bash
npm ci
npm run build
npm run typecheck
npm test
npm run test:integration
```

集成测试要求 Docker 网站运行、项目根目录存在对应 `.env`，宿主机测试工具需 Node.js 和 ffmpeg；部署本身不要求宿主机安装这些工具。测试创建明确标注的临时记录、图片和视频，在完成后清理。不要同时在测试中编辑测试记录。

`tests/unit.test.mjs` 覆盖有效日期、年龄与天数、上传边界、密码验证及 OSS 配置失败；`tests/integration.mjs` 覆盖登录、来源限制、真实图片视频处理、私密隔离、相册复用与删除行为；`tests/oss.integration.mjs` 面向真实私有 Bucket 验证预签名上传、CORS、服务端处理、签名读取与自动清理。

项目结构：`apps/web` 为前台与后台界面，`apps/api` 为 NestJS 与 Prisma 迁移，`deploy` 为 Nginx 配置，`scripts` 为部署备份入口，`tests` 为验收测试。

实际验收记录见 `docs/verification.md`。本地 Docker 成功不等于真实阿里云服务器或 OSS 已验收。
