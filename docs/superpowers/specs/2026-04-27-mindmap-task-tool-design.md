# 思维导图式任务计划管理工具 — 设计文档

> 版本：**v2.3**（2026-04-28：甘特图视图 + 任务甘特字段 + 工具栏精简 + 交接打包说明对齐）  
> 日期：2026-04-27（正文）；§12 增补 2026-04-28；**v2.3 修订 2026-04-28**  
> 状态：原型设计稿（**可交互前端 + 可选本地/PostgreSQL API** + 企业目标架构说明）

## 0.0 v2.0 / v2.1 / v2.2 / v2.3 变更摘要

**v2.3（2026-04-28）** — 导图内任务的时间管理视图与交接物更新：

- **甘特图视图（MindMapGantt）**：工具栏新增「甘特图」，与「思维导图」「大纲」并列切换。仅展示当前导图中 **`Node.task` 非空** 的节点；行顺序与树层级一致，支持父行折叠子任务。
- **条形语义**：无子任务（或子树中无其它任务节点）的节点为 **任务条**（主题色）；若存在子任务，父节点为 **汇总条**（紫色聚合区间，区间 = 自身与子树内所有任务节点的最早开始～最晚结束）。汇总行在甘特表左侧 **只读**（日期/时长由子任务推导）；叶子任务行可编辑 **开始日期** 与 **时长（天）**。
- **任务字段扩展（TaskFields）**：可选 `ganttStart`（`YYYY-MM-DD`）、`ganttDurationDays`（正整数，天数）。未设置时甘特条仍可由 `deadline`、`openedAt` 等推导（规则见前端 `src/lib/ganttFromMindmap.ts` 中 `ownTaskRange`）。编辑甘特表时同步更新 `deadline` 为「开始 + 时长 − 1 日」，便于与日历、派出列表一致。**后端持久化**需在节点 JSON / `task` 子对象中预留并回传上述字段。
- **工具栏**：移除原 **Pitch / ZEN** 占位按钮，避免与当前产品范围混淆。
- **交接**：设计文档 + 前端源码可打 **`mindmap-docs-and-frontend.zip`**（见根目录 `HANDOFF.md`、`docs-pack-README.txt`）；接 API / 钉钉仍需完整仓库含 `server/`。

**v2.2（2026-04-28）** — 与当前仓库工程状态对齐（产品设计阶段可结束交接，研发续作见 `HANDOFF.md`）：

- **可选后端**：Fastify API；无 `DATABASE_URL` 时为 **SQLite** 工作区快照，有则为 **PostgreSQL** 多租户（`tenants`、`workspace_snapshots`、`dingtalk_user_map` 等）。前端通过 `VITE_USE_API` 切换远程工作区与 `/api` 代理。
- **钉钉（配置 `DINGTALK_APP_*` 后）**：免登 `code` 换票、通讯录 **department 树**同步（`mock:false`）、工作通知 **asyncsend_v2**、**钉钉日程创建/更新**（负责人点「重新同步」经 `POST /api/integrations/dingtalk/calendar/push`）、日历 Webhook **completed 回写任务**（可选机器人式 **timestamp/sign** 验签）。未配置凭证时通知/日历仍为 **mock 或 501**，行为见 `.env.example` 与 `docs/superpowers/plans/2026-04-28-enterprise-milestones.md`。
- **工作汇报**：侧栏「工作汇报」根据导图/任务活动生成**周/月/季**草稿（演示为规则模板，可接 LLM）；提交上级并 @ 同事写入通知中心。
- **交付物**：根目录 **`HANDOFF.md`**（研发交接）；**静态前端演示包** `npm run build:static-demo`（不接 API、哈希路由、相对路径，便于 U 盘/网盘分发）；**设计文档 + 前端源码** 见 `HANDOFF.md` **§2.B** 生成 `mindmap-docs-and-frontend.zip`（v2.3 起含甘特与 `TaskFields` 扩展说明）。

**v2.1（2026-04-28）**：新增 **§12 企业内部署与钉钉一体化（目标架构）**——描述阿里云部署、钉钉组织/账号、千人规模、个人导图隔离、派任务/关注/@、钉钉日历提醒与回写等与产品规则的对齐方式（工程实现仍分阶段推进）。

**v2.0（2026-04-27）** 相对 v1.0，新增/调整以下能力（已在原型中全部实现）：

1. **XMind 风格的思维导图**：保留原有"年度计划"模板的同时，新增 3 种结构（中心放射、向右逻辑、组织架构）、3 套主题（雪刷/商务/极简）、概要 / 边界 / 联系线 / 浮动主题等 XMind 核心特性。
2. **任务标记系统**（XMind markers）：标签 / 优先级 / 进度 / 旗帜 / 星标 / 人员 / 符号七大类预设图标，画布上节点直接显示，详情抽屉里可批量勾选。
3. **右侧 Dock 抽屉**：原"模态详情抽屉"重构为常驻、可切 tab 的右侧侧边栏，三个 tab——任务详情 / 标记面板 / 派出列表，参考 XMind 多面板交互。顶部「标记」「派出」按钮即开即关。
4. **派出列表（Assigned-Out）**：管理者视角下专门的 tab，列出自己派给所有下属的任务，按"待接受 / 调整中 / 进行中 / 已完成"分组，下级进度自动同步。
5. **任务进度同步通知**：状态/进度变更时，自动给派任务方、所有 granted 关注者、所有 NodeShare 受众下发"任务动态"类通知。
6. **日历集成**：每条任务同步到 owner 绑定的 Mac / 钉钉 / Google 日历 — **Mac/Google 仍为 mock**；**钉钉**在 API 模式且配置开放平台凭证时，可由服务端 **创建/更新钉钉日程**（见 §12.7）；外部勾完成可单向回写（原型按钮 mock + **Webhook 真回写**见工程）。
7. **@ 提及**：节点标题、描述、笔记、日志评论里 `@姓名` 都能弹出选择器。**标题里 @ = 派任务（轻量）**，其它位置 = 拉讨论；被 @ 的人通过 NodeShare 自动获得节点的读权限，并收到通知（含"已推钉"徽章）。
8. **通知中心扩展**：新增「@ 提及」「日历」分类筛选，通知卡片支持显示"已推钉"和"日历来源"徽章。
9. **滚动 / 跳转优化**：右侧详情过长时局部滚动，header/tabs/底部操作固定；通知点击通过 URL `?node=&tab=` 自动选中节点并打开抽屉。
10. **工作汇报（AI 辅助）**：根据本人导图节点更新、任务状态、日志与派任务记录，自动生成**周报 / 月报 / 季报**草稿（演示为模板汇总，可替换为真实大模型）；可编辑后**提交直属上级**，并 **@ 多选同事** 推送通知（`report_submitted` / `report_shared`）。
11. **术语**：所有"派单"统一为"派任务"；所有"议价"统一为"调整"。

