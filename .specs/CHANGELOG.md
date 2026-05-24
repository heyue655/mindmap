# 变更日志

## [2026-05-24] 修复钉钉同步用户接口性能问题（二次优化）

### 修复
- B-07-002 `sync-users` 4000+ 新用户时 bcrypt 并发 5 需 5-11 分钟导致 504；改为所有新同步用户共用单次哈希（初始密码 `Changeme@1`，`mustResetPassword=true` 强制首次登录改密），bcrypt 从 4152 次降为 1 次
- B-07-002 `sync-users` 离职禁用逐条 `update` 改为单次 `updateMany`，消除 N+1
- B-07-002 `sync-users` 各阶段增加耗时日志（`[阶段N]` 标记），便于定位性能瓶颈
- B-07-002 `createMany` 由单次全量改为每批 500 条，防止 SQL 超长

## [2026-05-24] 修复钉钉组织架构同步 504 超时

### 修复
- B-07-001 nginx `proxy_read_timeout` 仅 60s，钉钉同步耗时超限导致 504；新增专属 location 将钉钉同步接口超时提升至 900s（15 分钟）
- B-07-001 `POST /api/admin/dingtalk/sync-departments` 循环内存在 N+1 DB 查询（每部门各执行 `findUnique`/`findFirst`），改为同步前一次性预加载全量部门至 Map，循环内改为纯内存查找，消除冗余数据库往返


### 修复
- B-07-001 nginx `proxy_read_timeout` 仅 60s，钉钉同步耗时超限导致 504；新增专属 location 将钉钉同步接口超时提升至 300s
- B-07-001 `POST /api/admin/dingtalk/sync-departments` 循环内存在 N+1 DB 查询（每部门各执行 `findUnique`/`findFirst`），改为同步前一次性预加载全量部门至 Map，循环内改为纯内存查找，消除冗余数据库往返

## [2026-05-22] 钉钉SSO登录与链接通知消息

### 新增
- T-07-007 实现钉钉SSO单点登录功能，包含 `/api/auth/dingtalk/callback` 回调接口和 `generateDingtalkAuthUrl` 工具函数
- T-07-008 支持发送带链接的钉钉通知消息，用户可在钉钉中点击跳转到系统页面
- T-07-009 创建 `DingtalkSsoButton` 组件和登录页面，方便用户使用钉钉账号登录
- T-07-010 添加 `/api/health` 健康检查端点，供nginx和服务监控使用
- M-10 新增钉钉集成模块文档 `M-07-DingTalkIntegration.md`

### 变更
- `src/lib/dingtalk.ts` 重构消息发送功能，支持文本和链接两种消息类型
- `pushPendingDingtalkNotifs` 函数扩展支持发送链接消息类型
- 更新 `.env.example` 添加钉钉SSO相关配置说明
- 更新 `.specs/MODULES.md` 注册M-10钉钉集成模块

## [2026-05-22] Docker 一键部署：新增 MySQL 服务 + Dockerfile

### 新增
- T-00-001 `Dockerfile`：三阶段构建（deps / builder / runner），基于 `node:20-alpine`，启用 `output: standalone` 最小化镜像；runner 以非 root 用户运行
- T-00-001 `docker/entrypoint.sh`：启动时执行 `prisma db push --skip-generate` 自动同步 schema，再启动 Next.js
- T-00-001 `next.config.mjs`：新增 `output: "standalone"`，配合 Dockerfile standalone 产物路径

### 变更
- T-00-001 `docker-compose.yml`：新增 `mysql:8.0` 服务（持久化 volume、healthcheck、TZ=Asia/Shanghai）；`app` 服务改为 `depends_on: mysql: condition: service_healthy`；新增 `mysql-data` volume
- T-00-001 `.env.example`：新增 `MYSQL_ROOT_PASSWORD` / `MYSQL_DATABASE`；`DATABASE_URL` 改为指向内部 `mysql` 容器

## [2026-05-22] 指派策略重设计：存储意图，登录时自动 reconciliation

