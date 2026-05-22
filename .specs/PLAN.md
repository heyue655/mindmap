# 生产化改造执行计划

> 文件路径：`.specs/PLAN.md`
> 创建日期：2026-05-19
> 负责人：AI 编程助手
> 状态说明：⬜ 待执行 | 🔄 执行中 | ✅ 已完成 | ❌ 失败/阻塞

---

## 决策汇总（已确认）

| 项 | 决定 |
|---|---|
| 数据库名 | `mindmap_v2` |
| 数据库地址 | `116.62.129.218:3598`，账号 root/Qq111854 |
| Seed 默认密码 | 工号本身（bcrypt cost=12） |
| ID 映射同步 | PUT 返回 idMap，前端重写 state |
| 空节点过滤 | 服务端 + 前端双重过滤 |
| Reset 权限 | 仅管理员（`User.isAdmin`） |
| 数据持久化 | 方案 A — 全量快照 upsert+delete+idMap |
| 登录认证 | 方案 A — 工号+密码（bcrypt 校验） |

---

## 阶段 1：基础设施

| 状态 | 编号 | 内容 | 完成时间 |
|------|------|------|----------|
| ✅ | 1.1 | 创建 `.env`（DATABASE_URL / JWT_SECRET / JWT_EXPIRES_IN / TZ / NEXT_PUBLIC_USE_API） | 2026-05-19 |
| ✅ | 1.2 | 远程 MySQL 执行 `CREATE DATABASE mindmap_v2` | 2026-05-19 |
| ✅ | 1.3 | `prisma/schema.prisma` 给 `User` 增加 `isAdmin Boolean @default(false)` 字段 | 2026-05-19 |
| ✅ | 1.4 | 执行 `npx prisma db push` 建表 | 2026-05-19 |
| ✅ | 1.5 | 创建 `scripts/sync-db-comments.ts` | 2026-05-19 |
| ✅ | 1.6 | 执行 `npm run db:comments` 同步注释到 MySQL | 2026-05-19 |

---

## 阶段 2：登录认证（工号+密码）

| 状态 | 编号 | 内容 | 完成时间 |
|------|------|------|----------|
| ⬜ | 2.1 | 修复 `src/lib/auth.ts`：`JWT_EXPIRES_IN` 从环境变量读取 | — |
| ⬜ | 2.2 | 重写 `POST /api/auth/login`：`{ employeeNo, password }`、bcrypt 校验、rate limiting | — |
| ⬜ | 2.3 | 重写 `seedWorkspaceIfEmpty`：部门 → 用户（含密码/isAdmin）→ 汇报关系 | — |
| ⬜ | 2.4 | 修改 `src/pages/LoginPage.tsx`：增加密码输入框，提交 `{ employeeNo, password }` | — |
| ⬜ | 2.5 | 创建 `src/middleware.ts`：保护页面路由，无 token 跳 `/` | — |

---

## 阶段 3：数据持久化修复

| 状态 | 编号 | 内容 | 完成时间 |
|------|------|------|----------|
| ⬜ | 3.1 | 重写 `PUT /api/workspace`（拓扑排序 + upsert + 软删除 + 返回 idMap） | — |
| ⬜ | 3.1.1 | └─ 拓扑排序新建实体（MindMap → Node 按 parentId → 其他） | — |
| ⬜ | 3.1.2 | └─ 维护 `idMap: Map<临时ID, 数字ID>` | — |
| ⬜ | 3.1.3 | └─ 服务端过滤空节点（`!title?.trim()`）及其级联引用 | — |
| ⬜ | 3.1.4 | └─ 字符串 ID → INSERT；数字 ID → UPDATE（附带 userId 条件） | — |
| ⬜ | 3.1.5 | └─ DB 存在但快照缺失的用户记录 → 软删除 | — |
| ⬜ | 3.1.6 | └─ 返回 `{ ok: true, idMap: { "n-abc": "12345" } }` | — |
| ⬜ | 3.2 | 修改 `workspaceApi.ts`：`putWorkspace` 返回类型增加 `idMap` | — |
| ⬜ | 3.3 | 修改 `StoreProvider.tsx`（空节点过滤 + applyIdMap + 单飞锁） | — |
| ⬜ | 3.3.1 | └─ 组装 snapshot 前前端过滤空白节点 | — |
| ⬜ | 3.3.2 | └─ 新增 `applyIdMap()` helper，替换所有 state 中的临时 ID | — |
| ⬜ | 3.3.3 | └─ PUT 成功后调用 `applyIdMap` 重写 state | — |
| ⬜ | 3.3.4 | └─ 加单飞锁（`isFlushing` ref + 脏标志） | — |
| ⬜ | 3.4 | `POST /api/workspace/reset`：加 `isAdmin` 权限校验，非管理员返回 403 | — |

---

## 阶段 4：文档与收尾

| 状态 | 编号 | 内容 | 完成时间 |
|------|------|------|----------|
| ⬜ | 4.1 | 更新 `.specs/modules/M-01-auth.md`（密码登录 / rate limiting / middleware） | — |
| ⬜ | 4.2 | 更新 `.specs/modules/M-02-workspace.md`（idMap / 空节点过滤 / 软删除） | — |
| ⬜ | 4.3 | 更新 `.specs/modules/M-07-org.md`（isAdmin 字段 / reset 权限） | — |
| ⬜ | 4.4 | 追加 `.specs/CHANGELOG.md` 本次重构条目 | — |
| ⬜ | 4.5 | 各 SDD 文件末尾追加变更记录表行 | — |

---

## 已识别不在本次执行范围的优化项

| 项 | 说明 |
|---|---|
| Prisma `$use` → `$extends` | v5 废弃警告，当前可用，下次迭代处理 |
| PM2 / Nginx / HTTPS | 运维阶段 |
| 完整审计日志 / IP 白名单 | 后续需求 |
| 登录首次强制改密码 | 后续安全加固 |

---

*最后更新：2026-05-19*
