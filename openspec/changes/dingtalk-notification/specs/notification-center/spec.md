## 修改需求

### 需求:createNotification 函数统一触发钉钉推送
`createNotification()` 函数在成功持久化 AppNotification 记录后，必须查询接收用户的 `dingtalkUserId`，并在非空时以 fire-and-forget 方式调用钉钉推送。该函数的现有签名和返回值不得改变，不得因钉钉推送增加额外的异步等待时间。消息内容格式为 `【工作平台】${content}`，其中 `content` 与站内通知的 `content` 字段一致。

#### 场景:createNotification 在已有逻辑后追加推送
- **当** `createNotification()` 完成 `prisma.appNotification.create()` 调用
- **那么** 在返回前，以 `void sendDingtalkWorkMessage(...)` 触发异步推送，不 await，不改变函数返回值

#### 场景:通知创建时接收者信息已可用
- **当** `createNotification()` 接收到 `recipientId` 参数
- **那么** 函数通过 `prisma.user.findUnique({ where: { id: recipientId }, select: { dingtalkUserId: true } })` 获取推送目标，无需额外传参