### 变更
- T-05-004 `prisma/schema.prisma`：`Assignment.targetMindmapId` / `targetSkeletonNodeId` 改为 `Int?`（可空）；新增 `timeBucketKind VARCHAR(32)?` 和 `timeBucketValue VARCHAR(32)?`
- T-05-004 `src/types/index.ts`：`Assignment` 接口 `targetMindmapId` / `targetSkeletonNodeId` 改为可选；新增 `timeBucketKind?` / `timeBucketValue?`
- T-05-004 `AssignDialog.tsx`：移除 JIT 初始化块（`ensure-subordinate-mindmap` 调用、`workingMindmaps`/`workingNodes` 副本、`setMindmaps`/`setNodes` merge）；对每个 assignee 无条件创建 assignment，`targetMindmapId`/`targetSkeletonNodeId` 能解析到则填、否则留 `undefined`；始终携带 `timeBucketKind`/`timeBucketValue`；去除"跳过 N 位"提示；`handleSubmit` 改回同步函数
- T-05-004 `PUT /api/workspace`：去除 `if (!targetMindmapDbId || !targetSkeletonDbId) continue` 守卫；允许 `null` 目标字段；INSERT 写入 `timeBucketKind`/`timeBucketValue`
- T-05-004 `GET /api/workspace`：`serializeAssignment` 对 `targetMindmapId`/`targetSkeletonNodeId` null 值返回 `undefined` 而非崩溃；新增 `timeBucketKind`/`timeBucketValue` 序列化；新增 dangling assignment reconciliation 块——过滤 `assigneeId=userId AND targetSkeletonNodeId IS NULL AND state=pending` 的 assignment，按 `timeBucketKind`/`timeBucketValue` 匹配当前用户骨架节点，匹配成功则更新 DB 并同步内存
- T-05-004 `src/lib/assignment.ts`：`BuildNodeOpts` 中 `targetMindmapId`/`targetSkeletonNodeId` 改为 `string | undefined`；`buildResultNode` 防御性处理 undefined
- T-05-004 `InboxPage.tsx`：`handleAccept` / `handleAcceptAdjustment` 调用前判断 `targetSkeletonNodeId`/`targetMindmapId` 是否存在，若缺失则 toast 提示"该任务尚未落地，请刷新后重试"

## [2026-05-22] 管理员可设置其他用户的管理员权限

### 变更
- T-08-010 `AdminUsersPage.tsx`：编辑 Dialog 新增"管理员权限"开关（仅编辑模式显示）；`form` state 新增 `isAdmin` 字段，`openEdit` 自动带出当前值；PATCH 请求携带 `isAdmin`；编辑自身时开关禁用并显示提示，防止意外自我降权
- T-08-010 `PATCH /api/admin/users/[id]`：已支持 `isAdmin` 字段（无需改动），自我降权保护已在后端实现

## [2026-05-22] 新建用户初始密码改为工号

### 变更
- T-08-009 `POST /api/admin/users`：初始密码由固定 `123456` 改为用户工号（与钉钉同步创建用户逻辑保持一致），`mustResetPassword=true` 不变
- T-08-009 `AdminUsersPage.tsx`：创建成功 toast、页面说明文字、Dialog 底部提示均同步更新为"初始密码为工号"

## [2026-05-21] 优化登录时思维导图初始化策略

### 新增
- T-02-008 新建 `POST /api/workspace/ensure-subordinate-mindmap`：上级在 AssignDialog 派任务前，按需为下属 JIT 初始化当年年度导图 + 17 个骨架节点；幂等设计，已存在则直接返回

### 变更
- T-02-008 `GET /api/workspace`：移除在上级登录时批量代创下属年度导图的逻辑（原 lines 281–353）
- T-05-002 `AssignDialog.handleSubmit`：改为 async，指派前检测每个 assignee 是否有匹配年度导图，若无则调用 `ensure-subordinate-mindmap` JIT 创建并 merge 到 store，再执行正常指派流程

## [2026-05-21] 钉钉上级关系自动同步

### 新增
- T-08-008 `prisma/schema.prisma` `User` 新增 `managerSource VARCHAR(16)?`、`managerSyncedAt DateTime?`、`pendingManagerId Int?` 及对应关联字段，新增索引 `@@index([pendingManagerId])`、`@@index([managerSyncedAt])`
- T-08-008 `src/lib/dingtalk.ts` 新增 `batchFetchManagerUserids(userids, concurrency=10)` 函数，并发拉取各用户的 `manager_userid`；`DingtalkUserCandidate` 新增 `managerUserId?` 字段；`getDingtalkUserDetail` 返回值新增 `manager_userid?`
- T-08-008 新建 `POST /api/admin/dingtalk/sync-manager-relations`：双重鉴权（JWT 管理员 或 `x-cron-secret`）；支持 `force=true` 全量刷新；批量拉取钉钉上级并按冲突策略写入；返回 `{ processed, updated, conflicts, skipped }`
- T-08-008 新建 `POST /api/admin/dingtalk/resolve-manager-conflicts`：接受 `actions` 数组，`accept`=应用钉钉上级，`keep`=保留手动设置；事务处理，返回 `{ resolved }`
- T-08-008 `docker/crontab` + `docker-compose.yml`：Alpine cron 容器，每天凌晨 2:00 调用 `sync-manager-relations`，通过内部网络访问应用
- T-08-008 `.env.example` 新增 `CRON_SECRET` 配置项

