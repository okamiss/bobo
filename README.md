# 啵啵的小日子

雪纳瑞啵啵的响应式成长手账。React + Vite（后台使用 Ant Design）/ NestJS / PostgreSQL + Prisma / OSS，前后端分离，全部服务通过 Docker Compose 运行。

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
2. 家庭管理员可进入「家庭账号」，为家人创建独立用户名、显示名字和初始密码。家庭成员可以查看全部记录，但只能编辑、删除自己记录的故事及其照片。「成长曲线」「健康档案」「记忆相册」「啵啵与网站」（含页面封面）所有家人都可以编辑，每次修改都会记下是谁、什么时间、改了什么，家庭管理员可在「家庭账号」页面底部的「操作记录」中查看最近 200 条；「家庭账号」只有家庭管理员可以使用。每个人都可以点击后台左下角（手机端为顶部钥匙图标）的「修改密码」，修改后其他设备上的登录会退出；家人忘记密码时，家庭管理员可在「家庭账号」中为其重置密码。
3. 点击「写下新的一天」会打开一张空白页，这时还没有生成任何记录：填了标题等内容点「保存记录」，或者先添加照片，才会真正存进手账；中途离开不会留下空记录。标题不填会提示起个名字。点「保存记录」后会自动回到记录列表，并在顶部显示「已保存这一天。」；如果保存期间你还在继续输入，则留在编辑页不打断你。填写标题、发生日期、正文，支持小标题 `## `、列表 `- `、引用 `> `；HTML 始终按文字显示。编辑中的修改会自动暂存在当前浏览器，刷新、误关页面或手机切换应用后再次打开这篇记录，可以选择恢复或丢弃；暂存不会同步到其他设备，点击「保存记录」后才真正保存。
4. 添加照片与短视频，等待进度和校验完成；调整顺序、说明和封面。每张照片下方可以向前移、向后移，照片多的时候用最左边的「放到最前」一步移到首位。写不出来时可以点正文工具栏右侧的「AI 帮我写」：它会看这篇已上传的前 4 张照片、日期和你填的重点，给出 3 个标题、一段正文、几个标签和每张照片的说明。生成的内容需要你逐项点击应用，再手动保存，AI 不会自动改动任何记录。首次使用会说明哪些内容会发送出去，同意一次即可，同意状态按账号单独保存。每个账号每天最多 20 次；没有配置 AI 服务时这个按钮会提示未配置，网站其余功能不受影响。
5. 选择草稿或已发布，再选择公开或不公开，点击保存。发布时会自动记下当时的时间：同一天发好几篇时，前台和后台都按发布时间从新到旧排列，日期旁边显示时分。补录旧日期的记录（发生日期不是发布当天）只显示日期，不会安上发布当天的钟点。不公开的故事和相册（以及所有草稿）只有家庭账号能在后台看到，公开的已发布内容所有人都能看到。公开页面显示记录人的名字，即使由家庭管理员代为修改或发布也不会改变；里程碑和首页精选独立控制；勾选「首页精选」的故事会出现在首页「偏爱的这一页」，按日期从新到旧最多显示 3 篇；点右上角「全部看看」进入成长手账，可用「只看首页精选」筛选出全部精选，「只看值得纪念的里程碑」同理，两者可以叠加。
6. 创建相册，从已经上传的媒体中挑选、排序。删除相册不删除原故事或文件。照片多时，「从媒体库添加」和封面选择的照片墙都在固定高度的框里滚动，不会把页面撑得很长，标题旁会显示可选数量。
   家庭管理员可通过后台「管理标签」或编辑页标签框下的同名按钮，新增固定标签、重命名或删除标签。固定标签即使尚未用于记录，也会在发布页供直接选择；重命名和删除会同步所有记录（含草稿和仅家人可见的记录），正文和照片保留，改成已有名称时会合并并去重，操作会写入操作记录。普通家庭成员仍可在自己的记录中选择或自定义标签，自定义标签随记录保存后会进入标签库。
