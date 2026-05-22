# M-08 用户管理

**状态：** `ACTIVE`

---

## 概述

用户管理模块供系统管理员（`isAdmin=true`）维护用户账号。支持创建用户（含指定直接上级）、编辑基本信息、禁用/启用账号。新建用户初始密码为工号并自动标记 `mustResetPassword=true`，用户首次登录时系统强制跳转重置密码页面。用户禁用为软删除（`status='disabled'`），不物理删除记录。

---

## 数据模型

**表：`users`**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INT AUTO_INCREMENT | 主键 |
| `employeeNo` | VARCHAR | 工号，全局唯一，创建后不可修改 |
| `name` | VARCHAR | 姓名 |
| `email` | VARCHAR | 邮箱，可留空由系统自动生成 `{employeeNo}@company.local` |
| `avatar` | VARCHAR / NULL | 头像（emoji 或 URL），可为空 |
| `departmentId` | INT | 所属部门外键，必填 |
| `jobTitle` | VARCHAR | 职位，必填 |
| `passwordHash` | VARCHAR | bcrypt 哈希（cost=12） |
| `status` | VARCHAR | 账号状态：`active`（正常）/ `disabled`（已禁用） |
| `isAdmin` | BOOLEAN | 是否为管理员，默认 false；新建用户默认 false |
| `dingtalkBound` | BOOLEAN | 是否绑定钉钉，默认 false；dingtalkUserId 非空时自动置 true |
| `dingtalkUserId` | VARCHAR / NULL | 钉钉用户 ID，可为空 |
| `managerId` | INT / NULL | 直接上级用户 ID（自引用外键），可为空 |
| `managerSource` | VARCHAR(16) / NULL | 上级来源：`"manual"`=管理员手动设置，`"dingtalk"`=钉钉同步，NULL=未设置/待同步 |
| `managerSyncedAt` | DATETIME / NULL | 最近一次从钉钉同步上级关系的时间（NULL=从未同步） |
| `pendingManagerId` | INT / NULL | 钉钉建议的上级 ID（当与 manual 设置冲突时暂存，待管理员确认） |
| `mustResetPassword` | BOOLEAN | 是否需要重置密码，新建用户默认 true，重置后置 false |
| `createdAt` / `updatedAt` | DATETIME | 北京时间（UTC+8） |

---

## API 接口

所有接口需携带 `Authorization: Bearer <JWT>` 请求头，且调用方必须为管理员（`isAdmin=true`），否则返回 403。

### GET /api/admin/users
- **权限：** 管理员
- **查询参数：** `page`, `pageSize`, `keyword`（姓名/工号/职位模糊搜索）, `status`, `deptId`, `all=true`（全量，用于下拉）, `hasPendingManager=true`（筛选有冲突的用户）
- **出参：** `{ users: [...], total, page, pageSize }`，用户对象包含 `managerSource`, `pendingManagerId`, `pendingManagerName` 字段

### POST /api/admin/users
- **权限：** 管理员
- **入参（JSON Body）：**

  | 字段 | 必填 | 说明 |
  |------|------|------|
  | `employeeNo` | 是 | 工号，必须唯一 |
  | `name` | 是 | 姓名 |
  | `departmentId` | 是 | 部门 ID（字符串） |
  | `jobTitle` | 是 | 职位 |
  | `email` | 否 | 邮箱，留空自动生成 |
  | `avatar` | 否 | 头像 emoji |
  | `managerId` | 否 | 直接上级用户 ID（字符串） |

- **出参：** `{ "user": { ...同上 } }`，HTTP 201
- **说明：** 新建用户自动设置 `mustResetPassword=true`，初始密码为用户工号（bcrypt 哈希存储）。
- **错误：** 400（参数缺失/上级不存在）、409（工号已存在）

### PATCH /api/admin/users/[id]
- **权限：** 管理员
- **入参（JSON Body，所有字段可选）：** `name`, `email`, `avatar`, `departmentId`, `jobTitle`, `status`, `isAdmin`, `managerId`（传 `null` 或空字符串表示清除上级）, `dingtalkUserId`（传空字符串/null 清除绑定）
- **业务规则：**
  - 不能将自己的 `isAdmin` 改为 false（防止系统锁死）
  - 部门 ID 会做存在性校验
  - `dingtalkUserId` 非空字符串时自动设 `dingtalkBound=true`；空/null 时设 `dingtalkBound=false`
  - 当 `managerId` 被手动设置时，自动写入 `managerSource="manual"`（或 null 清除），同时清除 `pendingManagerId`（冲突自动解除）
- **出参：** `{ "user": { ...同上 } }`