---

## 0. 文档目的与范围说明

本文档描述一款「基于公司组织架构、以个人思维导图为载体、支持上下级协同」的任务计划管理工具的完整产品设计。

**重要约束（原型阶段）**：主交付物为**可交互前端**；数据默认 mock / `localStorage`。开启 **`VITE_USE_API`** 且运行 `server/` 时，工作区与组织等可走 **SQLite 或 PostgreSQL 持久化**（仍可为演示级单租户共享快照，非生产「每人独立库」）。

**企业级目标**：若需**单企业内部署、几千员工、钉钉组织与日历**，见本文 **§12 企业内部署与钉钉一体化（目标架构）**——该节描述与原型一致的**产品能力如何在阿里云 + 钉钉开放平台上落地**，不替代正式立项时的安全评审与接口联调。

技术栈（前端）：React + TypeScript + Tailwind CSS + shadcn/ui + Vite。

---

## 1. 产品定位

一款基于公司组织架构的、以个人思维导图为载体、上下级协同的目标—任务管理工具，强调「**个人计划私密性 + 上下级任务透明性**」的平衡。

### 1.1 用户角色

| 角色 | 描述 |
|------|------|
| 员工 | 默认角色，管理自己的年/季/月/周目标和任务 |
| 管理者 | 拥有下属的员工，额外可派任务、查看团队 tab、审批关注请求 |
| 管理员 | IT/HR，维护组织架构、SSO、系统配置（原型用 mock 演示） |

### 1.2 核心价值主张

- **思维导图作为目标载体**：契合人脑分解目标的自然方式
- **私密 + 透明的双层模型**：下级保留思考空间，上级只看必要信息
- **派任务只到骨架**：上下级协作有清晰的"接驳点"，避免信息洪流
- **调整而非拒绝**：尊重组织层级现实，但保留下级表达空间

---

## 2. 核心需求决策（13 项）

| # | 主题 | 决策 |
|---|------|------|
| 1 | 部署形态 | 单公司内部部署 |
| 2 | 组织架构 | 树状为主 + 虚线汇报支持 |
| 3 | 思维导图结构 | 完全自由编辑 |
| 4 | 时间维度承载 | 系统默认骨架（年→季→月→周）+ 自由节点；派任务只打骨架节点 |
| 5 | 上级看下级范围 | 默认只看「已派任务 + 下级主动分享」；不可见完整导图 |
| 6 | 派任务工作流 | 下级可接受 / 请求调整（deadline/拆分/转派），不可直接拒绝 |
| 7 | 任务更新粒度 | 状态 + 进度 + 日志时间轴（文本+附件） |
| 8 | 客户端 | Web + 移动响应式（无原生 App） |
| 9 | 通知触达 | 站内通知 + 每日/每周邮件摘要 |
| 10 | 认证 / 组织来源 | SSO/LDAP + HR 系统同步（原型用 mock 替代） |
| 11 | 派任务目标范围 | 跨层派给所有下属，中间层可见 |
| 12 | 关注申请 | 单任务 / 节点子树两种粒度 |
| 13 | 团队总览 | 成员 tab，每个 tab 显示「与我相关的任务集」 |

---

## 3. 系统架构

### 3.1 模块划分

完整产品蓝图按 7 大模块组织。**模块是逻辑上的 UI/状态组织单元，并非数据实体的物理拆分**——多个模块可能共享同一个 Node 数据实体，只是关注的字段和操作不同。原型阶段在前端实现 1–5 模块的纯前端版本，6、7 模块仅在文档与 mock 数据层面体现。

| # | 模块 | 职责 | 原型实现 |
|---|------|------|----------|
| 1 | auth-org | 身份与组织关系 | mock 用户表 + 身份切换器 |
| 2 | mindmap-core | 节点结构、骨架生成、画布渲染、3 种结构 + 3 套主题、布局算法 | 完整 |
| 2b | xmind-extras | 概要 / 边界 / 联系线 / 浮动主题 / 主题切换 / 大纲视图 / **甘特图视图** | 完整 |
| 3 | task | 任务字段交互、日志时间轴 UI、XMind 风格标记面板 | 完整 |
| 4 | collaboration | 派任务/调整/关注/分享/@ 提及 工作流 | 完整 |
| 5 | view | 个人导图 + 团队 tab + 右侧 Dock + 派出列表 | 完整 |
| 6 | notification | 站内通知 + 钉钉推送（mock）+ 邮件摘要 | 站内 + **钉钉：未配凭证 mock；配凭证可走工作通知 API** |
| 6b | calendar | Mac / 钉钉 / Google 日历同步与回写 | **Mac/Google mock**；**钉钉：API 模式下可写真实日程 + Webhook 回写**（见 §12.7 / 里程碑 M4） |
| 7 | admin | 组织管理后台 | 简化为只读组织树展示 |

### 3.2 模块依赖关系

```
auth-org
   ↓
mindmap-core ── task
       ↓        ↓
   collaboration
       ↓
     view ── notification
                 ↑
              (admin)
```

- `auth-org` 提供「我是谁、我的实线/虚线上级、我的下属是谁」的查询接口
- `collaboration` 是协调者，跨模块写入 mindmap-core / task / notification
- `view` 是只读层，按权限计算「谁能看到什么」

### 3.3 前端项目结构（实际目录）

```
src/
  components/        共享 UI 组件（基于 shadcn）
  features/
    mindmap/         思维导图画布、节点、连线、布局算法、工具栏、大纲视图、甘特图（MindMapGantt、ganttFromMindmap）
    task/            任务字段、日志时间轴、右侧 Dock 抽屉
    markers/         XMind 风格标记（图标库 + 选择面板）
    assignment/      派任务对话框
    sharing/         分享 / 申请关注对话框
    mention/         @ 提及组件（picker / textarea / input / 渲染器）
  pages/             登录、我的导图、团队、待办、通知、设置、组织
  mock/              mock 数据（用户、组织、节点、任务、通知、日历同步、提及）
  types/             TypeScript 类型定义
  lib/
    permission.ts    canRead / canWrite
    notify.ts        collectTaskUpdateRecipients
    assignment.ts    acceptOriginal / acceptAdjustment / insistOriginal
    calendarSync.ts  reconcileNodeCalendarSyncs / simulateCalendarCompletion
    mention.ts       parseMentions / tokenizeMentions / detectActiveMention
    mentionEffects.ts buildMentionsForSubmit（@ 触发的事件 + 通知 + 自动分享）
    org.ts           组织结构遍历（getAllSolidDescendants 等）
    id.ts            短 id 生成
  store/
    StoreProvider.tsx 全局 Context + localStorage 持久化（schema = mindmap-prototype-v6）
```

