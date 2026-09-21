# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

「啵啵的小日子」：给雪纳瑞啵啵做的家庭成长手账网站。前台展示公开故事和相册，后台供家人记录。npm workspaces 单仓：`apps/api`（NestJS + Prisma + PostgreSQL），`apps/web`（React 19 + Vite，后台用 Ant Design）。所有服务通过 Docker Compose 运行。界面文案、API 错误信息和用户文档（README、docs/）都是中文；代码注释和提交信息用英文。

## 常用命令

```bash
npm ci
npm run build          # API: prisma generate + tsc；Web: tsc -b + vite build
npm run typecheck      # 两个 workspace
npm run build --workspace @bobo/api && npm test   # 单元测试会 require apps/api/dist，先构建 API
node --test --test-name-pattern "password" tests/unit.test.mjs   # 运行单个单元测试
npx prettier --write <改动的文件>   # 没有 lint 脚本；只格式化自己改的文件（部分旧文件并非 prettier 格式）
```

本地整站：`docker compose up -d --build --wait --wait-timeout 180`（首次用 `scripts/deploy.ps1` 或 `scripts/deploy.sh`，会先生成带随机凭据的 `.env`）。前台 http://localhost:8080，后台 `/admin`。Compose 只暴露 Nginx 端口，API（3000）和数据库不对宿主机开放，所以 `npm run dev --workspace @bobo/web` 的 `/api` 代理只有在宿主机另跑 API 时才能用。

集成测试直接请求正在运行的站点（`.env` 中的 `APP_ORIGIN`），从根目录 `.env` 读取管理员凭据，会创建并清理带「测试」标记的临时数据：

- `npm run test:accounts`：账号与成员权限。
- `npm run test:memories`：「那年今日」接口（用 2088-2090 年的临时故事，不受真实数据和存储模式影响）。
- `npm run test:growth`：成长曲线接口（用 2001 年的临时记录，结束时恢复原公开设置）。
- `npm run test:health`：健康档案接口（用 2002 年的临时记录，结束时清理）。
- `npm run test:tags`：标签管理的权限、固定标签新增、重命名合并、精确删除、全站同步、保留其他内容与操作记录（临时记录测试后清理）。
- `npm run test:ai`：写作助手与聊天的权限、按账号同意、会话隔离、输入校验，以及未配置密钥时功能关闭且不影响网站；不消耗模型调用。
- `npm run test:video`：视频上传与转码，需要宿主机 ffmpeg 带 libx265；不依赖存储模式。
- `npm run test:integration`：媒体处理、私密隔离、相册等；需要宿主机有 ffmpeg。它假设 `STORAGE_DRIVER=local`（直接调用本地上传接口、校验本地签名 token），OSS 模式下会中途失败。
- `npm run test:oss`：`STORAGE_DRIVER=oss` 时的真实 Bucket 联调。
- `tests/persistence.mjs`：先跑 `node tests/integration.mjs --keep`，重建容器后运行，加 `--cleanup` 清理。
- `tests/failure-paths.mjs`：启动独立的 Compose 项目 `bobo-failure-test`，验证错误配置时服务拒绝启动。

所有非 GET/HEAD/OPTIONS 请求必须带 `Origin: <APP_ORIGIN>`，否则 API 返回 403，手写脚本时注意。

## 后端架构（apps/api/src）

