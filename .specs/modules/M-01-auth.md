# M-01 认证与授权

**状态：ACTIVE**

## 概述

处理用户登录（工号 + 密码）、JWT 颁发与验证，以及路由级身份保护。首次空库时自动执行 `seedWorkspaceIfEmpty`，将 `mock/org.ts` 数据写入 MySQL，CEO 账号设为 `isAdmin=true`，默认密码=工号。

## 数据模型

使用 `users` 表（见 `prisma/schema.prisma`）。

| 字段 | 说明 |
|------|------|
| id | INT 自增主键，API 层序列化为字符串 |
| employeeNo | 工号（登录唯一凭证） |
| passwordHash | bcrypt 哈希（cost=12），默认密码=工号 |
| isAdmin | 是否管理员（seed 时 CEO 为 true） |
| managerId | 直接上级用户 ID（INT NULL，自引用外键） |
| mustResetPassword | 是否需要首次重置密码（新建用户时 = true） |
| status | active / inactive |

## API 接口

### POST /api/auth/login

- 入参：`{ employeeNo: string, password: string }`
- 出参：`{ token: string }`（JWT，有效期由 `JWT_EXPIRES_IN` 环境变量控制，默认 24h）
- 权限：无需认证
- 规范：`withApiLogger` 包裹；`password` 字段自动掩码为 `***`；IP 维度限流 5 次/分钟（返回 429）

### POST /api/auth/reset-password

- 入参：`{ newPassword: string }`（≥6 位，且不得为初始密码 `123456`）
- 出参：`{ ok: true }`
- 权限：需要登录（`getAuth(req)` 校验 JWT）
- 业务：bcrypt 哈希存储，清除 `mustResetPassword=false`

## 业务逻辑

1. 按 `employeeNo` 查 `users` 表
2. 若库为空，触发 `seedWorkspaceIfEmpty`：
   - 从 `.env` 读取 `SEED_ADMIN_NO`、`SEED_ADMIN_PASSWORD`、`SEED_DEFAULT_PASSWORD`，任一缺失则**抛错中断**，拒绝写入数据库
   - 按 `mock/org.ts` 写入部门 + 10 个用户 + 汇报关系
   - CEO（`u-ceo`）的工号替换为 `SEED_ADMIN_NO`，密码使用 `SEED_ADMIN_PASSWORD`，`isAdmin=true`
   - 其余 9 个用户密码统一使用 `SEED_DEFAULT_PASSWORD`
3. 用 `bcrypt.compare(password, passwordHash)` 校验密码；失败统一返回 `"工号或密码错误"`（防用户枚举）
4. 签发 JWT（payload：`{ sub: "<数字 id>" }`）；有效期从 `JWT_EXPIRES_IN` 读取
5. 限流：`Map<ip, {count, resetAt}>` 内存滑动窗口，60 s 内超 5 次返回 429

## 前端组件

- `src/pages/LoginPage.tsx`：工号 + 密码表单；`useApi=true` 时显示密码输入框；登录成功后若 `mustResetPassword=true` 跳转 `/reset-password`，否则跳转 `/mindmap`
- `src/pages/ResetPasswordPage.tsx`：首次登录强制修改密码页面；验证长度 ≥6 且非 `123456`；调用 `POST /api/auth/reset-password` 后 `refreshWorkspace()` 并跳转 `/mindmap`
- `src/middleware.ts`：Next.js Middleware 拦截所有非 `/` 路由，无 JWT Cookie 跳转登录页；API 路由返回 401

## 变更记录

| 日期 | 编号 | 变更内容 | 原始需求 |
|------|------|----------|----------|
| 2026-05-19 | T-01-001 | 创建登录接口，bcrypt + JWT，自动 seed | Next.js 迁移 |
| 2026-05-19 | T-01-002 | LoginPage 迁移至 Next.js，alert → toast | 规范 3-1 |
| 2026-05-19 | T-01-003 | 改为工号+密码登录；bcrypt cost=12；IP 限流；seed 修复 departmentId；CEO isAdmin=true | 生产化改造 |
| 2026-05-19 | T-01-004 | 新增 src/middleware.ts，路由级 JWT 保护 | 生产化改造 |
| 2026-05-19 | T-01-005 | seedWorkspaceIfEmpty 改为从环境变量读取所有凭据（SEED_ADMIN_NO/SEED_ADMIN_PASSWORD/SEED_DEFAULT_PASSWORD），缺失任一则抛错中断 seed | 禁止代码写死凭据 |
| 2026-05-19 | T-01-006 | 新增 POST /api/auth/reset-password；bcrypt 哈希，清除 mustResetPassword | 首次登录重置密码 |
| 2026-05-19 | T-01-007 | 新增 ResetPasswordPage，验证长度/初始密码，成功跳转 /mindmap | 首次登录重置密码 |
| 2026-05-19 | T-01-008 | LoginPage 登录后检测 mustResetPassword，跳转 /reset-password；AppShell 强制重定向并隐藏侧边栏 | 首次登录重置密码 |