---

## 4. 数据模型

### 4.1 实体关系图

```
User ─┬─< OrgRelation >─ User    (实线/虚线上下级)
      │
      └──< MindMap (1:N，v2 起含 structure/theme/年度模板)
            │
            └── Node ──< Node (parent_id, 自引用)
                  │
                  ├──< TaskFields (可选 1:1)
                  │       ├──< TaskLog (1:N)
                  │       └──< Attachment (1:N)
                  │
                  ├──< Assignment (派任务工单)        ──> 通知 / 派出列表
                  ├──< FollowGrant (关注授权)         ──> 上级可见性
                  ├──< NodeShare (主动分享 / @ 自动建) ──> 任意可见性
                  ├──< Relationship (联系线，跨分支)
                  ├──< CalendarSync (Mac/钉钉/Google) ──> 双向同步
                  └──< MentionEvent (@ 提及历史)      ──> 钉钉推送
```

### 4.2 实体字段（前端类型定义视角）

```ts
// User（v2 扩展：钉钉绑定 + 已连接的外部日历）
{ id, employeeNo, name, email, avatar, departmentId,
  jobTitle, status: 'active'|'disabled',
  dingtalkBound?: boolean,
  connectedCalendars?: ('mac'|'dingtalk'|'google')[] }

// OrgRelation：取代单一 manager_id 以支持虚线汇报
// solid 关系一般 effectiveTo=null（直至调岗/离职）；dotted 关系强制带 effectiveTo
{ id, subordinateId, managerId,
  relationType: 'solid'|'dotted',
  effectiveFrom, effectiveTo? }

// MindMap：每个用户每年一张 + XMind 风格的可切换结构/主题
{ id, ownerId, year,
  structure: 'mindmap'|'right-logic'|'org-chart',  // 中心放射 / 向右逻辑 / 组织架构
  theme: 'snowbrush'|'business'|'mono',            // 雪刷 / 商务 / 极简
  useAnnualTemplate?: boolean }                    // true 时启用 12 月 + 季度括号

// Node：核心实体（节点即任务，统一模型，v2 扩展 XMind 字段）
{ id, mindmapId, parentId, sortOrder,
  title, description,
  notes?: string,                       // XMind 笔记
  labels?: string[],                    // XMind 标签 chip
  hyperlink?: string, image?: string,
  markers?: string[],                   // XMind 标记 id 集合（priority/progress/star/...）
  summaryRange?: NodeId[],              // 「概要」节点：所覆盖的同级节点 id 列表
  boundaryRange?: NodeId[],             // 「边界」节点：所圈出的同级节点 id 列表
  isFloating?: boolean,                 // 浮动主题（不属于任何 parent，自由放置）
  floatX?: number, floatY?: number,
  nodeType: 'skeleton'|'normal',
  timeBucketKind: 'year'|'quarter'|'month'|'week'|null,
  timeBucketValue: '2026'|'2026Q1'|'2026-03'|'2026-W12'|null,
  createdBy, createdAt, updatedAt,
  isDeleted, deletedAt,
  // 可选任务字段（节点是否"是任务"由这里是否非空决定）
  task?: TaskFields }

// Relationship：联系线（两个节点之间的虚连接，跨分支）
{ id, mindmapId, fromId, toId, label?, createdBy, createdAt }

// TaskFields（v2.3：甘特图专用可选字段，后端需与前端一致持久化）
{ status: 'not_started'|'in_progress'|'done'|'blocked',
  progressPct: 0..100,
  priority: 'P0'|'P1'|'P2'|'P3',
  deadline,
  ownerId,
  estimatedHours?, actualHours?,
  openedAt, closedAt?,
  ganttStart?,              // 'YYYY-MM-DD'，甘特条起点；未设则回退 openedAt 日期部分
  ganttDurationDays? }      // 正整数，持续天数；未设则与 deadline 或默认 7 日窗口推导

// TaskLog
{ id, nodeId, authorId,
  logType: 'status_change'|'progress_change'|'comment'
         |'attachment_added'|'assignment_event',
  contentText, contentMeta,   // 旧值/新值等结构化信息
  createdAt }

// Attachment
{ id, nodeId, logId?, fileName, fileUrl, fileSize, mimeType,
  uploadedBy, uploadedAt }

// Assignment：派任务工单（独立工作流实体）
{ id, assignerId, assigneeId,
  targetMindmapId, targetSkeletonNodeId,
  proposedTitle, proposedDescription, proposedDeadline, proposedPriority,
  state: 'pending'|'accepted'|'negotiating'|'adjusted'|'rejected_by_system',
  resultNodeId?,                  // 接受后落地的节点 id
  adjustmentRequest?,             // 调整内容（新 deadline / 拆分 / 转派目标）
  createdAt, resolvedAt? }

// FollowGrant：关注授权（下级 → 上级）
{ id, requesterId, granteeId,
  targetNodeId, scope: 'single_task'|'subtree',
  state: 'pending'|'granted'|'denied'|'revoked'|'expired',
  expiresAt, createdAt, decidedAt? }

// NodeShare：主动分享（下级 → 上级，无需审批）
{ id, sharerId, audienceId, nodeId,
  createdAt, revokedAt? }
// 注：v2 扩展—— @ 提及他人时若对方对该节点暂无可见性，
// 自动补一条 NodeShare（sharerId=发起人, audienceId=被 @ 人）。

// CalendarSync：单条任务-日历的同步状态（一对多 provider）
{ id, nodeId, userId,                     // userId = 节点 owner
  provider: 'mac'|'dingtalk'|'google',
  externalEventId,                       // mock 用 nodeId+provider 生成
  syncedTitle, syncedDeadline, syncedStatus,
  externalCompleted: boolean,             // 外部日历勾完成 → true
  status: 'synced'|'pending'|'failed',
  syncedAt, lastError? }

// MentionEvent：@ 提及历史
{ id, nodeId, byUserId, mentionedUserId,
  kind: 'assign'|'discuss',               // 标题=assign / 描述/笔记/日志=discuss
  text,                                    // 原始文本
  createdAt, dingtalkPushedAt? }
```

### 4.3 节点类型与任务字段的关系

- 节点统一模型：`Node` 实体覆盖所有节点。
- 是否「是任务」：由 `Node.task` 是否非空判断。
- 骨架节点（`nodeType=skeleton`）永远不带 `task`，仅作时间容器。
- 普通节点（`nodeType=normal`）可以是「概念节点」（无 `task`）或「任务节点」（有 `task`）。