7. 在「啵啵与网站」分别设置首页封面和关于页封面：可以直接上传 JPG / PNG / WebP / GIF 图片，也可以选择公开已发布故事中的照片。所选故事改为不公开后，对应封面自动隐藏；上传的图片只在被选为封面时对访客可见，也不能加入相册。
8. 填写生日和到家日期后，首页会显示「啵啵的纪念日」：接下来 3 个值得庆祝的日子及倒计时，包括满月（第一年每月一次）、生日、到家第 100 / 200 / 300 / 500 / 1000 天和到家周年，当天显示「就是今天」。
9. 首页「那年今日」展示往年同一天的公开故事；刚开始记录的第一年，也会展示过去 11 个月里同一天的故事（标注「N 个月前的今天」）。没有符合条件的故事时不显示这一栏。
10. 在后台「成长曲线」记录体重（kg，保留两位小数）和肩高（cm，保留一位小数），每天一条，至少填一项，可以加只有家人能看到的备注。页面画出体重和肩高两张曲线（悬停或用方向键查看每次记录），并附完整数据表。勾选「在关于啵啵页面公开」后，访客能在「关于啵啵」看到曲线和数据表，但看不到备注；默认不公开。
11. 在后台「健康档案」记录疫苗、驱虫、体检和美容，可填写本次日期、下次时间与备注。下次时间已到期、当天或进入 7 天内时，后台会突出提醒并在侧栏显示待关注数量。健康档案没有公开页面或公开接口，只有登录后的家庭账号能查看和维护。

初始数据库不包含演示记录。未设置封面时，首页和关于页显示默认的啵啵插画；首页「记忆相册」区域展示公开相册的封面，没有公开相册时同样显示插画。生日与到家日期未填写时不显示虚构天数。界面同时支持 375 / 390 / 430px 手机、768px 平板以及 1280 / 1440 / 1920px 桌面宽度；手机端使用底部导航，后台表单和媒体编辑区会自动改为触控友好的单栏布局。查看大图时可切换多图、自由缩放、拖动、旋转、翻转和复位；视频保留原生播放控件。

## 媒体与存储

图片：JPG / PNG / WebP / GIF，最多 20MB，最多 6000 万解码像素；格式按文件实际内容判断，扩展名写错（例如内容是 JPG 却叫 `.png`）也能正常上传。GIF 和多帧 WebP 会保留动画，网页上看到的动图是转换后的 WebP，通常比原 GIF 小很多；动图的像素上限按「宽 × 高 × 帧数」计算，超出时会提示缩小尺寸或减少帧数。视频：MP4 或 MOV，最多 500MB / 180 秒。不支持 HEIC 图片（iPhone 在网页中选择照片时一般会自动转成 JPG）。

后端实际检查文件内容；图片生成 640px 缩略图和最长边 2000px 展示图，自动校正 EXIF 方向并移除展示图元数据。视频使用容器内 ffprobe 核验、ffmpeg 生成首帧封面，不自动播放，支持 HTTP Range 播放。浏览器可直接播放的 MP4（8 位 H.264 视频、AAC 音轨）原样保存；其他视频，例如 iPhone 默认拍摄的 HEVC / HDR MOV，会转成 H.264 MP4：长边最多 1920px、帧率最多 30fps，竖拍方向写入画面，HDR 色调映射为普通亮度。转换较慢时在后台继续，后台页面会显示「正在转换视频格式」，可以先继续写；多个视频依次转换，避免占满服务器 CPU。

`STORAGE_DRIVER=local` 将文件存入 Docker 命名卷；`STORAGE_DRIVER=oss` 使用私有 OSS Bucket。切换驱动不会自动迁移既有文件，已有本地记录时需先迁移同名对象再切换。

### OSS 配置

在 `.env` 设置以下值，之后重新执行部署命令：

```dotenv
STORAGE_DRIVER=oss
OSS_REGION=oss-cn-hangzhou
OSS_BUCKET=your-private-bucket
OSS_ACCESS_KEY_ID=your-ram-key
OSS_ACCESS_KEY_SECRET=your-ram-secret
# 可选：本站文件在 Bucket 中的目录，默认 bobo；留空表示 Bucket 根目录
# OSS_PREFIX=bobo
```

