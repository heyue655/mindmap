# 研发交接说明（产品设计阶段 → 工程续作）

本文档供**后续研发团队**接手：说明仓库定位、如何运行、文档索引、已完成与待办边界。  
**产品/设计主规格**：`docs/superpowers/specs/2026-04-27-mindmap-task-tool-design.md`（含 §12 企业部署与钉钉一体化目标架构）。

---

## 1. 项目是什么

- **定位**：思维导图 + 任务工具原型；前端为可交互演示，后端为**可选**本地 API（SQLite 或 PostgreSQL），用于企业向能力联调（多租户、钉钉通知、日历、Webhook 等）。
- **技术栈**：React 18 + TypeScript + Vite + Tailwind + shadcn/ui；服务端 Fastify；无独立「生产部署」脚本（需团队自行补齐）。

---

## 2. 如何把项目交给对方（导出）

**推荐（可审计、可协作）**

```bash
# 对方克隆后
cd demo2   # 或你们实际仓库名
npm ci     # 或 npm install
cp .env.example .env.development.local   # 按需改 VITE_USE_API 等
npm run build   # 确认能编译通过
```

**打包 zip（不含 node_modules，减小体积）**

**A. 完整工程交接（含 `server/`、CLI、钉钉联调代码）** — 在项目**上一级目录**执行：

```bash
zip -r mindmap-task-tool-handoff.zip demo2 \
  -x "demo2/node_modules/*" \
  -x "demo2/dist/*" \
  -x "demo2/server/data/*.db" \
  -x "demo2/.git/*"
```

**B. 设计文档 + 前端源码（给后端 / 接口开发对齐类型与 UI）** — 在**仓库根目录** `demo2/` 内执行：

```bash
zip -r mindmap-docs-and-frontend.zip \
  docs/superpowers \
  HANDOFF.md \
  docs-pack-README.txt \
  frontend-pack-README.txt \
  .env.example \
  src public index.html \
  package.json package-lock.json \
  vite.config.ts \
  tsconfig.json tsconfig.app.json tsconfig.node.json \
  tailwind.config.ts postcss.config.js components.json
```

生成 **`mindmap-docs-and-frontend.zip`**：内含主规格 `docs/superpowers/specs/2026-04-27-mindmap-task-tool-design.md`（当前 **v2.3** 含甘特图与 `TaskFields` 扩展说明）、里程碑文档、运行说明与可 `npm ci && npm run build` 的前端目录。**不含** `server/`；对接 API 与钉钉请使用 **A** 或完整 Git 克隆。

对方解压后同样执行 `npm ci` 与 `npm run build`（完整工程）。仅前端包解压后同样在包根目录执行上述 npm 命令。  
若需**含 git 历史**，直接 `git bundle create repo.bundle --all` 或使用私有 Git 托管即可。

**不要依赖**：本机 `server/data/*.db`（已在 `.gitignore`）；交接时说明数据为本地演示库即可。

### CLI 与 OpenClaw（MCP Agent）

面向脚本与 **OpenClaw** 等 MCP 客户端：先启动 API（`npm run dev:api` 或 `npm run dev:full`），再使用下面入口。

| 命令 | 说明 |
|------|------|
| `npm run cli:mindmap -- …` | 命令行操作 API（`health`、`login`、`workspace get/put`、`node patch/create`、`nodes search`、`log append`、`report draft`）；`--help` 查看子命令 |
| `npm run cli:mcp` | **stdio MCP 服务**（仅 JSON-RPC 走 stdout，日志须用 stderr） |

环境变量（可选）：`MINDMAP_API_BASE`（默认 `http://127.0.0.1:3001`）、`MINDMAP_API_TOKEN`（`cli:mindmap login --user <id>` 返回的 JWT，便于 MCP 进程免重复传参）。

在 OpenClaw 中注册示例（`cwd` 改为本机仓库绝对路径，`MINDMAP_API_TOKEN` 填登录结果）：

```bash
openclaw mcp set mindmap-task-tool '{"command":"npm","args":["run","cli:mcp"],"cwd":"/absolute/path/to/demo2","env":{"MINDMAP_API_BASE":"http://127.0.0.1:3001","MINDMAP_API_TOKEN":"<jwt>"}}'
```

暴露的工具名以 `mindmap_` 为前缀（如 `mindmap_workspace_get`、`mindmap_node_patch`、`mindmap_report_draft` 等），与 CLI 能力对齐。

---

## 3. 静态 HTML 演示包（不接后端）

给非研发或外部评审「直接打开」用：

```bash
npm run build:static-demo
```

