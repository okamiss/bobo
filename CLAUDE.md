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
- `npm run test:integration`：媒体处理、私密隔离、相册等；需要宿主机有 ffmpeg。它假设 `STORAGE_DRIVER=local`（直接调用本地上传接口、校验本地签名 token），OSS 模式下会中途失败。
- `npm run test:oss`：`STORAGE_DRIVER=oss` 时的真实 Bucket 联调。
- `tests/persistence.mjs`：先跑 `node tests/integration.mjs --keep`，重建容器后运行，加 `--cleanup` 清理。
- `tests/failure-paths.mjs`：启动独立的 Compose 项目 `bobo-failure-test`，验证错误配置时服务拒绝启动。

所有非 GET/HEAD/OPTIONS 请求必须带 `Origin: <APP_ORIGIN>`，否则 API 返回 403，手写脚本时注意。

## 后端架构（apps/api/src）

- **`main.ts` 集中了整个 HTTP 层**：`PublicController`（`/api`）、带 `AdminGuard` 的 `AdminController`（`/api/admin`）、负责组装响应的 `Content` 服务、全局异常过滤器（ZodError → 400，Prisma `P2025` → 404，其余 → 500 并返回通用中文提示），以及 `main()` 里的全局中间件：helmet、按真实 IP 的登录限流（`trust proxy` = 1，依赖 Nginx 覆盖 `X-Forwarded-For`）、1mb JSON 上限、Origin 校验、`Cache-Control: no-store`。
- **校验**：用 `validation.ts` 中的 zod schema 在处理函数内 `.parse()`，不使用 Nest pipes。`config()` 每次调用都会重新校验环境变量，缺项直接抛错。
- **会话**：cookie `bobo_session` 存随机 token，数据库 `Session.id` 存它的 HMAC（`sign()`），有效期 7 天。
- **角色**：`owner`（家庭管理员）和 `member`。
  - 权限辅助函数：`owner(req)`、`editableEntry(req, id)`、`editableMedia(req, id)`。
  - 成员只能修改 `authorId` 等于自己的记录及其媒体；站点资料、相册、账号只有 owner 能改。
  - `authorId` 取创建者，之后不再变更（owner 代为发布也不改署名）。
  - 前端 `Admin.tsx` 的 `UserContext` + `canEdit` 按同样规则隐藏入口，两边要同步修改。
- **公开可见性**：统一使用 `validation.ts` 的 `visible`（`status: "published"` 且 `visibility: "public"`）。公开媒体还要求 `state: "ready"` 且 `attached: true`（记录带着该媒体保存后才置为 attached，所以新上传的媒体在保存前不会公开）。相册和首页封面在**读取时**过滤，故事改为私密后会自动从公开相册和封面中消失，写入时不做级联处理。
- **日期**：`occurredOn`、生日等都是 `YYYY-MM-DD` 字符串而不是 DateTime；「今天」按 Asia/Shanghai 计算。排序固定为 `occurredOn desc, id desc`，上一篇/下一篇的查询依赖同一排序。

### 媒体管线（media.ts）

1. **授权**：`authorize` 创建 `Media` 行，状态为 `pending`，并返回上传地址。`local` 驱动是 `PUT /api/admin/media/:id/upload`（写入 `<id>.staging`）；`oss` 驱动是预签名 PUT，目标为 `staging/<id>`。
2. **处理**：`complete` 先用 `updateMany` 把状态从 `pending` 改为 `processing` 作为并发锁，再回读 staging 文件并按真实内容校验：图片用 sharp（仅静态 JPEG/PNG/WebP），视频用 ffprobe（MP4/H.264，音轨可选 AAC，≤180 秒）。
3. **写入**：生成 `<key>.original`、`<key>.thumb`（640px WebP）、`<key>.display`（仅图片，2000px WebP），状态改为 `ready`；失败则回到 `pending`。
4. **单实例假设**：API 启动时会把残留的 `uploading`/`processing` 重置为 `pending`。
5. **读取**：`present()` 为 `url`/`thumb` 签发 5 分钟有效的地址（local 用 HMAC token，由 `/api/media/:id/file/:variant` 提供；oss 用 V4 签名 GET）。前端必须通过 `shared.tsx` 的 `MediaImage` / `MediaVideo` 渲染媒体，它们在地址过期时会调用一次 `/api/media/:id/access` 换新地址。
6. **切换存储**：更换 `STORAGE_DRIVER` 不会迁移已有文件。