- **`main.ts` 集中了整个 HTTP 层**：`PublicController`（`/api`）、带 `AdminGuard` 的 `AdminController`（`/api/admin`）、负责组装响应的 `Content` 服务、全局异常过滤器（ZodError → 400，Prisma `P2025` → 404，其余 → 500 并返回通用中文提示），以及 `main()` 里的全局中间件：helmet、按真实 IP 的登录限流（`trust proxy` = 1，依赖 Nginx 覆盖 `X-Forwarded-For`）、1mb JSON 上限、Origin 校验、`Cache-Control: no-store`。
- **校验**：用 `validation.ts` 中的 zod schema 在处理函数内 `.parse()`，不使用 Nest pipes。`config()` 每次调用都会重新校验环境变量，缺项直接抛错。
- **会话**：cookie `bobo_session` 存随机 token，数据库 `Session.id` 存它的 HMAC（`sign()`），有效期 7 天。
- **密码**：`PUT /api/auth/password` 修改自己的密码（校验当前密码，保留当前会话、删除其他会话，有独立的失败次数限流）；`PUT /api/admin/accounts/:id/password` 由 owner 重置成员密码（删除该成员全部会话，不能用于 owner）。owner 忘记密码时，在服务器执行 `docker compose exec api node dist/reset-password.js <用户名>`（`src/reset-password.ts`）生成随机密码。
- **角色**：`owner`（家庭管理员）和 `member`。
  - 权限辅助函数：`owner(req)`、`editableEntry(req, id)`、`editableMedia(req, id)`。
  - 成员只能修改 `authorId` 等于自己的记录及其媒体；家庭账号管理和操作记录查看只有 owner 能用。
  - 站点资料与页面封面、站点图片、相册、成长曲线、健康档案所有成员都能改，每次成功修改后调用 `main.ts` 的 `audit()` 写入 `AuditLog`（`actorName` 保存当时的显示名，`summary` 为中文描述）。新增这类共享内容的写接口时，也要记录操作；`GET /api/admin/audit-logs` 仅 owner，前端显示在「家庭账号」页。
  - `authorId` 取创建者，之后不再变更（owner 代为发布也不改署名）。
  - 前端 `Admin.tsx` 的 `UserContext` + `canEdit` 按同样规则隐藏入口，两边要同步修改。