---

## 5. 权限模型

### 5.1 基本规则

权限计算的最小单位是「**某用户对某节点的 read / write 能力**」。

**优先级从高到低**：

1. **Owner**：节点所属 MindMap 的 owner → `read+write`。
2. **下级对自己导图**：写自己所有节点；唯一例外是骨架节点的标题/时间标签由系统持有。
3. **上级对下级**：在以下情况之一获得 `read`，**永不**获得 `write`：
   - **派任务可见**：节点是某 `Assignment.resultNodeId` 且当前用户是 `assignerId`，或处在 assigner→assignee 的实线链路上（中间层可见）；
   - **主动分享**：存在 `NodeShare(audienceId=当前用户, nodeId=该节点)`；
   - **关注授权**：存在 `FollowGrant(granteeId=当前用户, state='granted')` 且节点 = `targetNodeId` 或在其子树中（当 `scope='subtree'`）；
4. **管理员**：拥有读所有节点的能力，仅用于审计/组织管理后台，不参与日常视图。

> **下级永远不可见上级导图**：MVP 不开放上级 → 下级分享。

### 5.2 派任务的特殊写权限

- 上级对下级骨架节点的"派任务"，本质是创建 `Assignment` 工单；
- 工单 `accepted` 后，**前端逻辑代下级**自动在指定骨架下创建该节点（在真实后端版本里这是服务端事务，原型里就是前端 store 的一次写入）；
- 下级随后对该节点拥有正常的 `write`。

### 5.3 关注授权的级联范围

- `scope='single_task'`：只对 `targetNodeId` 自身可见，子节点不可见。
- `scope='subtree'`：对该节点及所有当前与未来后代节点可见；下级在子树下新增节点会自动进入上级视野。

### 5.4 实线 vs 虚线上级权限

实线和虚线上级在「**对单一节点的可见性判定**」上规则等同（同样可派任务、可被授权关注、可接收主动分享）。两者差异：
- 虚线关系强制带 `effectiveTo`，过期后自动失去上级身份；实线关系仅在调岗/离职时由 HR 同步终止。
- **中间层可见的传播链路只沿实线链路传递**——派任务跨层时，只有实线中间层会自动获得可见权，虚线中间层不会。

---

## 6. 关键流程

### 6.1 派任务流程

```
触发：上级在「成员 tab」或「下级骨架节点」点「派任务」
   ↓
Step 1  上级填写：
        - 选择目标下属（直接或跨层下级，可多选）
        - 选择时间桶：默认派到「当月」，可切到任意月或季度
          → 系统按 (assignee, kind, value) 自动定位每位下属对应的骨架节点
        - 标题、描述、deadline、优先级
        - [可选] 拆分为多条 → 每条独立成 Assignment
   ↓
Step 2  创建 Assignment(state='pending') → 通知下级
   ↓
Step 3  下级在「待我处理」页响应：
        ├── 接受 → state='accepted' → 系统在指定骨架下创建节点 + TaskFields
        │            → resultNodeId 回写 → 通知上级 + 中间层管理者
        └── 请求调整 → state='negotiating'
                       ├── 调整 deadline
                       ├── 拆分为多个子任务
                       └── 转派给"自己的下级"
                    → 上级收到调整请求
                       ├── 同意 → state='adjusted' → 按调整内容落地 → 通知双方
                       └── 驳回 → 回到 pending，下级再次响应
```

**特别说明**：
- 不存在"直接拒绝"按钮，下级必须给出"接受 or 调整"；
- 转派目标必须是调整提出者的下级（防止任务踢皮球出去）；
- 中间层管理者在 `accepted` 后自动获得对该节点的可见权。

### 6.2 任务更新流程

```
触发：下级在自己导图上的某个任务节点 → 改字段或点「记录进展」
   ↓
- 改 status（未开始 → 进行中 → 已完成 / 阻塞）
- 拖动 progress slider 改进度百分比
- 添加 TaskLog（文本 + 附件）
   ↓
- 写一条 TaskLog（logType 区分类型）
- 触发 NodeUpdated 事件
   ↓
通知规则（完整产品行为；原型只实现站内通知部分）：
- 该节点的所有可见上级 → 站内通知（默认折叠为「日维度」聚合）
- 状态变更（特别是 done / blocked）单独立即通知
- 普通进度推进 → 进入每日邮件摘要【原型不实现】
- 阻塞 → 立即通知 + 站内显眼提示
```

### 6.3 关注申请流程

```
触发：下级在自己导图上选中节点 → 「申请上级关注」
   ↓
Step 1  下级选择：
        - 关注对象：当前节点 / 当前节点+整个子树
        - 关注上级：默认实线上级，可指定虚线上级
        - 备注（为什么希望关注）
        - [可选] 有效期（默认 90 天）
   ↓
Step 2  创建 FollowGrant(state='pending') → 通知上级
   ↓
Step 3  上级在「关注请求」页决策：
        ├── 同意 → state='granted' → 节点（及子树）进入上级视野
        └── 拒绝 → state='denied' → 通知下级，附理由
   ↓
有效期到达 → 自动 state='expired'，从上级视野移除
下级可手动 revoke；上级也可主动取消关注
```

### 6.4 主动分享流程

最轻量的共享，下级直接对**单个任务节点**点「分享给上级」按钮，**无需上级审批**。

```
触发：下级选中一个任务节点 → 「分享给…」
   ↓
- 选择上级（实线 / 虚线 / 任意管理者）
- 创建 NodeShare 立即生效
- 上级在该成员 tab 下立即可见此任务
   ↓
- 下级随时可 revoke
- 任务状态变更时按 6.2 规则通知上级
```

### 6.5 @ 提及流程（v2 新增）

```
触发：在节点标题 / 描述 / 笔记 / 日志评论中输入 @
   ↓
Step 1  弹出 MentionPicker（用户选择器，按姓名/邮箱/工号过滤）：
        - 候选项标 "钉" 表示对方绑定了钉钉，会被推送
        - ↑↓ 选 / Enter 或 Tab 确认 / Esc 取消
   ↓
Step 2  插入 "@姓名 " 后，根据触发位置确定 kind：
        - 标题中 → kind='assign'（轻量派任务，仅发通知，不创建 Assignment）
        - 描述/笔记/日志 → kind='discuss'（拉对方进讨论）
   ↓
Step 3  buildMentionsForSubmit 副作用：
        ├── 创建 MentionEvent
        ├── 给被 @ 人下发 mentioned_assign / mentioned_discuss 通知
        ├── 对方 dingtalkBound=true 时，标记 dingtalkPushedAt（mock 推钉成功）
        └── 若对方对此节点尚无可见性 → 自动建一条 NodeShare（sharerId=发起人）
   ↓
重复检查：同节点 + 同人 + 同 kind 在 5 分钟内不重复发送通知，避免反复 onBlur 刷屏。
```