### 变更
- T-08-008 `GET /api/admin/users` 新增 `hasPendingManager=true` 过滤参数；`USER_SELECT` + `serializeUser` 新增 `managerSource`、`pendingManagerId`、`pendingManager` 字段
- T-08-008 `POST /api/admin/users`：若提供 `dingtalkUserId` 且未手动指定 `managerId`，则自动调用 `getDingtalkUserDetail` 解析上级，写入 `managerSource="dingtalk"`
- T-08-008 `PATCH /api/admin/users/[id]`：手动设置 `managerId` 时自动写入 `managerSource="manual"` 并清除 `pendingManagerId`
- T-08-008 `AdminUsersPage.tsx`：新增「同步上级关系」按钮（`GitMerge` 图标）、冲突数琥珀色徽标、冲突处理 Dialog（逐行选择接受/保持 + 全选快捷按钮）；`AdminUser` 接口新增 `managerSource`、`pendingManagerId`、`pendingManagerName` 字段

### 数据库
- `users` 新增字段：`managerSource VARCHAR(16) NULL`、`managerSyncedAt DATETIME NULL`、`pendingManagerId INT NULL`



### 新增
- T-09-002 `prisma/schema.prisma` `Department` 新增 `dingDeptId INT? @unique` 字段（`///` 注释已更新），执行 `prisma db push` 同步到数据库
- T-09-002 `src/lib/dingtalk.ts` 新增 `fetchDingtalkDeptTree()`：BFS 拉取全量钉钉部门树（`/topapi/v2/department/listsubid` + `/topapi/v2/department/get`），返回 `DingtalkDept[]`
- T-08-007 `src/lib/dingtalk.ts` 新增 `fetchAllDingtalkUsers()`：遍历全部部门分页拉取（`/topapi/v2/user/list`，size=50），按 userid 去重，返回 `DingtalkSyncUser[]`
- T-09-002 新建 `POST /api/admin/dingtalk/sync-departments`（`src/app/api/admin/dingtalk/sync-departments/route.ts`）：管理员鉴权，BFS upsert 部门树（已有 dingDeptId 更新，未有则创建），返回 `{ ok, total, created, updated }`
- T-08-007 新建 `POST /api/admin/dingtalk/sync-users`（`src/app/api/admin/dingtalk/sync-users/route.ts`）：管理员鉴权，全量 upsert 用户（dingtalkUserId→employeeNo fallback），新建账号密码=工号+mustResetPassword=true，不在钉钉的已绑定用户自动 disabled（管理员跳过），返回 `{ ok, total, created, updated, disabled }`

### 变更
- T-09-002 `AdminDepartmentsPage.tsx`：顶部新增「同步钉钉组织架构」按钮（`RefreshCw` 图标，同步中旋转动画）+ `ConfirmDialog` 二次确认，同步完成后刷新列表
- T-08-007 `AdminUsersPage.tsx`：顶部新增「同步钉钉人员」按钮 + `ConfirmDialog` 二次确认，同步完成后刷新列表
- `.env.example`：新增 `DINGTALK_ROOT_DEPT_ID=1` 配置项说明

### 数据库
- `departments` 新增 `dingDeptId INT NULL UNIQUE`（钉钉部门 ID，手动创建部门为 NULL）



### 变更
- T-07-006 `src/lib/dingtalk.ts`：移除 `sendDingtalkWorkMessage`（工作通知 API），新增 `sendDingtalkRobotMessage`（机器人单聊 API `POST /v1.0/robot/oToMessages/batchSend`，msgKey=sampleText）；`pushPendingDingtalkNotifs` 改调新函数；环境变量由 `DINGTALK_AGENT_ID` 改为 `DINGTALK_ROBOT_CODE`；`.env.example` 同步更新

## [2026-05-20] 即时标记通知已读接口

### 新增
- T-07-005 新建 `POST /api/notifications/read`（`src/app/api/notifications/read/route.ts`）：即时将指定通知标记为已读，`updateMany` 附带 `recipientId: userId` 防越权；`src/lib/api/workspaceApi.ts` 新增 `markNotificationsReadApi` 封装；`NotificationsPage.tsx` 的 `markRead` 在 API 模式下同步调用新接口，彻底修复「标记已读后刷新仍出现未读角标」问题

## [2026-05-20] 新建用户表单重排 & 创建接口支持 dingtalkUserId