### POST /api/admin/dingtalk/sync-manager-relations
- **权限：** 管理员 JWT 或 `x-cron-secret` 请求头（供 cron 容器调用）
- **查询参数：** `force=true`（强制全量刷新，忽略 `managerSyncedAt`）
- **逻辑：**
  1. 预加载所有 `dingtalkUserId → db_id` 映射（一次 DB 查询）
  2. 查询 `managerSyncedAt IS NULL` 或 `> 24h` 的待处理用户（force=true 则全量）
  3. 按批次 100 调用 `batchFetchManagerUserids`（并发 10），从钉钉逐用户拉取 `manager_userid`
  4. 冲突判断：`managerSource = "manual"` 且钉钉上级与当前不同 → 写入 `pendingManagerId`（不覆盖 `managerId`）；否则直接更新 `managerId`，重建 `OrgRelation(solid)`
  5. 更新 `managerSyncedAt`（无论是否找到上级）
- **出参：** `{ processed, updated, conflicts, skipped }`

### POST /api/admin/dingtalk/resolve-manager-conflicts
- **权限：** 管理员
- **入参：** `{ actions: [{ userId: string, action: "accept" | "keep" }] }`
- **逻辑：**
  - `accept`：将 `managerId = pendingManagerId`，`managerSource = "dingtalk"`，清除 `pendingManagerId`，重建 `OrgRelation(solid)`
  - `keep`：清除 `pendingManagerId`，保留 `managerSource = "manual"` 及当前 `managerId`
- **出参：** `{ resolved: number }`

### DELETE /api/admin/users/[id]
- **权限：** 管理员
- **操作：** 软删除，将 `status` 改为 `disabled`
- **业务规则：** 不能禁用自己的账号
- **出参：** `{ "ok": true }`

---

## 业务逻辑

1. **工号唯一性**：`POST` 创建时在数据库层做唯一性检查，重复返回 409。
2. **初始密码**：为用户工号，服务端使用 `bcrypt`（cost=12）哈希后存储。新建用户自动设 `mustResetPassword=true`。
3. **首次登录强制重置**：`mustResetPassword=true` 的用户登录后，LoginPage 跳转 `/reset-password`；AppShell 在非 `/reset-password` 页也会强制重定向；重置成功后清除标记、刷新工作区，跳转 `/mindmap`。
4. **直接上级**：新建/编辑时可选择直接上级（下拉仅显示 active 用户），不能将自己设为自己的上级。
5. **软删除**：`DELETE` 将 `status` 设为 `disabled`，`PATCH` 传 `{ status: "active" }` 可恢复。
6. **自身保护**：
   - 管理员不能禁用自己（`DELETE` 校验 `targetId === userId`）
   - 管理员不能取消自己的 `isAdmin`（`PATCH` 校验 `targetId === userId && isAdmin === false`）
7. **前端权限守卫**：页面加载时检查 `currentUser.isAdmin`，非管理员跳转 `/mindmap`。

---

## 前端组件

| 组件 | 路径 | 职责 |
|------|------|------|
| `AdminUsersPage` | `src/pages/admin/AdminUsersPage.tsx` | 用户列表表格 + 新建/编辑 Dialog（含直接上级下拉）+ 禁用 ConfirmDialog |
| `ResetPasswordPage` | `src/pages/ResetPasswordPage.tsx` | 首次登录重置密码表单 |
| 路由入口 | `src/app/(app)/admin/users/page.tsx` | 渲染 `AdminUsersPage` |
| 路由入口 | `src/app/(app)/reset-password/page.tsx` | 渲染 `ResetPasswordPage` |

