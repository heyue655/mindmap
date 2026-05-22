# M-03 组织与汇报关系

**状态：ACTIVE**

## 概述

管理公司组织架构（部门树）和员工汇报关系（实线/虚线）。数据全局共享，对所有已认证用户只读；仅管理员（CEO/VP 级别）可写。

## 数据模型

### departments 表

| 字段 | 说明 |
|------|------|
| id | INT 自增主键 |
| name | 部门名称 |
| parentId | 上级部门 ID（NULL = 根部门） |

### org_relations 表

| 字段 | 说明 |
|------|------|
| id | INT 自增主键 |
| subordinateId | 下级用户 ID |
| managerId | 上级用户 ID |
| relationType | `solid`（实线）或 `dotted`（虚线） |
| effectiveFrom | 生效日期（YYYY-MM-DD） |
| effectiveTo | 失效日期（NULL = 无限期） |

## API 接口

### GET /api/org

- 出参：`{ departments: Department[], relations: OrgRelation[] }`
- 权限：需 JWT

### PUT /api/org

- 入参：`{ departments?: Department[], relations?: OrgRelation[] }`
- 出参：`{ ok: true }`
- 权限：需 JWT + 角色校验（jobTitle 含 CEO/VP/总监）
- 说明：relations 采用全量替换策略

## 业务逻辑

- 前端 `StoreProvider` 在工作区加载后调用 `GET /api/org` 获取组织数据
- 实线上级用于汇报提交目标默认值；虚线关系用于权限展示
- `src/lib/org.ts` 提供 `getDirectManagers`、`isManager`、`getAllSolidDescendants`、`getAllAncestorsByManagerId`、`getAllDescendantsByManagerId` 等工具函数
- `getAllAncestorsByManagerId` / `getAllDescendantsByManagerId`：作为 OrgRelation 的兜底，沿 `User.managerId` 链分别向上/向下遍历，防止历史数据中 OrgRelation 缺失

## 前端组件

- `src/pages/TeamPage.tsx`：团队视图，展示下级员工任务状态
- `src/app/(app)/admin/org/page.tsx`：组织管理页（仅 CEO/VP 可见）

## 变更记录

| 日期 | 编号 | 变更内容 | 原始需求 |
|------|------|----------|----------|
| 2026-05-19 | T-03-001 | 创建 GET/PUT /api/org | Next.js 迁移 |
| 2026-05-19 | B-03-001 | 新增 `getAllDescendantsByManagerId`；TeamPage `allMembers` 合并 OrgRelation + managerId 两路来源；AppShell/MindMapPage `isManager` 增加 managerId 兜底 | 修复历史数据 OrgRelation 缺失导致 TeamPage 下属不可见、导航项隐藏 |