生成 `dist/`（相对路径资源 + 哈希路由，可双击 `index.html` 或用 `python3 -m http.server`）。  
也可将 `dist` 打成 zip；仓库根目录可提供一次性产物 **`mindmap-static-demo.zip`**（需本地执行上述命令后自行打包，见 `package.json` 中 `build:static-demo`）。  
包内附 `静态演示说明.txt`。**注意**：静态包固定为 **不连 API**；日常开发仍用 `npm run dev` / `npm run build`。

**需求文档 + 前端源码合一包**：根目录执行上文 **§2.B** 命令生成 **`mindmap-docs-and-frontend.zip`**（清单见 `docs-pack-README.txt`）。纯前端或后端对照类型/界面续作可仅用此包；接钉钉/API 需完整克隆仓库含 `server/`。

---

## 4. 本地运行

| 命令 | 说明 |
|------|------|
| `npm run dev` | 仅前端（默认代理 `/api` → `http://127.0.0.1:3001`） |
| `npm run dev:api` | 仅 API，默认端口 **3001**，SQLite：`server/data/app.db` |
| `npm run dev:full` | 前后端同时开发 |
| `docker compose up -d` + `npm run dev:api:pg` / `dev:full:pg` | PostgreSQL 模式（见 `docker-compose.yml`） |
| `npm run build` | `tsc -b` + `vite build` |
| `npm run cli:mindmap` / `npm run cli:mcp` | 见 §2「CLI 与 OpenClaw」 |

**环境变量**：见根目录 `.env.example`（`VITE_USE_API`、`DATABASE_URL`、`DINGTALK_*`、`JWT_SECRET`、`PORT` 等）。  
端口冲突时可设 `PORT=3002`，并同步改 `vite.config.ts` 里 proxy 的 target。

---

## 5. 目录职责（研发速查）

| 路径 | 说明 |
|------|------|
| `src/pages/`、`src/features/` | 页面与功能模块 |
| `src/store/StoreProvider.tsx` | 全局状态；API 模式下工作区与组织加载/保存 |
| `src/lib/api/workspaceApi.ts` | 前端调用 `/api/*` 的封装 |
| `src/mock/`、`src/types/` | 演示数据与类型 |
| `server/index.ts` | Fastify 路由入口 |
| `server/pg-schema.sql`、`server/pg-store.ts` | PostgreSQL 模式 |
| `server/sqlite-store.ts` | SQLite 模式 |
| `server/dingtalk-*.ts`、`server/calendar-*.ts` | 钉钉与日历相关逻辑 |
| `docs/superpowers/specs/` | 产品设计规格 |
| `docs/superpowers/plans/` | 里程碑与规划（如 `2026-04-28-enterprise-milestones.md`） |
| `cli/` | `mindmap-cli` 与 stdio MCP（OpenClaw 等可对接） |

---

## 6. 产品设计阶段已对齐的能力（工程侧已有代码路径）

- 导图任务、派任务、关注/分享、通知、@ 提及、右侧 Dock（含日历同步 UI）、**甘特图视图**（`TaskFields.ganttStart` / `ganttDurationDays`，见规格 v2.3）。
- **可选 API + 多租户雏形**：JWT `tid`、工作区按租户隔离（PG）；SQLite 仍为演示用单库。
- **钉钉（需配置 `DINGTALK_APP_*`）**：免登换票、工作通知 Outbox 真实发送、通讯录部门树同步（`mock:false`）、日历创建/更新、Webhook 回写任务（可选签名校验）。
- **未当作「生产完成」**：每人独立导图快照、钉钉 Stream/加密回调全量、运维监控、CI/CD 等——见规格 §12 与里程碑文档。

---

## 7. 建议后续研发优先事项（按产品目标裁剪）

1. 与钉钉开放平台**现网联调**（权限、回调 URL、corpId/租户一致性）。
2. 明确 **Webhook / 日程完成** 与钉钉真实事件体对齐；补删除日程、幂等与重试策略。
3. 若产品要求**每人独立工作区**：扩展 `workspace_snapshots` 或等价模型 + 前端路由/会话。
4. `org_relations` 与真实汇报线：是否从钉钉扩展字段同步或保留产品内维护。
5. 安全：JWT 密钥、HTTPS、密钥管理；按公司规范补审计与监控。

---

## 8. 联系人 / 备注（请交接时填写）

| 项 | 内容 |
|----|------|
| 产品负责人 | |
| 设计/规格答疑 | 以 `docs/superpowers/specs/2026-04-27-mindmap-task-tool-design.md` 为准 |
| 代码仓库 URL | |
| 钉钉应用（AppKey 等）保管方式 | **勿写入 git**；用密钥管理系统 |

---

*文档版本：与仓库内工程状态同步；若仅设计阶段结束，请产品侧在 §7 补联系人后一并交付。*
