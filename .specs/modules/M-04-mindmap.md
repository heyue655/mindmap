# M-04 思维导图与节点

**状态：ACTIVE**

## 概述

核心业务模块。每个用户拥有若干思维导图（MindMap），每张导图包含树状节点（Node）。节点可挂载任务字段（状态、优先级、截止日期等）、标注、备注、超链接、图片等附加数据。

## 数据模型

### mindmaps 表

| 字段 | 说明 |
|------|------|
| id | INT 自增主键 |
| ownerId | 所属用户 ID |
| year | 年度（年度模板图使用） |
| title | 导图标题 |
| structure | 布局结构（mind_map / org_chart / timeline 等） |
| theme | 主题（默认 default） |
| useAnnualTemplate | 是否为年度任务模板图 |

### nodes 表

| 字段 | 说明 |
|------|------|
| id | INT 自增主键 |
| mindmapId | 所属导图 ID |
| parentId | 父节点 ID（NULL = 根节点） |
| sortOrder | 兄弟节点排序（小数，支持插入排序） |
| title | 节点标题 |
| nodeType | 节点类型（topic / bucket / time_bucket / floating） |
| task | JSON：任务字段（status/priority/deadline/assigneeId 等） |
| markers | JSON：标注列表 |
| isDeleted / deletedAt | 软删除 |

## API 接口

节点的读写通过 `GET/PUT /api/workspace`（M-02）整体同步；暂无独立的节点 CRUD 接口。

## 业务逻辑

- 年度模板图结构：根节点 → 季度桶 → 月度桶 → 任务节点
- 节点软删除：`isDeleted=true` 后不在导图中显示，但数据保留（便于审计）
- 权限：只能读写自己名下的导图；通过 FollowGrant（M-05）可查看被授权的他人节点

## 前端组件

- `src/pages/MindMapPage.tsx`：主导图页，含画布/大纲/甘特图三种视图
- `src/features/mindmap/`：MindMapCanvas、MindMapToolbar、MindMapOutline、MindMapGantt
- `src/features/task/NodeDetailDrawer.tsx`：节点详情抽屉

## 变更记录

| 日期 | 编号 | 变更内容 | 原始需求 |
|------|------|----------|----------|
| 2026-05-19 | T-04-001 | MindMapPage 迁移至 Next.js，useSearchParams 适配 | Next.js 迁移 |
| 2026-05-19 | B-04-001 | handleDelete confirm → ConfirmDialog；openShare/openFollow/handleAddSummary/handleAddBoundary alert → toast.error | 规范 3-1 |