> **为何 @ assign 不直接创建 Assignment？**  
> Assignment 是组织化的派任务工单（要求 assignee 在 assigner 的下属链路上、必须落到骨架节点），@ 是任意双向的轻量提醒。两者解耦后，@ 在跨级 / 平级 / 反向场景里都能用，且不污染派出列表。如果需要正式派任务，仍走「派任务」按钮。

### 6.6 日历同步流程（v2 新增）

```
触发条件：以下任意之一会自动调用 reconcileNodeCalendarSyncs(...)
- 创建任务 / 修改 task.status / progress / deadline / 标题
- 用户在右侧 Dock 「日历同步」段点「重新同步」
   ↓
对每个 owner.connectedCalendars 中的 provider：
- 没有 CalendarSync → 创建一条（status='synced'）
- 已有但内容变 → 更新 syncedTitle / syncedDeadline / syncedStatus / syncedAt
- 内容未变 → 跳过
   ↓
首次创建时给 owner 下发 calendar_synced 通知（含 calendarProvider 标签）。

外部日历 → 应用回写（演示用按钮模拟）：
- 在 CalendarSyncSection 点 "在 钉钉 勾完成"
- simulateCalendarCompletion(syncId) 把 externalCompleted 置 true
- 若任务还未 done，自动把 task.status='done', progressPct=100, closedAt=now
- 写一条 status_change 日志：「日历回写：在外部日历中勾选完成 → 状态置为已完成」
- 给 owner 下发 calendar_completion 通知
```

### 6.7 边缘情况

| 情况 | 处理 |
|------|------|
| HR 同步删除某员工 | 其导图归档；pending Assignment 自动 `rejected_by_system` 并通知派任务方；其作为下属的 FollowGrant/NodeShare 自动 revoke |
| 跨年度归档 | 每年 1 月 1 日生成新 MindMap；旧导图只读，上下级关系按归档时刻冻结，原有 FollowGrant 失效 |
| 下属变更上级（调岗） | 旧上级失去新增任务的可见权；已派任务保留可见，新派任务不再向其同步 |
| 下级转派后中途反悔 | 转派属于 Assignment 调整的子状态；调整被驳回则回到 `pending`，没有"已转派又撤回"的中间态 |
| 节点被下级删除 | 若节点对上级可见，删除变为软删除并通知上级；上级看到「已被删除」墓碑而非真消失 |

---

## 7. UI / 视图设计

### 7.1 页面清单

| 页面 | 路径 | 角色 | 主要内容 |
|------|------|------|----------|
| 登录 / 角色切换 | `/` | 全部 | 假登录——下拉选个员工身份直接进入 |
| 我的导图 | `/mindmap` | 全部 | 个人完整思维导图（骨架 + 自由节点 + 任务字段） |
| 团队视图 | `/team` | 管理者 | 顶部成员 tab，每个 tab 展示该成员与我相关的任务集 |
| 待我处理 | `/inbox` | 全部 | 派任务待响应 / 调整请求 / 关注请求 等待办合集 |
| 通知中心 | `/notifications` | 全部 | 站内通知列表 |
| 个人设置 | `/settings` | 全部 | 通知偏好、关注列表管理 |
| 组织管理 | `/admin/org` | 管理员 | mock 组织树 + 实线/虚线关系展示（仅演示） |

### 7.2 核心组件

#### MindMapCanvas（思维导图画布）
- 纯 React 自绘，节点用 div + 绝对定位 + SVG 连线（避免重型 lib）
- 节点形态参考用户提供的截图：
  - 骨架节点：圆角矩形，按时间维度配色（年=深蓝、季=橙、月=红/蓝/黄交替、周=灰）
  - 任务节点：白底 + 颜色边框（颜色随状态：未开始灰 / 进行中蓝 / 完成绿 / 阻塞红）
  - 概念节点：纯白底+黑字
- 支持：
  - 滚轮缩放、画布拖拽
  - 点击选中（仅选中，不开抽屉）、`Space` 打开右侧 Dock 详情
  - `Tab` 加子节点、`Enter` 加同级、`F2` 重命名、`Esc` 取消、↑↓←→ 在兄弟/父子间移动
  - 右键菜单（XMind 风格）：插入子/同级/概要/边界/联系线 / 添加标记 / 派任务 / 分享 / 申请关注 / 删除
- 三种结构：`mindmap` 中心放射、`right-logic` 向右逻辑（年度模板默认）、`org-chart` 组织架构
- 三套主题：`snowbrush` 雪刷、`business` 商务、`mono` 极简
- 年度模板（`useAnnualTemplate=true`）：12 个月垂直主脊；每 3 个月用动态括号合成 1 个季度；季度括号节点可继续往右挂任务

#### XMind 扩展元素（v2 新增）
- **概要 (Summary)**：选中若干同级节点 → 「添加概要」 → 自动生成一个父节点，括号自动覆盖被概要节点的纵向范围。
- **边界 (Boundary)**：选中若干同级节点 → 「添加边界」 → 在画布上画出一个圆角虚线框圈住它们。
- **联系线 (Relationship)**：选中节点后点「联系线」，再点目标节点，生成跨分支的虚线箭头，可在中段编辑标签。
- **浮动主题 (Floating)**：右键空白 → 添加浮动主题，独立于树存在，可拖拽到任意位置。

#### MindMapToolbar（顶部工具栏）
- 切结构 / 切主题
- 「标记」开关：勾起后右侧 Dock 切到 Markers 页，可随手把图标拖到选中节点
- 「派出」开关（仅管理者）：右侧 Dock 切到「派出列表」
- **视图切换**：**思维导图**（画布）/ **大纲**（树状文本）/ **甘特图**（仅任务节点的时间轴 + 表）

#### MindMapOutline（大纲视图）
- 树状文本视图，与画布数据一致；标题/描述里的 `@姓名` 会高亮 chip 渲染。

