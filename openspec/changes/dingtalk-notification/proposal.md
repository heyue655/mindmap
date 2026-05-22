## 为什么

现有的通知中心（M-07）只支持应用内通知（AppNotification），用户必须主动打开系统才能查看消息。在实际企业场景中，任务派发、协商、审批、汇报等关键操作需要通过钉钉即时触达当事人，避免因遗漏通知导致工作延误。项目数据库已有 `dingtalkBound` 字段，`.env.example` 中也预留了钉钉 App 配置，本次迭代正式将钉钉通知能力从"待接入"状态推向完整实现。

## 变更内容

- **新增** 钉钉工作通知发送服务（封装钉钉 OpenAPI）
- **新增** 钉钉通知队列 API（`/api/integrations/dingtalk/enqueue`），供内部服务调用
- **新增** 用户绑定钉钉 userId 的字段（`User.dingtalkUserId`），用于调用钉钉发消息接口
- **新增** 管理员在用户管理页面录入/维护员工的钉钉 userId
- **修改** 所有触发 AppNotification 的业务场景，在创建站内通知的同时，异步向绑定了钉钉的用户推送钉钉工作通知
- **修改** 环境变量说明，启用钉钉相关配置项

涉及的通知场景（共 15 类，全部对齐）：

| 场景 | kind |
|------|------|
| 收到任务派发 | `assignment_received` |
| 下级发起协商 | `assignment_negotiating` |
| 下级接受任务 | `assignment_accepted` |
| 下级拒绝任务 | `assignment_rejected` |
| 收到关注申请 | `follow_requested` |
| 关注申请被批准 | `follow_approved` |
| 关注申请被拒绝 | `follow_rejected` |
| 收到汇报提交 | `report_submitted` |
| 汇报抄送 | `report_shared` |
| @ 提及 | `mention` |
| 日历截止提醒 | `calendar_reminder` |
| 任务状态变更 | `task_status_changed` |
| 任务进度更新 | `task_progress_updated` |
| 任务阻塞 | `task_blocked` |
| 节点分享 | `node_shared` |

## 功能 (Capabilities)

### 新增功能

- `dingtalk-service`: 封装钉钉 OpenAPI 的服务层，含获取 access_token、发送工作通知（sendWorkMessage）两个核心能力
- `dingtalk-notification-dispatch`: 在所有触发站内通知的业务节点，额外向绑定了钉钉的用户发送钉钉工作通知的调度逻辑

### 修改功能

- `user-management`: 用户管理新增 `dingtalkUserId` 字段的录入与维护（管理员在用户编辑表单中填写）
- `notification-center`: AppNotification 创建时同步触发钉钉推送，通知内容与站内消息保持一致

## 影响

- **数据库**：`User` 表新增 `dingtalkUserId VARCHAR(64)` 字段；需执行 `prisma migrate`
- **环境变量**：启用 `DINGTALK_APP_KEY`、`DINGTALK_APP_SECRET`、`DINGTALK_AGENT_ID`
- **新增文件**：`src/lib/dingtalk.ts`（钉钉服务）
- **修改文件**：`src/lib/notify.ts`（所有 `createNotification` 调用点追加钉钉推送）、`prisma/schema.prisma`、`src/app/api/admin/users/[id]/route.ts`、对应的前端用户编辑表单
- **依赖**：无需新增 npm 包，使用原生 `fetch` 调用钉钉 HTTP API