### 变更
- T-08-006 `AdminUsersPage.tsx`：新建用户 Dialog 姓名字段置首位；输入姓名后 500ms 防抖自动触发钉钉搜索，默认选中第一条候选人（带出工号/邮箱/头像/dingtalkUserId）；编辑模式保持原有手动搜索按钮，不受影响
- T-08-006 `POST /api/admin/users`：接受 `dingtalkUserId` 字段，非空时同时写入 `dingtalkBound: true`；`serializeUser` 已含 `dingtalkUserId` 字段，响应结构与 PATCH 接口保持一致

## [2026-05-20] 钉钉账号绑定改为搜索选人

### 新增
- T-07-004 `src/lib/dingtalk.ts` 新增 `searchDingtalkUsers(name)`：调用 `api.dingtalk.com/v1.0/contact/users/search`（queryWord 参数，x-acs-dingtalk-access-token 请求头），返回 userid 列表；新增 `getDingtalkUserDetail(userid)`：调用 `oapi.dingtalk.com/topapi/v2/user/get`，返回 `DingtalkUserCandidate`（userid/name/jobNumber/email/avatar）
- T-08-005 新建 `GET /api/admin/dingtalk/search?name=xxx`（`src/app/api/admin/dingtalk/search/route.ts`）：鉴权（管理员）+ 调用搜索接口 + 并发查详情，返回候选人列表

### 变更
- T-08-005 `AdminUsersPage.tsx`：编辑 Dialog 中删除手动输入钉钉 ID 的输入框，改为"姓名搜索 + 头像卡片选人"区块；候选人以圆形头像图片+姓名+工号的卡片形式展示，点选后自动将 dingtalkUserId/email/avatar 写入表单，保存时通过已有 PATCH 接口入库（邮箱和头像覆盖已有值）
- T-08-005 `AdminUsersPage.tsx`：用户列表头像渲染兼容：avatar 为 `http` 开头 URL 时用 `<img>` 渲染，否则作为 emoji 文字渲染；Dialog 头像字段展示钉钉头像预览并支持手动清除

## [2026-05-20] 钉钉工作通知集成（dingtalk-notification）

### 新增
- T-07-003 新建 `src/lib/dingtalk.ts`：封装钉钉企业内部应用工作通知 API，含 access_token 模块级缓存（5 分钟提前刷新）、`sendDingtalkWorkMessage()`、`pushPendingDingtalkNotifs()`
- T-07-003 `PUT /api/workspace` 事务提交后 fire-and-forget 推送钉钉工作通知（收集新建 AppNotification，按 recipientId 查 dingtalkUserId 后调用推送；失败静默降级）

### 变更
- T-08-004 `prisma/schema.prisma` User 模型新增 `dingtalkUserId String?` 字段（含 `///` 注释），同步执行 `prisma db push`
- T-08-004 `PATCH /api/admin/users/[id]`：接受 `dingtalkUserId` 字段，非空时自动置 `dingtalkBound=true`，空/null 时置 false；响应新增 `dingtalkUserId` 字段
- T-08-004 `GET /api/admin/users` 及 `POST /api/admin/users`：`serializeUser` 新增 `dingtalkUserId` 序列化
- T-08-004 `AdminUsersPage.tsx`：`AdminUser` 接口新增 `dingtalkUserId?`，编辑 Dialog 新增"钉钉用户 ID"输入框，打开时自动带出当前值（遵循规范 1-3）

### 数据库
- users 表 新增 `dingtalkUserId VARCHAR(128) NULL`（钉钉用户 ID，用于工作通知推送）



### 修复
- B-05-011 `GET /api/workspace` 新增服务端 reconciliation 块：assigner 每次拉取工作区时，自动遍历已接受且含 `assignerSourceNodeId` 的 assignment；若 source 节点尚无 `taskPeer` 则就地升级（写 DB + 更新 mergedNodes）并同步 `assignerMirrorNodeId`；若已有 `taskPeer` 则仅同步进度字段（status/progressPct/deadline/closedAt）；若 result 节点缺少 executorPeer 则补齐（写 assignee 的节点 DB）

### 变更
- B-05-011 `serializeAssignment` 补充 `assignerSourceNodeId` 序列化（此前字段从未写入 GET 响应，assignee 加载时字段丢失）
- B-05-011 PUT handler assignment CREATE 块追加 `assignerSourceNodeId` 持久化（此前字段从未写入数据库）

## [2026-05-20] 派任务 mirror 节点就地升级 & assignerSourceNodeId 记录