#### MindMapGantt（甘特图视图，v2.3）
- **数据范围**：当前 `mindmapId` 下所有 `task` 非空的节点；含 **浮动主题** 上的任务（列在表末）；遍历顺序为根前序，与导图树一致。
- **左侧表**：任务名称（缩进 + 可折叠）、开始日期、时长（天）。**叶子任务**可编辑日期与时长（写回 `ganttStart` / `ganttDurationDays` / `deadline`）；**汇总行**（有子任务的父任务）左侧为只读展示。
- **右侧轴**：按月 / 按日网格；任务条为主题色，汇总条为紫色；负责人头像显示在叶子任务条左侧（与 `ownerId` 对应）。
- **交互**：左右列表与时间轴 **纵向滚动联动**；日期头与画布 **横向滚动联动**；滑块调节「每列像素」缩放；工具栏含依赖/导出/打印 **占位**（未接真实能力）。
- **后端提示**：甘特为 **同一套 Node + TaskFields** 的只读派生视图 + 写回部分字段；无需单独「甘特实体表」；若做冲突检测，可与节点 `updatedAt` 乐观锁对齐。

#### NodeDetailDrawer（节点详情抽屉，已重构为右侧 Dock）
持久挂在右侧（宽 380px），支持滚动：
- header（固定）：节点标题（@ 高亮）+ 关闭按钮
- summary（固定）：状态 chip / 进度条 / 优先级 / deadline 概览
- tabs（固定）：详情 / 标记 / 派出 / 日历同步 / 提及历史
- 内容区（可滚）：
  - **详情**：描述（@ 输入支持自动补全）、负责人、deadline、进度 slider、日志时间轴
  - **标记**：分类网格 + 已选中标记预览
  - **派出**：仅当管理者；按"待接受/调整中/进行中/已完成"分组列出我从此节点派出的所有 Assignment，每行一个，显示 assignee + 进度 + 最新一条日志摘要
  - **日历同步**：按 provider 分卡片显示同步状态、syncedAt、外部完成按钮（mock 回写）
  - **提及历史**：本节点上所有 MentionEvent 列表，标"已推钉"
- footer（固定）：追加日志输入区、底部快捷操作 chip（派任务 / 分享 / 申请关注）

#### MarkerPicker（XMind 风格标记面板）
- 7 个 category：标签 / 优先级 / 进度 / 旗帜 / 星标 / 人员 / 符号
- 每个 marker 就是一个 SVG 图标 + id；优先级 / 进度同 category 内互斥（一个节点只能有一个 P0/P1/P2/P3、一个 0/25/50/75/100%）。

#### AssignmentDialog（派任务对话框）
- 选择下属（树形选择器，覆盖直接下属及其下属，**支持多选**）
- 选择时间桶：默认派到当月，可改为任意月或任意季度；自动定位每位下属的骨架节点
- 标题/描述/deadline/优先级
- 「拆分」开关：开启后多行输入，每行一条独立工单
- 「预览」按钮：一次性看到所有要派的工单卡片

#### NegotiationDialog（调整对话框）
下级响应派任务时弹出：
- 三个 tab：调整 deadline / 拆分 / 转派
- 提交后回到「待我处理」页面，等上级决策

#### MentionPicker / MentionInput / MentionTextarea / MentionText（v2 新增）
- 输入框任何位置打 `@` → 浮出选择器；候选行右侧标 "钉" 表示对方已绑定钉钉；↑↓选 / Enter|Tab 确认 / Esc 取消。
- 渲染时把 `@姓名` token 化为彩色 chip，支持点击跳转到该用户卡片。

#### CalendarSyncSection（v2 新增）
- 在 Dock「日历同步」tab；按 owner.connectedCalendars 列出 Mac / 钉钉 / Google 三张卡片；
- 「重新同步」按钮 / 「在 X 日历勾完成」mock 按钮 / 「断开」按钮
- 每张卡片显示：syncedAt、externalEventId、当前 syncedTitle、syncedDeadline、syncedStatus

#### TeamMemberTabs（团队成员 tab）
顶部一排标签（参考截图底部 tab 风格）：
- 上半部分：树形列表（按骨架时间分组）
- 下半部分：日志时间轴（聚合该成员所有可见任务的最近更新）

#### UserSwitcher（身份切换器）
**原型专属能力**——为了让用户能演示"上级看下级 / 下级看上级 / 同级看不到"等所有权限组合：
- 全局右上角下拉
- 切换后整个应用切到该用户视角，无需刷新
- mock 数据准备 8–10 个不同层级的员工

### 7.3 视觉风格

- 主色调跟随用户截图色板：深蓝 `#1B2A4E`、橙红 `#E76F51`、亮黄 `#F4C430`、白底
- 字体：默认 system-ui，标题用 Inter
- 圆角统一 `rounded-lg`（8px），阴影克制（`shadow-sm` 级别）
- MVP 原型不做暗色模式，专注亮色

### 7.4 响应式

- 桌面优先（≥1024px）：完整画布 + 抽屉布局
- 平板（768–1023px）：画布缩小，抽屉变全屏弹层
- 移动（<768px）：导图改"折叠列表"形态展示，详情用全屏页面替代抽屉
- 派任务/调整/关注流程在移动端用步骤式向导

---

## 8. 原型范围划定

### 8.1 必做（保证演示完整闭环）

- ✅ 假登录 + 身份切换器
- ✅ 我的导图：骨架自动生成 + 自由节点添加/编辑/删除（XMind 风格快捷键）
- ✅ 三种结构 + 三套主题切换；年度模板（12 月 + 季度括号）
- ✅ XMind 扩展：概要 / 边界 / 联系线 / 浮动主题
- ✅ 任务标记系统（XMind markers）
- ✅ 节点详情抽屉（右侧 Dock 多 tab）：任务字段编辑 + 日志时间轴 + 标记 + 派出 + 日历 + 提及
- ✅ 派任务对话框：多选下属、按月/季度时间桶、拆分预览
- ✅ 调整对话框：调整 deadline + 转派两种
- ✅ 团队视图：成员 tab + 与我相关任务集
- ✅ 待我处理页：派任务/调整/关注请求三类待办
- ✅ 关注申请 + 主动分享
- ✅ 通知中心（站内 + 钉钉推送 mock）+ 通知点击精确跳转节点
- ✅ @ 提及（标题=派任务 / 描述笔记日志=讨论），自动建 NodeShare
- ✅ 日历集成：Mac/Google mock；钉钉在 API+凭证下可写日程 + Webhook/按钮回写示意
- ✅ 长内容滚动（详情抽屉、通知中心、待我处理、团队视图）
- ✅ **工作汇报**：`/reports` 生成周/月/季草稿、保存、提交上级、@ 同事通知
- ✅ **甘特图**：导图内任务节点的时间轴视图；`TaskFields.ganttStart` / `ganttDurationDays` 与表编辑联动

### 8.2 选做（演示加分但非必须）

- 🟡 节点拖拽改父子关系
- 🟡 阻塞状态的"红点提醒"在导图上显眼显示
- 🟡 周/月切换时的过渡动画
- 🟡 简单的关键词搜索

