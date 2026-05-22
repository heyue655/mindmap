# M-02 工作区快照同步

**状态：ACTIVE**

## 概述

以"全量快照"方式在前端 Store 和服务端 MySQL 之间同步数据。前端每次修改后 debounce 1.2s 自动调用 `PUT /api/workspace`；登录成功后调用 `GET /api/workspace` 拉取最新数据。

## 数据模型

涵盖 13 张表（完整列表见 `prisma/schema.prisma`）：users、mindmaps、nodes、assignments、follow_grants、node_shares、task_logs、app_notifications、relationships、calendar_syncs、mention_events、work_reports，以及辅助的 departments/org_relations（由 M-03 管理）。

序列化规则：所有数值主键在 API 层统一转为字符串返回，与前端 `UserId = string` 类型兼容。

## API 接口

### GET /api/workspace

- 入参：无（从 JWT 获取 userId）
- 出参：`WorkspaceSnapshot`（全量数据）
- 权限：需 JWT（`getAuth`）
- 规范：`withApiLogger`，所有查询附带 `ownerId / userId` 条件（规范 4-2）

### PUT /api/workspace

- 入参：`WorkspaceSnapshot`
- 出参：`{ ok: true, idMap: Record<string, string> }`
- 权限：需 JWT
- 说明：全量快照 upsert+delete 策略；
  - 前端临时字符串 ID（`node-xxx`）→ INSERT 后返回 `idMap`，前端通过 `applyIdMap` 重写全部 state
  - 数字字符串 ID → UPDATE（附 `userId` 条件防越权）
  - 快照中不存在的数据库记录 → 软删除（`status='deleted'` 或 `isDeleted=true`）
  - 服务端按拓扑排序（`topoSortNodes`）保证父节点先于子节点 INSERT
  - 跳过 `title` 为空白的临时节点及其级联引用

### POST /api/workspace/reset

- 入参：无
- 出参：`{ ok: true, reset: true }`
- 权限：需 JWT，且 `user.isAdmin = true`（非管理员返回 403）
- 说明：删除当前用户所有关联数据（导图、节点、日志、任务等），前端随后调用 `PUT /api/workspace` 重新写入 seed 数据

### POST /api/workspace/ensure-subordinate-mindmap

- 入参：`{ subordinateId: number }`
- 出参：`{ mindmap: MindMap, skeletonNodes: Node[] }`（201 新建 / 200 已存在）
- 权限：需 JWT；调用方必须是 `subordinateId` 的直接上级（`User.managerId` 或 `OrgRelation solid`）
- 说明：幂等接口，若下属已有当年年度导图则直接返回；否则创建导图 + 17 个骨架节点（年/12月/4季）。供 AssignDialog 在 handleSubmit 时按需调用（JIT 初始化）。



- 前端 `StoreProvider` 管理所有状态，API 模式下首次挂载自动拉取快照
- 所有数据变更均触发 debounce PUT（单飞锁：`isFlushing` 防重入，`hasDirty` 保证脏数据重试）
- PUT 成功后通过 `applyIdMap` 将所有 state 中的临时 ID 替换为服务端真实 INT ID（序列化为字符串）
- `WorkspaceSnapshot` 类型定义见 `src/types/workspaceSnapshot.ts`

## 前端组件

- `src/store/StoreProvider.tsx`：全局状态 + 同步逻辑
- `src/lib/api/workspaceApi.ts`：fetch 封装

## 变更记录

| 日期 | 编号 | 变更内容 | 原始需求 |
|------|------|----------|----------|
| 2026-05-19 | T-02-001 | 创建 GET/PUT /api/workspace | Next.js 迁移 |
| 2026-05-19 | T-02-002 | 创建 POST /api/workspace/reset | Next.js 迁移 |
| 2026-05-19 | T-02-003 | AppShell 迁移至 Next.js | Next.js 迁移 |
| 2026-05-19 | T-02-004 | StoreProvider 添加 use client | 规范适配 |
| 2026-05-19 | T-02-005 | workspaceApi VITE env → NEXT_PUBLIC env | Next.js 迁移 |
| 2026-05-19 | T-02-006 | PUT /api/workspace 重写：全量 upsert+delete+idMap；拓扑排序；空节点过滤 | 生产化改造 |
| 2026-05-19 | T-02-007 | POST /api/workspace/reset 加 isAdmin 权限校验（403 拒绝非管理员） | 生产化改造 |
| 2026-05-21 | T-02-008 | 新增 POST /api/workspace/ensure-subordinate-mindmap：上级按需为下属 JIT 初始化年度导图+骨架节点；GET /api/workspace 移除代为批量创建下属导图的逻辑 | 优化登录初始化策略 |
| 2026-05-19 | T-02-008 | StoreProvider：单飞锁 + applyIdMap + 前端空白节点过滤 | 生产化改造 |