- **公开可见性**：统一使用 `validation.ts` 的 `visible`（`status: "published"` 且 `visibility: "public"`）。公开媒体还要求 `state: "ready"` 且 `attached: true`（记录带着该媒体保存后才置为 attached，所以新上传的媒体在保存前不会公开）。相册和页面封面在**读取时**过滤，故事改为私密后会自动从公开相册和封面中消失，写入时不做级联处理。
- **页面封面**：`Profile.coverMediaId`（首页）和 `aboutCoverMediaId`（关于页）可指向公开故事照片，或 `entryId` 为 null 的「站点图片」（后台上传，所有成员可用，只能是图片）。可选范围由 `validation.ts` 的 `coverChoice` 定义。站点图片只在被选为封面时公开（`MediaService.accessible`），不出现在 `/admin/media` 中，也不能加入相册。未设置封面时前台显示 `shared.tsx` 的 `BoboIllustration`，站点不打包真实照片。插画源文件是 `apps/web/src/assets/illustration.png`（2.4MB），页面引用的是用 sharp 缩放到 960×960 的 WebP（质量 86，约 110KB）`illustration.webp`；更换插画时重新生成 WebP，不要直接引用 PNG。
- **日期**：`occurredOn`、生日等都是 `YYYY-MM-DD` 字符串而不是 DateTime；「今天」按 Asia/Shanghai 计算。排序固定为 `occurredOn desc, id desc`，上一篇/下一篇的查询依赖同一排序。
- **标签管理**：`Tag` 保存可复用标签目录，记录中的实际标签仍存于 `Entry.tags`；保存记录时会自动补充目录。`GET /api/admin/tags` 返回目录与记录标签的并集及使用篇数，家人均可读取；`POST`、`PUT`、`DELETE /api/admin/tags` 仅 owner 可新增、重命名合并或全站删除。重命名会同步全部记录并去重，删除通过参数化 SQL `array_remove` 精确移除同名标签，变更在同一事务中写操作记录。编辑页管理弹窗同步当前表单与暂存草稿，防止保存时重新带回旧标签。
- **那年今日**：`GET /api/on-this-day?date=`（`Content.onThisDay`，`date` 可选、默认上海时区今天）返回同月同日的往年公开故事（`yearsAgo`）和一年内同日的故事（`monthsAgo`），往年优先，最多 6 条。
- **成长曲线**：`Measurement` 表（`measuredOn` 唯一，`weight` kg / `height` cm 可空、至少一项，`note` 只给家人看）。管理接口 `/api/admin/growth`（增删改）和 `/api/admin/growth-visibility` 所有成员可用并记录操作；`GET /api/growth` 只在 `Profile.growthPublic` 为 true 时返回数据，且不含 `id`/`note`。前端 `shared.tsx` 的 `GrowthChart`（体重、肩高分成两张图，不用双 y 轴；线色 `#5f8c46` 经 dataviz 校验；宽度随容器，悬停与方向键查看）和 `GrowthTable`（数据表）在关于页与后台共用。
- **健康档案**：`HealthRecord` 表记录 `vaccine` / `deworming` / `checkup` / `grooming`、本次日期、可空的下次时间和备注。仅提供受 `AdminGuard` 保护的 `/api/admin/health-records` 增删改查，没有公开接口；所有成员可维护并记录操作。前端以已到期、今天、7 天内、以后分级提醒，侧栏显示需要关注的数量。
- **AI 写作助手**：`ai.ts` 的 `AiService`，编辑页「AI 帮我写」用。**可选功能**：`config().ai` 在没有 `DEEPSEEK_API_KEY` 时返回 `null`，接口报「还没有配置」而整站照常运行——服务器的 `.env` 不会被 `update-server.sh` 改写，所以新增的 AI 配置项一律要可选，不能写成必需项。默认模型 `deepseek-flash`（支持图片输入、Tool Calls 和 `json_object`），`AI_MODEL` / `AI_BASE_URL` 可覆盖，后者也是测试打桩的钩子。接口 `/api/admin/ai/status`、`/consent`、`/draft` 所有家人可用，同意状态存在 `Admin.aiConsentAt`。照片由前端只传 `mediaId`、服务端读 `<key>.thumb` 转 base64（绕开 1mb 的 JSON 上限，一次最多 4 张）。`json_object` 没有 schema 强制且官方承认可能返回空内容，所以用 `validation.ts` 的 `aiDraftOutput` 校验并自动重试一次，仍失败才报错；出站调用一律 `AbortSignal.timeout(90s)`（Nginx `proxy_read_timeout` 是 180s），失败按类型抛 `HttpException` 子类，否则全局过滤器会统一变成「服务暂时不可用」。配额按账号每天 20 次，记在 `AiUsage` 表并按上海时区计算，不能沿用 `failedAttempts`（那个按 IP 且只统计失败）。生成结果只回传给编辑器，应用时走 `change()`，不自动保存。
- **AI 聊天**：`ai.ts` 的 `chat()` 加 `retriever.ts`。工具的 JSON Schema 和校验用的 zod schema **写在一起**（`retriever.ts`），因为两者必须同步；这是 validation.ts 集中放 schema 之外的唯一例外。只开放故事检索、故事详情、成长、健康、资料和那年今日六个只读工具，**账号、会话、密码和操作记录不在工具面上**，单元测试会断言这一点。工具参数是模型输出，和请求体一样先 `.parse()` 再查库；工具报错（未知工具、参数非法）作为 `{ error }` 回传给模型继续对话，不让整个请求失败。每问最多 `ROUNDS`（4）轮，**最后一轮不带 tools**，强制模型给出答案；仍然没有文字时回落到一句固定的话。回答附带的来源是这一轮工具真正取到的故事（去重后最多 6 条），前端按 `public` 决定跳 `/stories/:id` 还是 `/admin/entries/:id`，故事被删也只是没有链接。历史只回放最近 `HISTORY`（12）条原文，不做摘要。会话标题取第一句提问的前 20 字，不额外调模型。
- **聊天的账号隔离**：`AiConversation` / `AiMessage` 按 `adminId` 过滤，所有读写都先走 `own()`，别人的会话一律 404（不是 403，避免确认存在性）。删除账号会级联删除其会话。
- **前台聊天入口**：会话 cookie 是 HttpOnly，前台读不到，所以登录时额外下发 `bobo_family=1`（非 HttpOnly、同寿命），登出时清除，`Public.tsx` 的 `signedIn()` 同步判断，零额外请求、零闪烁。**它只控制一个按钮**，接口仍由 `AdminGuard` 把关。聊天面板 `Chat.tsx` 懒加载且不引入 Ant Design（前台包里没有 AntD，引入会拖慢访客首屏）；当前会话 id 存 sessionStorage，切页不中断。悬浮头像现在复用 `BoboIllustration` 占位，换成正式素材时改 `.chatBubble` / `.chatAvatar` 里的图片即可。

### 媒体管线（media.ts）