### 新增
- T-05-003 `Assignment` 新增 `assignerSourceNodeId` 字段（`prisma/schema.prisma` + `src/types/index.ts`）：记录派任务时上级选中的源节点 ID，便于后续溯源与 mirror 匹配
- T-05-003 `pairNodesForAssignmentMirror` 返回字段重构：返回类型新增 `isUpgrade: boolean` 和 `assignerMirrorNodeId`；`mirror` 字段重命名为 `mirrorNode`；新增就地升级分支——当源节点为纯普通节点（`!task && !taskPeer`）时，直接在原节点上设置 executor/manager TaskPeerLink 互链，无需新建节点
- T-05-003 `AcceptResult` 新增 `updatedNodes: Node[]`：存放就地升级的已有节点；`attachAssignmentMirror` 按 `isUpgrade` 分支将节点写入 `updatedNodes`（升级）或 `newNodes`（新建）
- T-05-003 `InboxPage.tsx` 新增 `applyAcceptResult` 辅助函数：统一处理 `newNodes`（spread append）和 `updatedNodes`（id 匹配 map replace），`handleAccept` / `handleAcceptAdjustment` 均改用该函数

### 变更
- T-05-003 `AssignDialog.tsx`：`handleSubmit` 中若 `presetNode && !presetNode.task && !presetNode.taskPeer` 则写入 `assignerSourceNodeId: presetNode.id`

### 数据库
- assignments 表新增 `assignerSourceNodeId INT NULL`（含 `///` 注释，已同步 schema）

## [2026-05-20] 通知跳转团队视图自动定位成员

### 新增
- T-07-002 NotificationsPage `goTeam(memberId?)` 函数：跳转 `/team` 时携带 `?member=<userId>` 参数；TeamPage 新增 `useEffect` 消费该参数，定位到对应成员 tab 后调用 `router.replace("/team")` 清除 URL（与 MindMapPage `?node=` 模式一致）

## [2026-05-19] 修复通知跳转误入下级导图 & 团队视图排序

### 修复
- B-07-001 点击任务动态通知（task_status_changed / task_progress_updated / task_blocked）时，上级被跳转至下级导图，导致左侧菜单切换为"我的导图"造成错觉；现改为统一跳转 `/team` 团队视图
- B-05-010 团队视图任务列表排序由桶时间升序改为最近更新时间（lastUpdateAt）倒序，无更新记录的以截止日期倒序兜底，最新动态排最前

## [2026-05-19] Next.js 14 全栈迁移 · 初版

### 新增
- T-01-001 认证模块：`POST /api/auth/login`，bcrypt + JWT，首次空库自动 seed
- T-02-001 工作区同步模块：`GET/PUT /api/workspace`，全量快照序列化（INT ID → 字符串）
- T-02-002 工作区重置接口：`POST /api/workspace/reset`，清空当前用户所有关联数据
- T-03-001 组织模块：`GET/PUT /api/org`，部门与汇报关系读写
- T-04-001 思维导图页面：迁移 `MindMapPage.tsx`，`useSearchParams` 适配 Next.js
- T-05-001 任务派发页面：迁移 `TeamPage.tsx`，`useNavigate` → `useRouter`
- T-06-001 工作汇报页面：迁移 `ReportsPage.tsx`，`window.alert` → `toast`
- T-07-001 通知中心页面：迁移 `NotificationsPage.tsx`，`useNavigate` → `useRouter`

### 变更
- T-01-002 登录页面：`useNavigate` → `useRouter`，`alert` → `toast.error`（规范 3-1）
- T-02-003 AppShell 布局：`NavLink/Outlet` → `Link/{children}`，`Navigate` → `router.replace`
- T-02-004 StoreProvider：添加 `"use client"`，`VITE_USE_API` → `NEXT_PUBLIC_USE_API`
- T-02-005 workspaceApi：`import.meta.env.VITE_USE_API` → `process.env.NEXT_PUBLIC_USE_API`

### 基础设施
- 创建 `prisma/schema.prisma`（MySQL，INT 自增主键，UTC+8，全表注释）
- 创建 `src/lib/logger.ts`、`src/lib/withApiLogger.ts`（规范 1-4）
- 创建 `src/lib/prisma.ts`（时区中间件，规范 2-2）
- 创建 `src/lib/auth.ts`（bcrypt cost=12，JWT，规范 4-3）
- 创建 `src/store/toast.ts`、`src/components/ui/toast-provider.tsx`（规范 3-1）
- 创建 `src/components/ui/ConfirmDialog.tsx`（规范 3-1）
- 创建 `src/app/` 路由目录（Next.js 14 App Router 结构）
- 创建 `.env.example`
- 删除 Vite 遗留文件（`vite.config.ts`、`index.html`、`src/main.tsx`、`src/App.tsx`、`src/vite-env.d.ts`、`tsconfig.app.json`、`tsconfig.node.json`）

