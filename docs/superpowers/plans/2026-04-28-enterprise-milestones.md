# 企业版演进里程碑（自建规划）

> 日期：2026-04-28  
> 与 [设计文档 §12](../specs/2026-04-27-mindmap-task-tool-design.md) 对齐；工程上按阶段增量交付，每阶段可独立演示与验收。

## 总览

| 阶段 | 名称 | 目标 | 验收 |
|------|------|------|------|
| **M1** | 多租户数据层 + 钉钉占位登录 | 可选 PostgreSQL；企业（租户）边界；JWT 带 `tid`；Mock 钉钉 userId → 应用 userId | `docker compose up -d` 后 `DATABASE_URL` 启动 API；Mock 登录拿带租户的 token；工作区按租户隔离 |
| **M2** | 通讯录同步 | 定时/手动拉钉钉部门与人员；写入 `department` / `app_users`；与派任务范围一致 | **已部分落地**：PG 表 `org_departments` / `org_relations` / `org_sync_state`；`GET /api/org`；`POST /api/sync/dingtalk/org` 默认 `mock:true` 用仓库 mock 覆盖写入。配置 `DINGTALK_APP_*` 后 `mock:false` 可调钉钉 `department/get` + `listsub` 写入部门树（`org_relations` 仍为空，需另维护） |
| **M3** | 钉钉工作通知 | 派任务 / 关注 / @ 等事件调用钉钉「工作通知」API；失败入队重试 | **已部分落地**：表 `dingtalk_outbox`；`PUT /api/workspace` 对比快照后自动入队并 flush。配置 `DINGTALK_APP_KEY` / `SECRET` / `AGENT_ID` 时 flush 走 `asyncsend_v2`；否则仍为 mock。需 `dingtalk_user_map` 中 app 用户 ↔ 钉钉 userid |
| **M4** | 日历与回写 | 创建/更新钉钉日程；回调或轮询同步完成状态到任务 | **已部分落地**：表 `calendar_event_links`；`POST/GET /api/calendar/links`；**`POST /api/integrations/dingtalk/calendar/push`** 创建/更新钉钉日程（oapi v2）；`POST /api/webhooks/dingtalk/calendar` 回写任务；可选 `DINGTALK_WEBHOOK_SECRET` / `DINGTALK_APP_SECRET` 做机器人式验签 |

## M1（当前迭代实现范围）

**交付物**

- `docker-compose.yml`：本地 PostgreSQL 16。
- `server/pg-schema.sql`：`tenants`、`dingtalk_user_map`、`workspace_snapshots`。
- `server/store.ts`：`DATABASE_URL` 存在时走 Postgres，否则走原有 SQLite（行为不变）。
- `server/auth.ts`：JWT 载荷含 `tid`（租户 id）；校验逻辑兼容旧 token（默认 `default`）。
- `POST /api/auth/dingtalk/mock`：无真实钉钉环境时模拟「钉钉 userId + corpId → 应用账号」。
- 文档：本文件 + `.env.example` 补充 `DATABASE_URL`。
- 本地命令：`docker compose up -d` 起库后，`npm run dev:api:pg`（或 `npm run dev:full:pg` 连前端）；不设 `DATABASE_URL` 时仍为 `npm run dev:api`（SQLite）。

**刻意未做（留给后续里程碑）**

- 真实 OAuth 授权码换 token、corpId 与 AppKey 联调。
- 每员工独立工作区快照（M1 仍为**每租户一份**快照，与当前 SQLite 全员共享演示等复杂度一致，但已具备**企业边界**）。

## M2 概要（规划）

- 表：`departments`、`org_edges`（或沿用现有关系模型）；`sync_jobs`、`dingtalk_dept_raw`（可选）。
- 任务：`POST /api/sync/dingtalk/org`（管理员 token）、定时 Cron。
- 冲突策略：钉钉为源；本地仅扩展字段（虚线汇报）。

## M3 概要（规划）

- 抽象 `NotificationChannel`：`in_app` | `dingtalk_work_notice`。
- 配置表 `tenant_integrations(dingtalk_agent_id, ...)`.
- 异步队列重试（Redis list 或 DB 表 `outbox`）。

## M4 概要（规划）

- `calendar_event_links` 已落库；前端负责人「重新同步」可触发 **push** 写钉钉日程。
- HTTP(S) 回调：`POST /api/webhooks/dingtalk/calendar`（可选机器人 **sign**；与钉钉 Stream/加密订阅对齐仍待生产联调）。

## 依赖与风险

- 钉钉各接口以开放平台文档为准；需企业开通对应权限。
- 几千人规模下 M2 必须增量同步 + 限流（详见设计 §12.2）。
