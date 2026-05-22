## 新增需求

### 需求:创建站内通知时同步触发钉钉推送
系统在调用 `createNotification()` 创建 AppNotification 后，必须检查接收用户的 `dingtalkUserId` 字段。若该字段非空，则异步调用 `sendDingtalkWorkMessage()` 向该用户推送内容相同的钉钉工作通知。钉钉推送必须以 fire-and-forget 方式执行，禁止 await 阻塞主流程，禁止因推送失败而影响 HTTP 响应。

#### 场景:绑定钉钉的用户收到通知
- **当** 系统调用 `createNotification()` 且接收用户的 `dingtalkUserId` 非空
- **那么** 系统在创建站内通知后，以 fire-and-forget 方式向该用户发送内容为 `【工作平台】${notification.content}` 的钉钉工作通知

#### 场景:未绑定钉钉的用户收到通知
- **当** 系统调用 `createNotification()` 且接收用户的 `dingtalkUserId` 为 null 或空字符串
- **那么** 系统只创建站内通知，不发起任何钉钉 API 调用

#### 场景:钉钉推送失败不影响站内通知
- **当** 钉钉推送调用抛出异常或返回错误
- **那么** 站内通知已正常创建，API 响应正常返回，仅记录 warn 日志

### 需求:所有 15 类通知场景均触发钉钉推送
系统中所有触发站内通知的业务场景（`assignment_received`、`assignment_negotiating`、`assignment_accepted`、`assignment_rejected`、`follow_requested`、`follow_approved`、`follow_rejected`、`report_submitted`、`report_shared`、`mention`、`calendar_reminder`、`task_status_changed`、`task_progress_updated`、`task_blocked`、`node_shared`）必须均通过 `createNotification()` 统一入口触发钉钉推送，禁止各业务场景单独处理钉钉推送逻辑。

#### 场景:任务派发触发钉钉通知
- **当** 上级通过系统派发任务给下级，系统创建 `assignment_received` 类型的站内通知
- **那么** 若被派发下级的 `dingtalkUserId` 非空，系统向其发送钉钉工作通知

#### 场景:工作汇报提交触发钉钉通知
- **当** 下级提交工作汇报，系统创建 `report_submitted` 类型的站内通知给直属上级
- **那么** 若直属上级的 `dingtalkUserId` 非空，系统向其发送钉钉工作通知