### 数据库
- 新建 15 张表：users、mindmaps、nodes、assignments、follow_grants、node_shares、task_logs、app_notifications、relationships、calendar_syncs、mention_events、work_reports、departments、org_relations（详见 `prisma/schema.prisma`）

## [2026-05-19] 生产化改造 · 数据库上线 & 认证强化

### 新增
- T-01-004 新增 `src/middleware.ts`：Next.js 路由级 JWT 保护，无 token 跳转登录页，API 路由返回 401
- T-01-005 `seedWorkspaceIfEmpty` 改为从环境变量读取所有凭据（SEED_ADMIN_NO/SEED_ADMIN_PASSWORD/SEED_DEFAULT_PASSWORD），缺失任一则抛错中断，不在代码中写死任何密码
- T-01-003 登录接口改为工号+密码（bcrypt compare）；IP 限流 5 次/分钟（429）；seed 修复 departmentId 硬编码；CEO seed 时 `isAdmin=true`；登录失败统一返回"工号或密码错误"（防枚举）
- T-02-006 PUT /api/workspace 重写：全量 upsert+delete，返回 `idMap`，拓扑排序 INSERT，跳过空白临时节点
- T-02-007 POST /api/workspace/reset 加 `isAdmin` 校验，非管理员返回 403
- T-02-008 StoreProvider：单飞锁（isFlushing/hasDirty）+ applyIdMap 重写 state + 前端空白节点过滤

### 基础设施
- 安装 mysql2；创建远程数据库 `mindmap_v2`（116.62.129.218:3598）
- 执行 `prisma db push` 将 schema 同步到远程 MySQL，15 张表建表成功
- 执行 db:comments 同步脚本，15 张表、150 个字段注释写入 MySQL COMMENT

### 数据库
- users 表新增 `isAdmin BOOLEAN DEFAULT false` 字段（含 `///` 注释，已 db push 同步）

## [2026-05-19] 用户管理 & 部门管理模块上线

### 新增
- T-08-001 用户管理 API：`GET /api/admin/users`（列表）、`POST /api/admin/users`（创建，初始密码 123456）、`PATCH /api/admin/users/[id]`（编辑）、`DELETE /api/admin/users/[id]`（软禁用）
- T-09-001 部门管理 API：`GET /api/admin/departments`（列表）、`POST /api/admin/departments`（创建）、`PATCH /api/admin/departments/[id]`（编辑名称/父部门）、`DELETE /api/admin/departments/[id]`（删除，有用户/子部门时拒绝 409）
- T-08-001 用户管理前端页面：`src/pages/admin/AdminUsersPage.tsx`，路由入口 `src/app/(app)/admin/users/page.tsx`
- T-09-001 部门管理前端页面：`src/pages/admin/AdminDepartmentsPage.tsx`，路由入口 `src/app/(app)/admin/departments/page.tsx`
- AppShell 导航新增"用户管理"（`/admin/users`，UserCog 图标）和"部门管理"（`/admin/departments`，FolderTree 图标）入口，仅 `currentUser.isAdmin=true` 时显示
- 新增模块文档：`.specs/modules/M-08-user-mgmt.md`、`.specs/modules/M-09-dept-mgmt.md`

### 变更
- AppShell 移除旧 `/admin/org` 导航入口，改为独立的用户/部门管理入口
- `src/types/index.ts`：`User` 类型新增 `isAdmin?: boolean` 字段

### 清理
- 待删除旧占位页 `src/app/(app)/admin/org/page.tsx`（已从导航移除，路由失活）

## [2026-05-19] 用户直接上级 & 首次登录重置密码

### 新增
- T-08-002 新建/编辑用户时支持指定直接上级（`managerId`）；下拉列表仅显示 active 用户
- T-08-003 新建用户时自动设置 `mustResetPassword=true`，提示用户首次登录修改密码
- T-01-006 新增 `POST /api/auth/reset-password` 接口：验证新密码（≥6 位且非初始密码），哈希存储，清除 `mustResetPassword` 标记
- T-01-007 新增重置密码页面 `/reset-password`（`src/pages/ResetPasswordPage.tsx`），成功后跳转 `/mindmap`

### 变更
- T-01-008 LoginPage：登录成功后检测 `currentUser.mustResetPassword`，若为 true 跳转 `/reset-password`，否则跳转 `/mindmap`
- T-02-009 AppShell：`mustResetPassword=true` 时强制跳转 `/reset-password`，且不渲染侧边栏（仅渲染内容区）
- `src/types/index.ts`：`User` 新增 `managerId?: string`、`mustResetPassword?: boolean` 字段
- `GET /api/workspace` `serializeUser`：带出 `managerId`、`mustResetPassword` 字段
- `GET/POST /api/admin/users`：序列化带出 `managerId`、`mustResetPassword`
- `PATCH /api/admin/users/[id]`：支持修改 `managerId`（含自引用防护）