本站的所有 OSS 对象（原图、展示图、缩略图、上传中转 `staging/`、数据库备份 `backups/`）都放在 `OSS_PREFIX` 目录下（默认 `bobo/`），可以和其他项目共用一个 Bucket。

#### 把旧版本放在 Bucket 根目录的文件迁入 `bobo/`

更早的版本把文件直接放在 Bucket 根目录。`scripts/move-oss-objects.cjs` 只处理当前数据库引用的媒体文件和根目录 `backups/bobo-*.dump`，不会碰同一 Bucket 中其他项目的文件；`copy` 只复制、可重复执行，`delete` 只在 `bobo/` 中的副本与根目录文件 ETag 和大小都一致时才删除根目录文件。服务器按以下顺序执行，网站全程可以正常访问：

```bash
cd /opt/bobo && git pull --ff-only
docker compose exec -T api node - copy < scripts/move-oss-objects.cjs   # 旧版本仍在运行，先复制
bash scripts/update-server.sh                                           # 切换到读取 bobo/ 的新版本
docker compose exec -T api node - copy < scripts/move-oss-objects.cjs   # 补上期间新上传的文件
```

打开网站确认图片和视频都正常后，再删除根目录旧文件：

```bash
docker compose exec -T api node - delete < scripts/move-oss-objects.cjs
```

同一个 Bucket 被多个环境（例如本地开发和服务器）共用时，每个环境都要执行 `copy`；等所有环境都更新到新版本后，再在各环境执行 `delete`。

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

流程：登录后获取 10 分钟 PUT 签名 → 浏览器上传到 `bobo/staging/` → 后端下载并校验 → 从校验后的文件生成最终对象 → 媒体标为可用。重新上传 staging 文件不能覆盖已验证展示文件。建议为 `bobo/staging/` 前缀配置 1 天生命周期，清除中断上传（如果以前给根目录 `staging/` 配过规则，改成新前缀）；不为正式文件配置自动删除。

公开接口只为公开已发布故事签发读取地址。地址按整点小时签发：同一小时内同一张图片的地址完全相同，浏览器因此可以直接用缓存，不必每次打开页面都重新下载全部缩略图；地址在下一个整点结束时失效，所以实际有效期是 1～2 小时。记录改为不公开后立即从公开页面消失，也不再签发新地址，但此前已经取得的地址最长还能再用约 2 小时。这是为了加载速度做的取舍，若更看重即时失效，可调小 `apps/api/src/media.ts` 中的 `URL_WINDOW`。页面停留较久时，图片和视频遇到过期地址会自动重新获取一次。相册设为公开也不能公开原故事中不公开的媒体。图片原片不对匿名访客提供下载。

## AI 写作助手与聊天（可选）

不配置也能正常使用网站，只是编辑页的「AI 帮我写」和前台的啵啵聊天会提示未配置（访客本来就看不到聊天入口）。要启用，在 `.env` 中填写密钥后重新部署：

```dotenv
DEEPSEEK_API_KEY=sk-your-key
# 可选：默认 deepseek-flash（支持看图），换模型不需要重新构建镜像
# AI_MODEL=deepseek-flash
# 可选：改成任意兼容 OpenAI 格式的地址，默认 https://api.deepseek.com
# AI_BASE_URL=https://api.deepseek.com
```

登录后，前台每个页面右下角会出现一个啵啵头像（访客看不到）。点开就能用啵啵的口吻问家里的事，例如「我上次剪毛是什么时候」「我最近胖了吗」「去年今天我在干嘛」。它会先去翻手账里的故事、成长记录和健康档案再回答，答案下方列出翻过的记录，点进去就能看原文（不公开的故事会跳到后台）。查不到就直说不知道，不会编。健康问题只复述记录和提醒，不做诊断、不推荐用药。

聊天记录按账号分开：家人之间看不到彼此聊过什么，可以新建、切换、删除单条或清空全部。切换页面不会中断当前对话。每个账号每天可聊的句数由家庭管理员设置，默认 50 句。