1. **授权**：`authorize` 创建 `Media` 行，状态为 `pending`，并返回上传地址。`local` 驱动是 `PUT /api/admin/media/:id/upload`（写入 `<id>.staging`）；`oss` 驱动是预签名 PUT，目标为 `<前缀>staging/<id>`。
2. **处理**：`complete` 先用 `updateMany` 把状态从 `pending` 改为 `processing` 作为并发锁，然后在 `process()` 中回读 staging 文件并按真实内容校验：图片用 sharp（JPEG/PNG/WebP/GIF）。多帧的 GIF 和 WebP 会保留动画：按 `meta.pages` 判断，用 `{ animated: true }` 读取并整段缩放，`宽 × 高 × 帧数` 超过 6000 万像素时报「动图太大」；动图输出是一条竖直帧带，所以存库的高度取 `info.pageHeight`，不是 `info.height`。视频（MP4 或 iPhone 的 MOV，≤180 秒）用 ffprobe 检查，8 位 H.264 + AAC 的 MP4 原样保留，其他格式在 `transcode()` 中转为 H.264 MP4（长边 ≤1920、≤30fps，HLG/PQ 用 zscale+tonemap 转 SDR，失败再退回不做色调映射；输出色彩标签要用 `setparams` 写到帧上，编码器参数不生效）。转码通过 `transcoding` 队列串行执行。
3. **写入**：生成 `<key>.original`（视频一律为 MP4，`mime`/`size` 更新为最终文件）、`<key>.thumb`（640px WebP）、`<key>.display`（仅图片，2000px WebP），状态改为 `ready`；失败则回到 `pending`，错误信息记在内存的 `failures` 中。
   - `complete` 最多等待 `MEDIA_WAIT_SECONDS`（默认 20，未在 Compose 中暴露，测试时可用 override 设为 0）；超时则返回 `state: "processing"`，处理继续在后台进行，前端 `waitForMedia()` 轮询 `GET /api/admin/media/:id/status`。
4. **单实例假设**：API 启动时会把残留的 `uploading`/`processing` 重置为 `pending`。
5. **读取**：`present()` 为 `url`/`thumb` 签发地址（local 用 HMAC token，由 `/api/media/:id/file/:variant` 提供；oss 用 V4 签名 GET）。地址按 `URL_WINDOW`（1 小时）的整点窗口签发而不是「从现在起 N 分钟」，同一窗口内地址逐字节相同，浏览器才能命中缓存；有效期到下一个窗口结束，即 1～2 小时。响应统一带 `private, max-age=3600, immutable`：local 在 `serve()` 里设置（覆盖全局 `no-store`，`sendFile` 不会覆盖已有的该头），oss 把 `response-cache-control` 作为签名 query 覆盖对象自带的 `max-age=0`，因此不必改已有对象的元数据。ali-oss 的 V4 签名带当前秒，所以 OSS 地址在 `MediaService.signed` 中按窗口缓存（依赖单实例假设）。代价：故事改为私密后，已签发地址最长约 2 小时才失效。前端必须通过 `shared.tsx` 的 `MediaImage` / `MediaVideo` 渲染媒体，它们在地址过期时会调用一次 `/api/media/:id/access` 换新地址。
6. **切换存储**：更换 `STORAGE_DRIVER` 不会迁移已有文件。
7. **OSS 前缀**：Bucket 与其他项目共用，本站所有对象都在 `OSS_PREFIX`（默认 `bobo`，`config().ossPrefix` 规范化为 `bobo/`）下。OSS 调用一律通过 `MediaService.objectKey()` 加前缀，不要直接拼对象名。旧版本放在根目录的对象用 `scripts/move-oss-objects.cjs` 迁移（`node - copy|delete` 经 stdin 在 api 容器内运行，旧镜像也能用）。

### 数据库与初始化

Schema 在 `apps/api/prisma/schema.prisma`，迁移是已提交的 SQL 目录。迁移只会在 `init` 容器里通过 `prisma migrate deploy` 应用（`container-init.ts`，遇到 `P1001` 会重试）。之后 `init.ts` 仅在库里还没有任何管理员时，用 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 创建首个 owner；修改 `.env` 中的密码不会重置已有账号。改 schema 必须新增迁移目录。

## 前端架构（apps/web/src）