### 数据库
- users 表新增 `managerId INT NULL`（自引用外键，直接上级用户 ID，INDEX）
- users 表新增 `mustResetPassword BOOLEAN DEFAULT false`

## [2026-05-19] 稳定性修复 & 规范 3-1 全量整改

### 变更
- T-02-010 AppShell redirect useEffect 新增 `workspaceHydrated` 保护，防止 workspace 尚未加载时 currentUser 为 null 引发误跳转登录页

### 修复
- B-04-001 MindMapPage：将 `handleDelete` 中的 `window.confirm` 替换为 `<ConfirmDialog>`（规范 3-1）
- B-04-002 MindMapPage：将 `openShare`、`openFollow`、`handleAddSummary`、`handleAddBoundary` 中的 `alert` 替换为 `toast.error`（规范 3-1）
- B-05-001 AssignDialog：将派发失败/成功的 `alert` 替换为 `toast.error` / `toast.success`（规范 3-1）
- B-06-001 ReportsPage：删除重复的 `window.alert`（前已有 `toast.error`，误留冗余代码）

## [2026-05-19] 修复直属上级设置后申请关注提示"没有上级"

### 根因
`users.managerId`（管理员面板写入）与 `OrgRelation` 表（`getAllSolidAncestors` 读取）是两套独立数据，设置 managerId 时未同步 OrgRelation，导致关注申请弹窗找不到上级。

### 修复
- B-08-001 `POST /api/admin/users`：创建用户时若指定 managerId，同步创建 `OrgRelation(solid)` 记录
- B-08-002 `PATCH /api/admin/users/[id]`：修改 managerId 时，先删除该用户现有实线上级关系，再按新值创建
- B-05-002 `RequestFollowDialog`：ancestors 合并 OrgRelation + User.managerId 两路来源，去重后展示，作为兜底防止历史数据不一致
- B-05-003 `ShareDialog`：同上，修复分享弹窗"没有上级"问题
- B-08-003 `AdminUsersPage`：保存用户后调用 `refreshWorkspace()`，使当前会话的 `relations` 立即更新

### 新增
- `getAllAncestorsByManagerId(userId, users)` 工具函数（`src/lib/org.ts`）：通过 User.managerId 链向上追溯所有上级

## [2026-05-19] 修复下属在 TeamPage 不可见 & 同意关注 UX 反馈

### 根因
`isManager` / `getAllSolidDescendants` 仅读 OrgRelation，历史数据中 OrgRelation 可能缺失，导致：
1. AppShell "团队视图" 导航项对实际管理者隐藏
2. TeamPage `allMembers` 为空，下属任务不可见
3. MindMapPage "派任务" 按钮对实际管理者隐藏
4. InboxPage 同意关注请求时无任何 toast 反馈（成功/失败）

### 修复
- B-03-001 `src/lib/org.ts`：新增 `getAllDescendantsByManagerId(userId, users)` 函数，沿 User.managerId 链向下 BFS 遍历所有下属
- B-03-001 `src/pages/TeamPage.tsx`：`allMembers` useMemo 合并 `getAllSolidDescendants`（OrgRelation） + `getAllDescendantsByManagerId`（managerId链），去重后展示；isDirect 同步考虑 managerId 直属关系
- B-03-001 `src/components/AppShell.tsx`：`userIsManager` 增加 `users.some(u => u.managerId === currentUserId)` 兜底；useStore 解构增加 `users`
- B-03-001 `src/pages/MindMapPage.tsx`：`userIsManager` 增加相同 managerId 兜底
- B-05-004 `src/pages/InboxPage.tsx`：`decideFollow` 增加 toast 导入；pair 成功时 `toast.success("已同意关注，副本已添加到你的导图")`；pair 为 null 时 `toast.success("已同意关注")` + `toast.info("未能在你的导图中创建副本（骨架节点不匹配）...")`

## [2026-05-19] 修复关注审批副本创建失败 & TeamPage 下属任务不显示

### 根因
`GET /api/workspace` 仅加载当前用户自有的 mindmaps/nodes（`ownerId = userId`）。上级审批关注申请时，下级节点（`target`）不在上级的 `nodes` 状态中，导致：
1. `pairNodesForFollowGrant` 中 `target = undefined` → 返回 null → 无法创建副本，只能触发 toast.info 降级路径
2. TeamPage `memberMapIds` 正确，但 store 中无下级节点数据，下属任务栏始终为空