服务器上的 `.env` 不会被更新脚本改写，升级后需要自己补上这一行再执行 `bash scripts/update-server.sh`；没补也不会影响网站，只是功能保持关闭。

发送给模型的内容：写作助手会发送这篇记录的日期与类型、你填写的重点，以及选中照片的 640px 缩略图（最多 4 张，由服务端读取后内嵌发送，不会暴露 OSS 地址）；聊天会发送你的问题、最近 12 条对话，以及为回答而查到的故事片段、成长和健康记录。两者都不发送账号、密码、会话和整个数据库，聊天也读不到家庭账号和操作记录。每个账号首次使用会看到这段说明并需要同意一次，同意状态按账号单独保存。

额度与失败处理：默认每个账号每天 20 次写作、50 句聊天（按上海时区零点重置），用量、耗时和 token 数记在 `AiUsage` 表。**家庭管理员可在后台「家庭账号」页的「AI 额度」里调整这两个数字**，保存后立刻对所有家人生效、不需要重启，同一面板还会列出今天每个人各用了多少；填 0 表示关闭对应功能，修改会写入操作记录。普通成员看不到也改不了这一栏。这只是防止意外用量的上限，真正的花费上限是 AI 服务账户里的余额。模型超时、限流、余额不足或返回的内容不可用时，都会给出对应的中文提示并可重试，不影响已经写好的内容；生成结果必须逐项点击应用，再手动保存，AI 不会自动修改或发布任何记录。

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

备份保存在 `backups/`，格式为 PostgreSQL custom dump。`backup.sh` 默认只保留最近 14 份本地备份（用 `BACKUP_KEEP=30 bash scripts/backup.sh` 调整）；使用 OSS 存储时还会把同一份备份上传到私有 Bucket 的 `bobo/backups/` 目录，上传失败只提示警告，本地备份照常保留。`scripts/update-server.sh` 更新前会自动执行一次。

在服务器上安装每天自动备份（默认按服务器时区每天 03:30，可重复执行，不会重复添加）：

```bash
cd /opt/bobo && bash scripts/install-backup-cron.sh
# 自定义时间：BACKUP_SCHEDULE="15 4 * * *" bash scripts/install-backup-cron.sh
```

运行记录写入 `backups/cron.log`，可用 `crontab -l` 查看任务。OSS 上的备份不会被脚本自动清理，建议在 Bucket 的生命周期规则中为 `bobo/backups/` 前缀设置过期时间（例如 90 天）。服务器故障时，可从 OSS 控制台下载 `bobo/backups/` 中的备份文件，放到新服务器的 `backups/` 目录后按下面的方式恢复。