### 8.3 不做（明确画在边界外）

- ❌ 邮件摘要发送（仅文档描述逻辑，原型不做）
- ❌ SSO/HR 同步（用 mock 数据替代）
- ❌ 真实附件上传（仅显示文件名，不真上传）
- ❌ Mac/Google **真实**日历 OAuth 与双向同步（仍为 mock）
- ⚠️ **钉钉**：工程已支持**工作通知 HTTP**、**日程创建/更新**、**Webhook 回写**（需企业内应用配置与联调）；产品原型仍保留 `dingtalkPushedAt` 等**演示用**字段
- ❌ 多年度切换（只演示 2026 一年）
- ❌ 完整管理后台（仅简化展示组织树）
- ⚠️ **后端持久化**：默认仍 **localStorage**；**可选** API 模式将工作区快照存 SQLite/PG（**非**生产级多用户隔离方案，详见 §12.5 与 `HANDOFF.md`）

---

## 9. Mock 数据规划

为支撑完整演示，至少准备：

- **组织数据**：1 家公司、3 个部门、~10 名员工（覆盖 3 层实线 + 1 条虚线汇报）；每位 user 预置 `dingtalkBound` 与 `connectedCalendars`（mac/dingtalk/google 的若干组合）
- **导图数据**：每名员工一张 2026 年导图，骨架自动生成（年→4 季→12 月→52 周占位，演示用展开 1–2 个季度即可）；structure/theme 在不同 demo 用户上分别预置成 mindmap+snowbrush、right-logic+business、org-chart+mono
- **任务节点**：每名员工 5–10 个分布在不同骨架下的任务节点（覆盖 4 种状态、3 种优先级）；其中 1–2 个挂上 markers（旗帜/星标/进度）以演示标记效果
- **XMind 扩展**：每张导图至少 1 处概要、1 处边界、1 条联系线、1 个浮动主题
- **协作数据**：3–5 条 Assignment（覆盖 pending/accepted/negotiating 状态，含 1 条多人派任务）、2 条 FollowGrant、2 条 NodeShare
- **日历同步**：5+ 条 CalendarSync，覆盖三家 provider，并且其中 1 条 `externalCompleted=true` 演示回写
- **@ 提及**：3+ 条 MentionEvent，含 assign 和 discuss 两种 kind；其中 2 条标 `dingtalkPushedAt`
- **通知**：15 条左右站内通知（覆盖派任务/更新/关注审批/mentioned_assign/mentioned_discuss/calendar_synced/calendar_completion 等类型）

---

## 10. 测试策略

由于交付是前端原型，测试以**手动演示验证**为主：

- **演示脚本**：编写 5–8 条端到端演示流程（如"上级派任务—下级调整—上级同意—下级更新进度"），每次切换身份验证视角正确性
- **权限边界测试**：用 UserSwitcher 切换身份，验证"下级看不到上级导图"、"非可见上级看不到任务更新"等关键边界
- **响应式测试**：桌面 / 平板 / 手机三档断点手动检查关键页面
- **不写自动化测试**：原型阶段成本高于价值，留作未来真实开发阶段补齐

---

## 11. 后续演进路径（不在原型范围）

明确写出来，避免原型阶段过度设计：

1. **生产级后端**：在现有演示 API 之上，扩展为完整 REST/多用户工作区、与表结构一一对应的领域模型（当前仅为快照 JSON + 部分钉钉集成表）
2. **SSO/LDAP/HR 同步**：接入企业身份提供商
3. **邮件摘要**：日/周聚合通知发送
4. **IM 集成**：钉钉/企业微信/飞书消息推送（可选）
5. **多年度归档与跨年视图**
6. **OKR 风格的目标管理扩展**
7. **看板 / 表格等辅助视图**（**甘特**已在 v2.3 前端原型实现）
8. **报表和团队分析仪表盘**
9. **暗色模式**
10. **国际化**

---

## 12. 企业内部署与钉钉一体化（目标架构）

> 本节回答：在**一家企业内、阿里云上一套服务、几千名员工、钉钉组织开账号**的场景下，产品如何满足「每人维护自己的思维导图 + 按组织关系派任务/关注 + @ 同事 + 钉钉日历提醒与跟踪」。  
> 与 §2–§8 中的业务规则**一致**；差别在于身份来源、数据隔离、规模与运维。

### 12.1 目标与边界

**目标**

- 员工使用**钉钉身份**登录本应用（或从钉钉工作台免登进入）。
- **组织架构、上下级关系**以钉钉通讯录/部门为准，定期或实时同步到本系统（实线为主，虚线/项目汇报可通过扩展字段或独立「汇报关系表」维护，与现有产品设计兼容）。
- **每位员工独立**维护多张思维导图与任务；数据按「企业 + 用户」隔离，上级**不能**默认看到下级完整导图（与 §2 决策 5 一致）。
- **派任务、关注、@ 同事、分享**在服务端持久化，通知可走**钉钉工作通知**（替代或补充站内信）。
- **任务与钉钉日历**打通：把任务写入员工钉钉日历（或待办），变更标题/时间/完成状态时可同步；到期提醒由钉钉日历负责触达。

**边界（需企业 IT 与钉钉管理员配合）**

- 需在钉钉开放平台创建**企业内部应用**，配置通讯录只读、日历/日程等 scope（以钉钉当前开放能力为准）。
- 大规模上线前需完成：等保/内控要求、日志留存、密钥与 Token 轮换、专有云/混合云策略（若适用）。

### 12.2 几千人规模的容量与架构要点

| 维度 | 建议 |
|------|------|
| 应用层 | 无状态 Web/API 多实例（容器或 ECS 多机），前接 SLB；会话存 Redis 或 JWT + 短有效期 + 刷新令牌 |
| 数据库 | 托管 **RDS PostgreSQL**（或 PolarDB）；导图节点、任务、协作关系分表；热路径加索引（`owner_id`、`mindmap_id`、`assignee_id`、`org_id`） |
| 读多写少 | 团队视图、通知列表可做只读副本或缓存；导图详情以**单用户写入**为主，冲突策略明确（乐观锁 `version` 或最后写入 wins + 审计） |
| 钉钉同步 | 组织同步用**队列/定时任务**（全量 + 增量），避免登录链路直连钉钉拉全量通讯录 |
| 文件与静态资源 | 附件、导出可走 **OSS**；前端静态资源 CDN/ OSS |

「几千人」对导图编辑并发要求通常低于 IM；主要压力在**通知、组织同步、日历 API 调用配额**，需按钉钉文档做限流与批量。

### 12.3 阿里云部署拓扑（示意）