- `App.tsx` 懒加载两套界面：`/admin/*` → `Admin.tsx`（Ant Design，`ConfigProvider` 自定义主题），其余路由 → `Public.tsx`。样式集中在 `App.module.css`。
- `lib.ts`：类型定义、`api()`（失败时抛出带服务端 `message` 的 Error，界面直接展示）、日期与年龄计算。首页纪念日由纯函数 `anniversaries(profile, today)` 在前端计算，满 N 个月的日子与 `age()` 的判定一致（月份没有对应日期时顺延到下月 1 日）；`tests/unit.test.mjs` 会转译 `lib.ts` 直接测试这些函数。`shared.tsx`：`useData(path)` 数据钩子、`ProfileContext`、`StoryView`、`Lightbox`、`useUnsaved`。图片预览按需加载 `ImagePreview.tsx`，使用 Ant Design `Image.PreviewGroup` 提供多图切换、缩放、拖动、旋转、翻转和复位；视频继续使用独立的原生播放器 Lightbox。
- 正文不渲染 HTML 或 Markdown，`BodyText` 只识别以 `## `、`- `、`> ` 开头的行。
- `EntryEditor` 把未保存的修改自动写入 `localStorage`（键 `bobo:draft:<entryId>`，`draftOf` 决定保存哪些字段）。打开记录时若草稿与服务器内容不同，提示恢复或丢弃；保存、丢弃、删除记录时清除。给记录新增可编辑字段时，要同步加进 `draftOf`。

## 部署与发布

- **Compose 链路**：`db` → `init`（一次性，正常退出）→ `api`（健康检查 `/api/health`）→ `web`（Nginx 提供 SPA 并反代 `/api`，只发布 `HTTP_PORT`，默认 8080）。
- **HTTPS**：`compose.https.yaml` 叠加 443 端口、证书挂载和 `deploy/nginx.https.conf`，通过 `.env` 的 `COMPOSE_FILE` 启用（Linux 分隔符 `:`，Windows `;`）。`deploy/nginx.conf`（打进 web 镜像）和 `deploy/nginx.https.conf`（运行时挂载）内容需要同步修改。
- **生产发布**：推送到 `main` 后，阿里云 ACR（上海个人版，命名空间 `bobo-api`）的原生构建规则会分别用 `Dockerfile.api`、`Dockerfile.web` 构建 `bobo-api:latest` 和 `bobo-web:latest`。两个都构建成功后，在服务器 `/opt/bobo` 执行 `bash scripts/update-server.sh`：先备份，带重试地 `git pull`，然后重新执行拉取到的新版脚本，保留 `COMPOSE_FILE` 并叠加 `compose.registry.yaml`，拉取镜像后 `up --no-build`。
- **服务器限制**：服务器访问不了 Docker Hub，不能在服务器上运行 `deploy.sh` 或 `docker compose up --build`。
- **GitHub Actions**：`.github/workflows/publish-images.yml` 只是手动备用（GitHub 运行器连中国区 ACR 会超时）；ACR 个人版不接受 OCI attestation，所以其中 `provenance`/`sbom` 为 false。
- 完整配置与排错记录见 `docs/ubuntu-acr-deployment.md`；`docs/verification.md` 记录实际验收结果。
- 两个 Dockerfile 的基础镜像都固定了摘要；`.sh` 脚本必须保持 LF（见 `.gitattributes`）。
- **备份**：`scripts/backup.*` 用 `pg_dump` 导出到 `backups/`，`restore.*` 恢复到独立的 `bobo_restore` 库。数据库备份不含媒体文件。`docker compose down -v` 会删除数据库和媒体卷。
  - `backup.sh` 先写 `.partial` 再改名；保留最近 `BACKUP_KEEP`（默认 14）份；OSS 模式下通过 `docker compose exec -T api node dist/backup-upload.js <名称> < 文件` 把备份流式上传到 Bucket 的 `<前缀>backups/`（`src/backup-upload.ts`），上传失败只警告、不中断更新。
  - 服务器每日备份由 `scripts/install-backup-cron.sh` 写入 crontab（标记注释 `# bobo daily backup`，可重复执行）。

## 工作约定

- 每完成并验证一项改动，就提交并推送到 `main`（提交信息用 `feat:` / `fix:` / `chore:` / `docs:` / `ci:` 前缀）。每次推送都会触发 ACR 构建，所以一项完整改动推送一次，不要推半成品。
- 用户可见行为有变化时，同步更新 README 中对应的中文说明。