### 数据库与初始化

Schema 在 `apps/api/prisma/schema.prisma`，迁移是已提交的 SQL 目录。迁移只会在 `init` 容器里通过 `prisma migrate deploy` 应用（`container-init.ts`，遇到 `P1001` 会重试）。之后 `init.ts` 仅在库里还没有任何管理员时，用 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 创建首个 owner；修改 `.env` 中的密码不会重置已有账号。改 schema 必须新增迁移目录。

## 前端架构（apps/web/src）

- `App.tsx` 懒加载两套界面：`/admin/*` → `Admin.tsx`（Ant Design，`ConfigProvider` 自定义主题），其余路由 → `Public.tsx`。样式集中在 `App.module.css`。
- `lib.ts`：类型定义、`api()`（失败时抛出带服务端 `message` 的 Error，界面直接展示）、日期与年龄计算。`shared.tsx`：`useData(path)` 数据钩子、`ProfileContext`、`StoryView`、`Lightbox`、`useUnsaved`。
- 正文不渲染 HTML 或 Markdown，`BodyText` 只识别以 `## `、`- `、`> ` 开头的行。

## 部署与发布

- **Compose 链路**：`db` → `init`（一次性，正常退出）→ `api`（健康检查 `/api/health`）→ `web`（Nginx 提供 SPA 并反代 `/api`，只发布 `HTTP_PORT`，默认 8080）。
- **HTTPS**：`compose.https.yaml` 叠加 443 端口、证书挂载和 `deploy/nginx.https.conf`，通过 `.env` 的 `COMPOSE_FILE` 启用（Linux 分隔符 `:`，Windows `;`）。`deploy/nginx.conf`（打进 web 镜像）和 `deploy/nginx.https.conf`（运行时挂载）内容需要同步修改。
- **生产发布**：推送到 `main` 后，阿里云 ACR（上海个人版，命名空间 `bobo-api`）的原生构建规则会分别用 `Dockerfile.api`、`Dockerfile.web` 构建 `bobo-api:latest` 和 `bobo-web:latest`。两个都构建成功后，在服务器 `/opt/bobo` 执行 `bash scripts/update-server.sh`：先备份，带重试地 `git pull`，然后重新执行拉取到的新版脚本，保留 `COMPOSE_FILE` 并叠加 `compose.registry.yaml`，拉取镜像后 `up --no-build`。
- **服务器限制**：服务器访问不了 Docker Hub，不能在服务器上运行 `deploy.sh` 或 `docker compose up --build`。
- **GitHub Actions**：`.github/workflows/publish-images.yml` 只是手动备用（GitHub 运行器连中国区 ACR 会超时）；ACR 个人版不接受 OCI attestation，所以其中 `provenance`/`sbom` 为 false。
- 完整配置与排错记录见 `docs/ubuntu-acr-deployment.md`；`docs/verification.md` 记录实际验收结果。
- 两个 Dockerfile 的基础镜像都固定了摘要；`.sh` 脚本必须保持 LF（见 `.gitattributes`）。
- **备份**：`scripts/backup.*` 用 `pg_dump` 导出到 `backups/`，`restore.*` 恢复到独立的 `bobo_restore` 库。数据库备份不含媒体文件。`docker compose down -v` 会删除数据库和媒体卷。

## 工作约定

- 每完成并验证一项改动，就提交并推送到 `main`（提交信息用 `feat:` / `fix:` / `chore:` / `docs:` / `ci:` 前缀）。每次推送都会触发 ACR 构建，所以一项完整改动推送一次，不要推半成品。
- 用户可见行为有变化时，同步更新 README 中对应的中文说明。
