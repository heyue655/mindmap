# M-09 部门管理

**状态：** `ACTIVE`

---

## 概述

部门管理模块供系统管理员（`isAdmin=true`）维护公司组织架构。支持创建多级部门树、编辑部门名称/父部门、删除空部门。删除前强制校验：部门下无用户且无子部门，否则返回 409。

---

## 数据模型

**表：`departments`**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INT AUTO_INCREMENT | 主键 |
| `name` | VARCHAR | 部门名称，必填 |
| `parentId` | INT / NULL | 父部门 ID，NULL 表示顶级部门 |
| `dingDeptId` | INT / NULL / UNIQUE | 钉钉部门 ID，从钉钉同步时写入，用于 upsert 精确匹配；手动创建部门为 NULL |

**关联：**
- `users.departmentId → departments.id`（用户归属部门）
- `departments.parentId → departments.id`（自引用，部门树）

---

## API 接口

所有接口需携带 `Authorization: Bearer <JWT>` 请求头，且调用方必须为管理员（`isAdmin=true`），否则返回 403。

### GET /api/admin/departments
- **权限：** 管理员
- **出参：**
  ```json
  {
    "departments": [
      { "id": "1", "name": "公司", "parentId": undefined },
      { "id": "2", "name": "研发中心", "parentId": "1" }
    ]
  }
  ```
- **说明：** 返回全部部门，按 id 升序。`id`/`parentId` 序列化为字符串，顶级部门 `parentId` 不返回（`undefined`）。

### POST /api/admin/departments
- **权限：** 管理员
- **入参（JSON Body）：**

  | 字段 | 必填 | 说明 |
  |------|------|------|
  | `name` | 是 | 部门名称 |
  | `parentId` | 否 | 父部门 ID（字符串），留空则创建顶级部门 |

- **出参：** `{ "department": { id, name, parentId? } }`，HTTP 201
- **错误：** 400（参数缺失或父部门不存在）

### PATCH /api/admin/departments/[id]
- **权限：** 管理员
- **入参（JSON Body，所有字段可选）：**
  - `name`：新名称
  - `parentId`：新父部门 ID（字符串），传 `null` 可升级为顶级部门
- **业务规则：**
  - `parentId` 做存在性校验
  - 禁止将部门的 `parentId` 设为自身（防止循环引用）
- **出参：** `{ "department": { id, name, parentId? } }`

### DELETE /api/admin/departments/[id]
- **权限：** 管理员
- **操作：** 物理删除
- **业务规则：**
  - 若部门下有用户（`users.departmentId = id`）→ 返回 409，提示用户数量
  - 若部门下有子部门（`departments.parentId = id`）→ 返回 409，提示子部门数量
- **出参：** `{ "ok": true }`

### POST /api/admin/dingtalk/sync-departments
- **权限：** 管理员
- **入参：** 无（Body 为空）
- **出参：** `{ "ok": true, "total": N, "created": N, "updated": N }`
- **说明：** BFS 拉取钉钉全量部门树（从 `DINGTALK_ROOT_DEPT_ID`，默认 1），按 BFS 顺序 upsert 到 `departments` 表。已有 `dingDeptId` 的部门更新 `name`/`parentId`，新部门直接创建。根节点本身不写入。钉钉 API 失败返回 502。

---

1. **树形结构**：`parentId` 自引用构成多级部门树，前端通过递归 `buildPath()` 函数展示完整层级路径（如 `公司 / 研发中心 / 前端组`）。
2. **删除保护**：删除前同时检查用户数量和子部门数量，任一不为零则拒绝，返回 409 并说明原因。
3. **循环引用防护**：`PATCH` 时拒绝将 `parentId` 设为自身 ID（`parseInt(parentId) === targetId`）。
4. **Seed 初始化**：系统首次 seed 创建名为"公司"的顶级根部门（`parentId=null`），其他部门由管理员通过界面创建。
5. **前端权限守卫**：页面加载时检查 `currentUser.isAdmin`，非管理员跳转 `/mindmap`。

---

## 前端组件

| 组件 | 路径 | 职责 |
|------|------|------|
| `AdminDepartmentsPage` | `src/pages/admin/AdminDepartmentsPage.tsx` | 部门列表表格 + 新建/编辑 Dialog + 删除 ConfirmDialog + 同步钉钉组织架构按钮 |
| 路由入口 | `src/app/(app)/admin/departments/page.tsx` | 渲染 `AdminDepartmentsPage` |

**页面功能：**
- 表格展示：部门名称、层级路径（`buildPath` 递归构建，如 `公司 / 研发中心`）、操作按钮
- 新建部门：Dialog 填写名称 + 可选父部门（下拉选择）
- 编辑部门：打开 Dialog 时自动填充当前名称和父部门（规范 1-3），可修改名称/父部门
- 删除部门：`ConfirmDialog` 二次确认，`destructive` 样式；后端返回 409 时 `toast.error` 显示具体原因
- **同步钉钉组织架构**：顶部「同步钉钉组织架构」按钮 + `ConfirmDialog` 确认，调用 `POST /api/admin/dingtalk/sync-departments`，同步完成后刷新列表并 `toast.success` 显示摘要

---

## 变更记录

| 日期 | 编号 | 变更内容 | 原始需求 |
|------|------|----------|----------|
| 2026-05-19 | T-09-001 | 初始实现部门管理 API（GET/POST/PATCH/DELETE）及前端页面 | 生产化改造——管理员维护组织架构 |
| 2026-05-21 | T-09-002 | `departments` 表新增 `dingDeptId INT? UNIQUE`；新建 `POST /api/admin/dingtalk/sync-departments` 接口（BFS upsert 部门树）；`AdminDepartmentsPage` 新增「同步钉钉组织架构」按钮 + ConfirmDialog；`src/lib/dingtalk.ts` 新增 `fetchDingtalkDeptTree()`；`.env.example` 新增 `DINGTALK_ROOT_DEPT_ID` | 钉钉组织架构一键同步 |