1. **VPC 内**：ECS/ACK 跑 API + 前端（或前端单独 OSS+CDN）。
2. **RDS**：业务库；定期备份、跨可用区。
3. **Redis**：会话、限流、组织缓存。
4. **（可选）消息服务**：MNS / RocketMQ —— 异步写通知、钉钉推送、日历同步，避免请求链路过长。
5. **出口**：经 NAT 访问钉钉开放平台 HTTPS；若企业策略要求，走固定 IP 白名单。

与当前仓库内「单机 SQLite 演示」的关系：**逻辑模型一致**，生产环境替换为上述托管组件与多实例。

### 12.4 身份与账号：钉钉组织开设账号

**推荐流程**

1. 企业在钉钉创建**自建应用**，获取 `AgentId`、`AppKey`、`AppSecret`，配置可信域名与回调 URL。
2. 开通权限：通讯录只读、身份认证（免登）、工作通知、日历（若对接日程 API）等。
3. **首次登录**：员工从钉钉打开应用 → OAuth / 免登拿 `userid` / `unionId` → 本系统 **upsert 用户表**（绑定 `dingtalk_user_id`，映射内部 `user_id`）。
4. **组织同步**：定时拉部门树与人员所属部门，写入 `department`、`user`、`org_relation`（实线自钉钉主属部门推导；虚线需业务配置表，与原型 mock 一致）。
5. **权限**：所有 API 带「当前企业 `corp_id` + 当前用户」上下文；禁止跨企业读数据。

这样实现「按钉钉组织架构开设账号」：**账号不单独手工建**，以钉钉身份为源；禁用/离职以钉钉状态同步或定时校验为准。

### 12.5 数据隔离：企业与个人导图

- **租户键**：`corp_id`（企业唯一标识，与钉钉企业对应）。
- **导图与节点**：`mindmap.owner_id` = 员工内部 id；列表与编辑 API 必须校验「仅本人或企业管理员备份场景」。
- **团队视图、派任务**：仅暴露「与我相关的任务集合」（与 §2、§5、现有 `permission` 思路一致），在服务端强制过滤，不只靠前端。

### 12.6 与现有产品能力的映射

| 产品能力 | 企业版实现要点 |
|----------|----------------|
| 思维导图（多模板） | 与现前端一致；数据按 `mindmap_id` + `user_id` 存服务端 |
| 上下级派任务 | 以同步后的 `org_relation` 判定可派范围；状态机与原型一致 |
| 关注 / 分享 | `FollowGrant`、`NodeShare` 持久化；通知对接钉钉 |
| @ 同事 | 解析 `userid`/姓名 → 写 `MentionEvent` + 分享可见性 + 钉钉通知 |
| 通知中心 | 站内 + 钉钉工作通知双写；未读状态以服务端为准 |

### 12.7 钉钉日历与任务提醒、跟踪

**能力描述（依赖钉钉开放接口版本）**

- 任务创建/变更时：工程已实现调用钉钉 **oapi 日程 2.0**（`topapi/calendar/v2/event/create` / `update`），将标题、截止时间、描述摘要同步到负责人「我的日程」；PG 模式下 **`calendar_event_links`** 持久化 `node_id` ↔ 钉钉 `event_id`；前端 `CalendarSync` 同步展示。
- **提醒**：由钉钉日历的提醒策略触发（推送、日历内通知）；应用侧 `notification_type` 等参数以开放平台为准。
- **跟踪**：`POST /api/webhooks/dingtalk/calendar` 在 `completed=true` 时**回写**任务为完成并更新 `CalendarSync`；生产环境需与钉钉**真实事件体/Stream/加密回调**对齐并完善验签。
- **失败重试**：日历写入失败进入队列重试（**待生产化**）；前端可将同步条目标为 `failed` 并展示 `lastError`。

### 12.8 运维与安全（摘要）

- HTTPS 全站；密钥放 KMS/环境变量，不入库。
- 操作审计：派任务、关注审批、管理员导出等记审计日志。
- 备份与恢复演练；RDS 时间点恢复。

### 12.9 与当前原型的里程碑关系

| 阶段 | 内容 |
|------|------|
| 当前原型 | 完整演示业务闭环；**纯前端** 或 **可选 API**（SQLite / PostgreSQL） |
| M1（工程已落地） | 可选 PostgreSQL + 租户表 + 钉钉 Mock 登录 + JWT `tid`；**免登换票** `POST /api/auth/dingtalk/exchange`（需 `DINGTALK_APP_*`）；见 `docs/superpowers/plans/2026-04-28-enterprise-milestones.md` |
| M2 | **PG**：`GET /api/org`；`POST /api/sync/dingtalk/org` 默认 mock；**`mock:false` + 凭证** 可调钉钉拉 **部门树**（`org_relations` 仍可能为空，需产品侧维护或后续迭代） |
| M3 / M4 | **已部分落地**：工作通知 **Outbox**（配凭证走 **asyncsend_v2**）；**日历外链** + **推送日程** + **Webhook 回写**；可选 **timestamp/sign** 验签。**生产联调**（Stream、加密回调、删除日程、幂等）仍待研发 |

---

## 附录 A. 术语表

| 术语 | 含义 |
|------|------|
| 骨架节点 | 系统自动生成的时间容器节点（年/季/月/周），不可手工删除 |
| 普通节点 | 用户自己添加的节点，可任意编辑 |
| 任务节点 | 带 TaskFields 的普通节点 |
| 概念节点 | 不带 TaskFields 的普通节点（仅作分类/思考） |
| 派任务 | 上级向下级骨架节点指派任务的行为 |
| 调整 | 下级对派任务内容请求调整（deadline/拆分/转派）的过程 |
| 转派 | 调整的一种形式：把任务交给自己的下级 |
| 关注 | 上级对下级特定节点的可见性授权关系 |
| 主动分享 | 下级对单个任务节点的可见性单方授予（无需上级同意） |
| 中间层 | 介于派任务上级和实际下级之间的实线主管 |
| 概要 / 边界 / 联系线 / 浮动主题 | XMind 扩展元素：分别表示子树概览、子树外框、跨分支连接、独立主题 |
| 标记 (Marker) | XMind 风格的图标 chip，附着在节点上：旗帜/星标/进度/优先级/人员/标签 |
| 派出 | 管理者视角下"我派出去的所有任务"集合，按 assignee 维度展示 |
| 日历同步 | Mac/Google 为 mock；**钉钉**可经 API 写真实日程；外部勾完成可 mock 或 Webhook 回写 |
| @ 提及 | 在标题/描述/笔记/日志里 `@姓名`：标题 = 轻量派任务，其它 = 拉讨论；自动建 NodeShare 解决可见性 |