**AdminUsersPage 功能：**
- 表格展示：工号、姓名、部门（名称）、职位、状态标签、角色标签（管理员徽章）
- 新建用户：Dialog 第一行为姓名，姓名输入后 500ms 防抖自动调用钉钉搜索接口，结果以头像卡片展示并默认选中第一条（同步带出工号、邮箱、头像、dingtalkUserId），工号可手动修改，保存时一并提交 `dingtalkUserId`
- 编辑用户：打开 Dialog 时自动填充当前数据（规范 1-3），可修改姓名/邮箱/头像/部门/职位/**直接上级**
- **钉钉账号绑定**：编辑模式下展示独立绑定区块，输入姓名 → 调用 `GET /api/admin/dingtalk/search?name=` → 以头像卡片展示候选人（姓名+工号+钉钉头像图片），点选后自动将 `dingtalkUserId`/`email`/`avatar`（图片 URL）写入表单，保存时一并 PATCH 入库
- 用户列表头像兼容：`avatar` 为图片 URL（`http` 开头）时以 `<img>` 渲染，否则当作 emoji 文字渲染
- 禁用用户：`ConfirmDialog` 二次确认，`destructive` 样式，自身账号禁用按钮置灰
- 启用用户：直接点击启用图标，无需二次确认
- **同步钉钉人员**：顶部「同步钉钉人员」按钮 + `ConfirmDialog` 确认，调用 `POST /api/admin/dingtalk/sync-users`；按 dingtalkUserId→employeeNo fallback 匹配，命中则更新，未命中则创建（密码=工号，mustResetPassword=true）；不在钉钉中的已绑定用户自动 disabled（管理员跳过）；完成后 `toast.success` 显示摘要并刷新列表
- **同步上级关系**：顶部「同步上级关系」按钮（`GitMerge` 图标）+ `ConfirmDialog` 确认，调用 `POST /api/admin/dingtalk/sync-manager-relations`；同步完成后刷新冲突数徽标和用户列表
- **上级冲突徽标**：页面加载时查询 `hasPendingManager=true` 获取冲突数，若 > 0 在顶部显示琥珀色徽标按钮；点击打开冲突处理 Dialog
- **冲突处理 Dialog**：表格展示冲突用户（姓名/工号、当前手动上级、钉钉建议上级）；每行可选「接受钉钉」或「保持当前」；提供全选快捷按钮；确认后批量调用 `POST /api/admin/dingtalk/resolve-manager-conflicts`

**ResetPasswordPage 功能：**
- 输入新密码 + 确认密码（≥6 位，不能与工号相同）
- 调用 `POST /api/auth/reset-password`，成功后 `refreshWorkspace()` 并跳转 `/mindmap`

---

## 变更记录

| 日期 | 编号 | 变更内容 | 原始需求 |
|------|------|----------|----------|
| 2026-05-19 | T-08-001 | 初始实现用户管理 API（GET/POST/PATCH/DELETE）及前端页面 | 生产化改造——管理员维护用户账号 |
| 2026-05-19 | T-08-002 | 新增直接上级（managerId）字段：schema、API、前端下拉 | 添加和编辑用户时需要指定直接上级 |
| 2026-05-19 | T-08-003 | 新建用户自动设 mustResetPassword=true；首次登录跳转重置密码页面 | 首次登录时需要跳转到重置密码界面 |
| 2026-05-19 | B-08-001 | POST /api/admin/users 新增：创建用户时同步写入 OrgRelation(solid) | 修复申请关注提示"没有上级" |
| 2026-05-19 | B-08-002 | PATCH /api/admin/users/[id] 新增：managerId 变更时重建 OrgRelation | 修复申请关注提示"没有上级" |
| 2026-05-19 | B-08-003 | AdminUsersPage 保存后调用 refreshWorkspace() 使 relations 立即生效 | 修复申请关注提示"没有上级" |
| 2026-05-20 | T-08-004 | 新增 dingtalkUserId 字段：schema(String?)、PATCH API（含自动同步 dingtalkBound）、AdminUsersPage 编辑表单新增输入框并自动带出 | 钉钉通知集成 |
| 2026-05-20 | T-08-005 | 钉钉绑定改为搜索选人：新建 GET /api/admin/dingtalk/search，dingtalk.ts 新增 searchDingtalkUsers/getDingtalkUserDetail，AdminUsersPage 编辑 Dialog 改为姓名搜索+头像卡片选人，自动同步 dingtalkUserId/email/avatar（URL）；头像渲染兼容图片 URL 和 emoji | 按姓名搜索钉钉账号，多人时展示卡片供选择 |
| 2026-05-20 | T-08-006 | 新建用户表单重排：姓名置首位，姓名输入后 500ms 防抖自动搜索钉钉并默认选中第一条，带出工号/邮箱/头像/dingtalkUserId（均可手动修改）；POST /api/admin/users 新增接受 dingtalkUserId 字段并写入 dingtalkBound | 新建用户时自动关联钉钉账号 |
| 2026-05-21 | T-08-007 | 新建 `POST /api/admin/dingtalk/sync-users`：fetchAllDingtalkUsers 拉取全量用户，按 dingtalkUserId→employeeNo upsert，新建账号密码=工号+mustResetPassword=true，不在钉钉的已绑定用户自动 disabled（管理员跳过）；`dingtalk.ts` 新增 `fetchAllDingtalkUsers()`；`AdminUsersPage` 新增「同步钉钉人员」按钮+ConfirmDialog | 钉钉人员一键同步 |
| 2026-05-21 | T-08-008 | 新增钉钉上级关系自动同步：schema 新增 `managerSource/managerSyncedAt/pendingManagerId`；新建 `sync-manager-relations` 和 `resolve-manager-conflicts` 两个 API；`dingtalk.ts` 新增 `batchFetchManagerUserids()`；`GET /api/admin/users` 新增 `hasPendingManager` 过滤参数；`PATCH` 设置上级时自动标记 `managerSource=manual` 并清除 `pendingManagerId`；`POST` 新建时若有 dingtalkUserId 且未指定上级则自动从钉钉解析；`AdminUsersPage` 新增「同步上级关系」按钮、冲突徽标及冲突处理 Dialog；`docker/crontab` + `docker-compose.yml` + `.env.example CRON_SECRET` | 钉钉上级关系自动同步（每日 cron） |
| 2026-05-22 | T-08-009 | `POST /api/admin/users` 初始密码由固定 `123456` 改为用户工号，与钉钉同步创建逻辑保持一致；前端相关提示文案同步更新 | 统一新建用户初始密码策略 |
| 2026-05-22 | T-08-010 | 编辑 Dialog 新增"管理员权限"开关（仅编辑模式）；PATCH 请求携带 `isAdmin`；编辑自身时开关禁用防意外自我降权 | 管理员可将普通用户设为管理员 |
