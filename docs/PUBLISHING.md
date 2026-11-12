# JSONL 发布器运维

## 调度属于主项目

`src/local/start.ts` 同时运行图库、队列消费与 `src/publish/scheduler.ts`。三者共享退出信号，收到 SIGTERM/SIGINT 后中止发布网络请求和 Git 子进程。发布失败单独记录并在约 30 分钟后重试，不打断队列消费。程序启动后补偿遗漏任务，每分钟读取配置并检查日期；没有系统 cron、systemd service 或 timer。

默认 `Asia/Shanghai` 每日 `03:15` 生成一次快照。周文件按 `archivedAt` 的本地日期计算 ISO 周。每月 1 日首次调度后发布上个月的 `YYYY-MM.jsonl`；不会在 1 日零点拿前一天尚不完整的快照封存整月。

## 配置与 Token

复制 `publisher.config.example.json` 为 `publisher.config.json`，修改 `repositoryName`、`branch`、`timezone`、`dailyTime` 或 `enabled`。文件每分钟重新读取，修改无需重建容器。Token 单独保存在 `.secrets/github-token`，目录 `700`，文件 `600`。配置、Token 和状态目录已忽略 Git。

自动创建公开仓库使用 **Personal access token (classic)** 的 **public_repo** 权限：<https://github.com/settings/tokens/new>。它具有账号可访问的公开仓库写权限，程序只操作配置的仓库。不需要 repo、workflow 或 delete_repo。程序读取 `GET /user` 自动识别 owner，不存在的目标通过 `POST /user/repos` 创建为公开仓库。

Compose 将 JSON 配置和 `.secrets/` 只读挂入主项目容器，将 `publisher-state/` 作为独立持久状态目录。现有图片目录、SQLite 和 Cloudflare 登录挂载保持原有用途。轮换 Token 请保持文件名及权限；替换文件会在下一次调度检查时被识别。

`publisher.env` 只供宿主机手动 CLI 加载路径/代理参数；日常设置以 JSON 配置为准。宿主机 CLI 需要自行安装 Bun 1.4.4；容器镜像包含 Bun 和 Git。代理为可选配置，宿主机使用 `HTTP_PROXY` / `HTTPS_PROXY`，Compose 使用 `ARCHIVE_HTTP_PROXY`。

## Git 同步与文档编辑

每次实际发布按以下顺序执行：

```text
git fetch --prune origin
→ git pull --rebase --autostash origin <branch>
→ 更新 JSONL 和 manifest
→ git commit（有差异时）
→ git push origin HEAD:refs/heads/<branch>
```

空仓库首次发布没有可 pull 的远端分支，会直接初始化。已有仓库的 README 默认原样保留；用户可在 GitHub 编辑说明文档。只管理 `manifest.json`、`weeks/YYYY-Www.jsonl`，README 仅在首次初始化或用户明确要求更新文档时写入。不会 force push。文档合并冲突或分支保护拒绝会报告错误，不覆盖用户内容。

本地 Git checkout 位于 `publisher-state/checkouts/`。Token 通过 Git 进程的 HTTP header 环境传入，不出现在 remote URL、Git 配置文件或命令行。程序拒绝托管路径中的符号链接。手动发布应避免与主程序正在执行的任务并行；Git 非强制推送和发布快照提供失败恢复保护。

## 快照与 Release

当天元数据快照保存在 `publisher-state/snapshot.json`，同日重试复用内容，避免网络中断后重复生成不同提交。成功后当天不会再次提交；新收藏和删除在下一发布日反映。初次发布按当前保留数据补齐历史周文件与完整历史月份，不伪造离线时逐日的 Git 提交。

月度附件及来源 commit 在本地先封存，再建立草稿、上传 JSONL、核对大小和 SHA-256，最后发布。失败后复用封存内容；已公开 Release 保留当时的快照，不因后来删除图片而改写。SHA-256 写入 Release 说明，唯一附件仍为 JSONL。

## 内容边界

字段白名单为 `id`、`platform`、`postId`、`postUrl`、`imageUrl`、`tags`、`author.id`、`author.name`、`publishedAt`、`archivedAt`。不读取或上传图片二进制，不导出数据库、本地路径、图库 URL、Referer 或凭据。原帖 URL 和图片直链来自原始来源网站。

## 操作与验证

```bash
cd /path/to/social-image-archive
bun run share:preview /tmp/new-preview-directory
bun run share:status
# 手动发布仅在主程序没有执行发布时运行：
bun run share:publish
```

首次部署先从 `compose.example.yaml` 创建本地 `compose.yaml`，并完成 README 中的配置。已有环境的容器更新应遵守该环境的审批流程，准备好验证和回滚。源码本身不依赖某个私有审批服务。

保留既有 `publisher-state/`，避免重置日期和月度封存。初次将宿主机发布器迁入主程序时，部署交接会一次性规范快照配置标识；容器内外路径差异不应触发重复发布。

`bun run check`、`bun test` 验证周/月边界、字段裁剪、远端 README 编辑保留、fetch/pull、幂等恢复和发布故障隔离。Git 测试使用任务临时目录中的真实本地 bare 仓库；不添加数据库测试。