替换代码后运行原部署命令，会应用新迁移；不会自动重置数据库或覆盖已有管理员密码。修改 `ADMIN_PASSWORD` 不是已有账号的密码重置方式。家庭管理员自己忘记密码时，在服务器项目目录执行 `docker compose exec api node dist/reset-password.js <用户名>`，终端会显示一个随机新密码，并让该账号所有设备退出登录；登录后请立即在「修改密码」中更换。版本回退需考虑迁移兼容性，不保证旧代码能读取新数据库结构。

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
npm run test:accounts
npm run test:memories
npm run test:growth
npm run test:health
npm run test:tags
npm run test:video
npm run test:integration
```

集成测试要求 Docker 网站运行、项目根目录存在对应 `.env`，宿主机测试工具需 Node.js 和 ffmpeg；部署本身不要求宿主机安装这些工具。测试创建明确标注的临时记录、图片和视频，在完成后清理。不要同时在测试中编辑测试记录。

`tests/unit.test.mjs` 覆盖有效日期、年龄与天数、纪念日计算（含月末与闰日）、健康提醒、成长曲线坐标刻度、上传边界、密码验证、OSS 配置失败及目录前缀；`tests/memories.integration.mjs` 覆盖「那年今日」的日期匹配、排序与私密草稿排除，不依赖存储模式；`tests/growth.integration.mjs` 覆盖成长记录的权限、数值校验与取整、每天一条、公开开关和隐藏备注；`tests/health.integration.mjs` 覆盖健康档案的后台隔离、校验、家人增删改与操作记录；`tests/tags.integration.mjs` 覆盖固定标签新增、重命名合并、精确删除、管理权限、公开/私密/草稿同步、正文署名保留及操作记录；`tests/video.integration.mjs` 用宿主机 ffmpeg（需 libx265）生成 iPhone 式 HEVC HDR MOV，验证转码、旋转、帧率、兼容 MP4 原样保留及各类拒绝提示，不依赖存储模式；`tests/accounts.integration.mjs` 覆盖家庭账号创建、修改与重置密码、成员只能修改自己的记录、管理员专属设置、署名保留、停用和清理；`tests/integration.mjs` 覆盖登录、来源限制、真实图片视频处理、私密隔离、长正文保存、上一篇/下一篇顺序、页面封面上传与公开范围、相册复用与删除行为；`tests/oss.integration.mjs` 面向真实私有 Bucket 验证预签名上传、CORS、服务端处理、签名读取与自动清理。

项目结构：`apps/web` 为前台与后台界面，`apps/api` 为 NestJS 与 Prisma 迁移，`deploy` 为 Nginx 配置，`scripts` 为部署备份入口，`tests` 为验收测试。

## 使用阿里云 ACR 自动构建镜像

完整的真实 Ubuntu 部署过程、最终配置和错误对照表见 [`docs/ubuntu-acr-deployment.md`](docs/ubuntu-acr-deployment.md)。

服务器无法稳定访问 Docker Hub，且 GitHub 托管运行器无法连接中国区 ACR 时，让 ACR 绑定 GitHub 并自行构建镜像。这样服务器不再执行 Dockerfile，也不需要在本地打包镜像。

1. 在同一 ACR 命名空间下创建 `bobo-api` 和 `bobo-web` 两个私有仓库。
2. 为两个仓库绑定 GitHub 的 `main` 分支，构建上下文均为 `/`；`bobo-api` 使用 `Dockerfile.api`，`bobo-web` 使用 `Dockerfile.web`。开启代码变更自动构建，镜像版本填写 `latest`。
3. 在服务器 `.env` 中加入。地址必须从 ACR 实例的“访问凭证”页面复制；ECS 与 ACR 同地域时可使用控制台显示的 VPC 地址：

   ```dotenv
   ACR_REGISTRY=crpi-xxxx.cn-shanghai.personal.cr.aliyuncs.com
   ACR_NAMESPACE=your-namespace
   ```

4. 在服务器上登录一次 ACR：

   ```bash
   docker login crpi-xxxx.cn-shanghai.personal.cr.aliyuncs.com
   ```

GitHub Actions 的 `Publish application images` 仅保留为手动备用流程。日常发布由 ACR 仓库绑定 GitHub 后自动构建；确认 API 和 Web 的 `latest` 镜像都构建成功后，服务器更新只需：

```bash
cd /opt/bobo && bash scripts/update-server.sh
```

脚本依次执行：备份数据库 → `git pull`（GitHub 连接中断时自动重试）→ 从 ACR 拉取 API/Web 的 `latest` 镜像 → 执行迁移并等待所有服务健康。`.env` 中的 `COMPOSE_FILE`（例如 HTTPS 配置）会被保留，脚本只额外叠加 `compose.registry.yaml`。

首次切换时服务器上还没有这个脚本，先执行一次 `git pull --ff-only`。切换后服务器不要再运行 `deploy.sh`，它会在本机构建镜像并访问 Docker Hub。PostgreSQL 镜像仍来自 Docker Hub，已在服务器上的镜像会继续使用。

如果 GitHub Actions 在 ACR 登录步骤连续五次出现 `Get https://.../v2/: context deadline exceeded`，先在本地和服务器分别请求 `https://<ACR_REGISTRY>/v2/`。快速返回 `401 Unauthorized` 说明入口可达；连接超时说明公网实例地址或公网访问配置有误。若只有 GitHub 托管运行器超时，可改用 ACR 仓库自带的 GitHub 自动构建，并开启“海外机器构建”。

实际验收记录见 `docs/verification.md`。本地 Docker 成功不等于真实阿里云服务器或 OSS 已验收。
