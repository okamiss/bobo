# Ubuntu 与阿里云 ACR 部署记录

本文记录 2026-09-15 在真实 Ubuntu ECS 上发布“啵啵的小日子”时确认可用的方案，以及排查过程中遇到的问题。

## 最终采用的发布链路

服务器访问 Docker Hub 不稳定，因此不在 ECS 上构建业务镜像。最终链路为：

1. 开发机向 GitHub `main` 分支推送代码。
2. 阿里云 ACR 绑定 GitHub，并分别构建 API 和 Web 镜像。
3. 两个私有仓库都发布 `latest` 后，ECS 从 ACR 拉取成品镜像。
4. `scripts/update-server.sh` 先备份数据库和拉取代码，再拉取镜像、执行迁移并等待健康检查。

GitHub Actions 的 `Publish application images` 仅保留为手动备用工作流。实测 GitHub 托管运行器访问中国区 ACR 会超时，日常发布不使用这条链路。

## ACR 配置

实例地域为华东 2（上海）。同一命名空间可以包含多个仓库，最终配置为：

| 项目 | 值 |
|---|---|
| 命名空间 | `bobo-api` |
| API 仓库 | `bobo-api`，私有 |
| Web 仓库 | `bobo-web`，私有 |
| 代码仓库 | GitHub `okamiss/bobo` |
| 自动构建 | 开启 |
| 海外机器构建 | 开启 |
| 不使用缓存 | 关闭 |

不要使用默认的 `tags:release-v$version` 内置规则，它只响应匹配的 Git Tag，不响应 `main` 分支推送。两个仓库分别新增以下规则：

| 仓库 | 类型 | Branch/Tag | 上下文 | Dockerfile | 镜像版本 |
|---|---|---|---|---|---|
| `bobo-api` | Branch | `main` | `/` | `Dockerfile.api` | `latest` |
| `bobo-web` | Branch | `main` | `/` | `Dockerfile.web` | `latest` |

当前个人版控制台每条规则只允许填写一个固定镜像版本，因此使用 `latest`。规则创建前的历史提交不会补触发；首次可点击“立即构建”，或在规则保存后推送一个新提交。

## 服务器配置

`.env` 中的 `ACR_REGISTRY` 只能是 Registry 主机名，不包含协议、命名空间、仓库名或结尾斜杠：

```dotenv
ACR_REGISTRY=<从 ACR 访问凭证页复制的主机名>
ACR_NAMESPACE=bobo-api
IMAGE_TAG=latest
```

个人版实例存在新旧两种域名格式，不要根据示例手工拼接：

```text
registry.cn-shanghai.aliyuncs.com
crpi-<实例标识>.cn-shanghai.personal.cr.aliyuncs.com
```

必须从 ACR“访问凭证”页或仓库“基本信息”复制完整公网登录地址，再取主机名。实例标识中的小写 `l`、大写 `I` 和数字 `1` 容易看错；复制后可先验证 DNS：

```bash
getent hosts <ACR_REGISTRY>
curl -I --connect-timeout 10 https://<ACR_REGISTRY>/v2/
```

未登录时快速返回 `401 Unauthorized` 表示入口可达。`NXDOMAIN` 或 `no such host` 表示域名抄错；连接超时表示入口或网络不可达。

私有仓库需要在服务器登录一次。用户名和密码都以“访问凭证”页为准，密码是 Registry 固定密码：

```bash
docker login --username <ACR登录名> <ACR_REGISTRY>
```

登录成功后检查 Compose 展开的地址：

```bash
docker compose -f compose.yaml -f compose.registry.yaml config --images
```

结果必须包含以下结构，且不能出现 `your-namespace`：

```text
<ACR_REGISTRY>/bobo-api/bobo-api:latest
<ACR_REGISTRY>/bobo-api/bobo-web:latest
```

## 日常更新

本地提交并推送：

```bash
git push
```

在 ACR 中确认 `bobo-api` 和 `bobo-web` 两条构建都成功。两个仓库共用 `latest` 发布节奏，必须等两边都完成后再更新服务器，避免 API 和 Web 版本不一致。

服务器执行：

```bash
cd /opt/bobo
bash scripts/update-server.sh
```

更新脚本自动执行数据库备份、带重试的 `git pull --ff-only`、ACR 镜像拉取、数据库迁移和服务健康等待。不要运行 `docker compose down -v`，该参数会删除数据库和本地媒体命名卷。

更新后检查：

```bash
docker compose ps
curl -i http://127.0.0.1:8080/api/health
docker compose logs --tail 100 init api web
```

## 本次踩坑记录

| 报错或现象 | 原因 | 处理方式 |
|---|---|---|
| `registry-1.docker.io:443: i/o timeout` | ECS 无法稳定访问 Docker Hub | 改为 ACR 原生构建，ECS 只拉取业务镜像 |
| 静态 Web 构建也请求 Docker Hub | Web 镜像仍需要 Node 构建阶段和 Nginx 运行阶段 | 不在 ECS 执行 `docker compose up --build` |
| 镜像加速器返回基础镜像 `not found` | 加速器未缓存指定 Node/Nginx 版本 | 不依赖加速器完成业务构建 |
| GitHub Actions 推送时 `insufficient_scope` | 仓库未创建、命名空间不匹配或账号没有 Push 权限 | 在同一命名空间创建两个私有仓库并核对访问凭证 |
| GitHub Actions 登录 ACR 时 `context deadline exceeded` | GitHub 托管运行器无法稳定连接中国区 ACR | 使用 ACR 绑定 GitHub 的原生自动构建 |
| ACR 开启自动构建但没有记录 | 仍使用 `tags:release-v$version` 内置规则，或规则创建后没有新推送 | 新增 `branches:main` 规则并推送新提交或立即构建 |
| Compose 拉取 `your-namespace/...` | 服务器 `.env` 保留了模板值 | 设置真实 `ACR_NAMESPACE`，并用 `config --images` 检查 |
| `docker login` 出现 `no such host` | 手工抄写实例域名时混淆了 `l`、`I`、`1` | 从访问凭证页复制，不手工输入实例标识 |
| 通用 Registry 地址返回 `403 Forbidden` | 使用了不属于当前实例代际或地域的入口 | 使用访问凭证页为当前实例给出的精确登录主机名 |
| `curl -fsS` 没有明显输出 | 仅凭终端显示无法确定成功或失败 | 使用 `curl -i` 查看状态码和响应体，并用 `echo $?` 查看退出码 |

## 实际验收结果

2026-09-15，实际 Ubuntu ECS 已完成以下验证：

- ACR 中 `bobo-api` 与 `bobo-web` 两个私有仓库构建成功。
- ECS 使用正确的实例 Registry 主机名登录成功。
- Compose 从 ACR 拉取两个 `latest` 业务镜像成功。
- 初始化、API、Web 和 PostgreSQL 服务正常启动并通过健康检查。
- 网站成功对外发布，后续更新入口确定为 `bash scripts/update-server.sh`。