### 修复
- B-05-005 `src/app/api/workspace/route.ts`：`getHandler` 在加载自有数据后，额外收集跨用户节点 ID（FollowGrant.targetNodeId 其中 granteeId=userId 含 pending 状态；Assignment.resultNodeId 其中 assignerId=userId），查询其所属导图（排除自有），并发加载 extraMindmaps / extraNodes / extraRelationships / extraLogs，以 id 去重合并后写入 snapshot。日志新增额外加载数量统计。

## [2026-05-19] 修复派任务界面无法带出下属

### 根因
`AssignDialog` 的 `directReportIds` 和 `allReportIds` 仅调用 `getDirectReports` / `getAllAssignTargets`（均只读 OrgRelation），未走 `User.managerId` 兜底链路，历史数据中 OrgRelation 缺失时下属列表为空。

### 修复
- B-05-006 `src/features/assignment/AssignDialog.tsx`：引入 `getAllDescendantsByManagerId`；`directReportIds` useMemo 合并 OrgRelation 直接下属 + `users.filter(u => u.managerId === currentUserId)`；`allReportIds` useMemo 合并 `getAllAssignTargets` + `getAllDescendantsByManagerId`，两路均去重，与 TeamPage / AppShell 修复保持一致。

## [2026-05-19] 修复"派出"按钮点击无效

### 根因
`mindmapForAssigneeBucket` 需要在 `mindmaps` 中找到 `ownerId === assigneeId` 的导图，但 `GET /api/workspace` 只加载当前用户自有导图，以及已有 FollowGrant/Assignment 关系的跨用户导图。首次派任务时，下属既没有 FollowGrant 也没有 Assignment，其 mindmap 和骨架节点不在 store 中，导致所有 assignee 被跳过，`newAssignments.length === 0`，`toast.error` 或按钮因 title 为空而 disabled。

### 修复
- B-05-007 `src/app/api/workspace/route.ts`：在跨用户加载之后新增"下属骨架数据加载"块：通过 `users` 数组 BFS 遍历 `User.managerId` 链，找到所有直/间接下属 ID；加载其全部 mindmap；再加载这些 mindmap 中的 `nodeType = "skeleton"` 节点（轻量）；三路合并到 `mergedMindmaps` / `mergedNodes`（以 id 去重，自有数据优先）。日志新增下属骨架加载数量统计。

### 影响
- 上级加载工作区后，下级节点已在 `nodes` 状态中，`pairNodesForFollowGrant` 可正确执行，审批关注后副本创建成功
- TeamPage 下属任务数据正常显示
- PUT /api/workspace 写权限不变（跨用户节点无 `ownerId=userId` 匹配，不会被误写）
- 前端 `canRead` 权限过滤不变，额外数据不越权暴露

## [2026-05-19] 修复派出无匹配骨架节点 & 修复 PUT 数据污染

### 根因 B-05-008
下属若从未登录，其名下没有年度导图和骨架节点。管理者加载工作区后 `subMindmaps` 为空，`mindmapForAssigneeBucket` 找不到骨架节点，所有 assignee 被跳过，`toast.error("所有目标人都没有匹配的骨架节点...")`。

### 修复 B-05-008
- `GET /api/workspace` 加载 `subMindmaps` 后，遍历 `subordinateIds`：对没有当前年度 `useAnnualTemplate` 导图的下属代为创建年度导图、12 个月骨架节点、4 个季度骨架节点（逻辑与当前用户自动初始化一致，`createdBy = subId`）。随后的 `subSkeletonNodes` 查询即可取到新建的骨架节点。

### 根因 B-05-009
`PUT /api/workspace` 的节点软删除和联系线删除两步缺少所有权约束：
- 节点软删除：`snapMindmapIds` 包含下属导图 ID，下属的 task 节点（非 skeleton）不在快照中，也不在 `snapNodeIds` 里，每次管理者保存工作区都会被误标 `isDeleted`，造成下属数据损坏。
- 联系线删除：`snapMindmapIds` 含下属导图 ID，下属联系线不在 `snapRelIds` 中，会被 `deleteMany` 误删。

### 修复 B-05-009
- 节点软删除 `where` 新增 `mindmap: { ownerId: userId }` 约束（Prisma 关联字段过滤），确保只软删自己导图中的节点。
- 联系线删除 `where` 新增 `createdBy: userId` 约束（`Relationship` 无 `mindmap` 关联，改用创建者字段过滤），只删自己创建的联系线。
- TypeScript 零错误。
