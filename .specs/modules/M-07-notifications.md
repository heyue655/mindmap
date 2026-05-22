# M-07 通知中心

**状态：ACTIVE**

## 概述

接收系统内各类事件通知（任务派发、关注授权、汇报提交、@ 提及、日历同步等），支持按类型筛选、标记已读。

## 数据模型

### app_notifications 表

| 字段 | 说明 |
|------|------|
| id | INT 自增主键 |
| recipientId | 接收者用户 ID |
| actorId | 触发者用户 ID（可为空） |
| kind | 通知类型（见下） |
| title | 标题 |
| body | 正文 |
| refNodeId / refAssignmentId / refFollowGrantId / refReportId | 关联资源 ID |
| readAt | 读取时间（NULL = 未读） |
| dingtalkPushedAt | 钉钉推送时间 |

**通知类型（kind）：**

| 值 | 说明 |
|----|------|
| assignment_received | 收到新任务派发 |
| assignment_negotiating | 下级发起协商 |
| assignment_accepted | 下级接受任务 |
| assignment_rejected | 下级拒绝任务 |
| follow_requested | 收到节点关注申请 |
| follow_approved | 关注申请被批准 |
| follow_rejected | 关注申请被拒绝 |
| report_submitted | 收到汇报提交 |
| report_shared | 汇报抄送通知 |
| mention | @ 提及 |
| calendar_reminder | 日历截止提醒 |

## API 接口

通过 `GET/PUT /api/workspace`（M-02）整体同步。

### POST /api/notifications/read

即时标记通知为已读，不依赖 PUT /api/workspace 的 1200ms 防抖。

- **权限**：需 Bearer JWT 认证
- **请求体**：`{ ids: string[] }` — 要标记已读的通知数字 ID 列表
- **响应**：`{ ok: true, updated: number }`
- **安全**：`updateMany` 附带 `recipientId: userId`，只允许标记自己收到的通知（规范 4-2）

## 业务逻辑

- 所有业务操作（派任务、提交汇报等）均在 `StoreProvider` 内直接创建通知记录
- 点击通知可跳转至对应页面，跳转规则如下：
  - `follow_request_received` / `assignment_received` / `assignment_negotiating` / `follow_granted` / `follow_denied` → `/inbox`
  - `assignment_accepted` / `assignment_adjusted`（当前用户为派出方）→ `/team?member=<assigneeId>`
  - `assignment_accepted` / `assignment_adjusted`（当前用户为被派方）→ `/mindmap?node=<id>`
  - `node_shared` → `/team?member=<actorId>`
  - `task_status_changed` / `task_progress_updated` / `task_blocked` → `/team?member=<actorId>`（下级任务动态通知，上级以旁观者视角查看，避免误入下级导图）
  - `mentioned_assign` / `mentioned_discuss` / `calendar_synced` / `calendar_completion` → `/mindmap?node=<id>`
- 跳转 `/team` 时携带 `?member=<userId>` 查询参数，TeamPage 消费后自动切换到对应成员 tab，并立即调用 `router.replace("/team")` 清除参数（与 MindMapPage 处理 `?node=` 的模式一致）

## 前端组件

- `src/pages/NotificationsPage.tsx`：通知列表，筛选/已读/跳转；`markRead` 在 API 模式下同时调用 `POST /api/notifications/read` 即时持久化

## 变更记录

| 日期 | 编号 | 变更内容 | 原始需求 |
|------|------|----------|----------|
| 2026-05-19 | T-07-001 | NotificationsPage 迁移至 Next.js | Next.js 迁移 |
| 2026-05-19 | B-07-001 | 修复点击任务动态通知（task_status_changed/task_progress_updated/task_blocked）误跳转下级导图问题，改为跳转团队视图 | 上级点击通知后左侧菜单切换为"我的导图"，给人错觉 |
| 2026-05-20 | T-07-002 | 通知跳转团队视图携带 ?member= 参数，TeamPage 消费后自动定位成员 tab；NotificationsPage 新增 goTeam(memberId?) 函数 | 点击通知进入团队视图后未自动切换到相关成员 |
| 2026-05-20 | T-07-003 | 钉钉工作通知推送集成：在 PUT /api/workspace 事务提交后，对所有新建 AppNotification fire-and-forget 推送钉钉工作通知（通过 pushPendingDingtalkNotifs）；推送失败静默降级（logger.warn） | 钉钉通知集成 |
| 2026-05-20 | T-07-004 | dingtalk.ts 新增 searchDingtalkUsers（按姓名调用 api.dingtalk.com/v1.0/contact/users/search）和 getDingtalkUserDetail（按 userid 调用 topapi/v2/user/get），用于管理员绑定钉钉账号 | 按姓名搜索钉钉账号绑定 |
| 2026-05-20 | T-07-005 | 新建 POST /api/notifications/read 专用即时已读接口；NotificationsPage.markRead 在 API 模式下调用该接口，彻底修复「标记已读后刷新仍出现未读角标」问题 | 标记已读后刷新页面角标不消失 |
| 2026-05-20 | T-07-006 | 钉钉推送从工作通知（asyncsend_v2）改为机器人单聊（/v1.0/robot/oToMessages/batchSend）；环境变量由 DINGTALK_AGENT_ID 改为 DINGTALK_ROBOT_CODE | 希望通过机器人而非工作通知收到消息 |
