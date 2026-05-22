## 上下文

项目已有完整的站内通知系统（M-07 AppNotification），所有通知均通过 `src/lib/notify.ts` 的 `createNotification()` 函数统一创建。钉钉推送在早期设计中已预留了 `User.dingtalkBound` 字段和 `.env.example` 配置项，但对应的实现层（钉钉 API 封装、发送调用）一直缺失。

本次迭代在不改变现有站内通知逻辑的前提下，在 `createNotification()` 调用链末端追加钉钉异步推送，保持现有代码结构稳定。

## 目标 / 非目标

**目标：**
- 封装钉钉企业内部应用工作通知 API（发消息接口）
- 用户表新增 `dingtalkUserId` 字段，管理员可在用户编辑页录入
- 所有 15 类通知场景在创建站内通知的同时，向已绑定钉钉的用户异步推送工作通知
- 钉钉推送失败不影响主业务流程（静默降级）

**非目标：**
- 钉钉免登/OAuth 自动绑定（`dingtalkUserId` 由管理员手动维护，不做自动同步）
- 钉钉机器人/群消息（只做工作通知，不做群聊机器人）
- 通知模板的富卡片（Markdown 卡片）样式，本期只做纯文本
- 消息送达回执/已读状态同步
- 推送失败重试队列（后续迭代可扩展）

## 决策

### 决策 1：直接调用 vs 消息队列

**选择**：直接在 `createNotification()` 末尾发起异步调用（fire-and-forget），不引入独立的消息队列服务。

**理由**：项目当前体量小，没有独立的 Worker/Queue 基础设施，引入 Redis Queue 会显著增加运维复杂度。采用 `void dingtalkSend(...)` 的 fire-and-forget 模式可满足当前需求，后续如需重试/幂等可在 `dingtalk.ts` 内部扩展。

**替代方案**：`/api/integrations/dingtalk/enqueue` 异步队列 API（`workspaceApi.ts` 中已有占位）—— 本期不实现，保持占位即可。

### 决策 2：access_token 缓存策略

**选择**：在 `src/lib/dingtalk.ts` 中以模块级变量缓存 access_token（含过期时间戳），在过期前 5 分钟主动刷新。

**理由**：钉钉 access_token 有效期 7200 秒，每次发消息前都重新获取会浪费 API 调用次数。模块级缓存在 Next.js 的 Node.js 进程中是可靠的，适合单实例部署。

**替代方案**：存 Redis / 数据库 —— 对单实例部署过度设计。

### 决策 3：dingtalkUserId 的维护方式

**选择**：管理员在用户编辑表单中手动填写 `dingtalkUserId`（钉钉用户的 unionId 或 userId）。

**理由**：`dingtalkBound` 字段本来就是布尔值，说明最初设计就是手动绑定。自动 OAuth 绑定需要独立的钉钉免登流程，超出本次迭代范围。手动维护适合企业内部管理员操作，实现成本最低。

**字段使用**：`dingtalkBound` 字段保留（兼容现有逻辑），新增 `dingtalkUserId STRING?`；推送时判断 `dingtalkUserId != null` 即推送（自动设置 `dingtalkBound = true`）。

### 决策 4：通知内容格式

**选择**：纯文本格式，消息内容复用站内通知的 `content` 字段文本，附加应用名前缀（如 `【工作平台】`）。

**理由**：钉钉工作通知支持 text/markdown/OA 等多种消息类型，但本期聚焦于消息触达，不做富卡片设计，避免后期维护两套通知文案。

### 决策 5：推送失败处理

**选择**：`try/catch` 捕获所有钉钉 API 错误，仅记录 `logger.warn` 日志，不抛出异常，不影响主业务 HTTP 响应。

**理由**：钉钉 API 属于外部依赖，网络抖动/配置错误不应导致站内操作失败。日志中可见失败信息，便于排查。

## 风险 / 权衡

| 风险 | 缓解措施 |
|------|---------|
| 钉钉 access_token 在多实例部署时各实例独立缓存，可能同时刷新 | 当前为单实例部署，可接受；后续水平扩展时改为 Redis 缓存 |
| 管理员填写错误的 `dingtalkUserId` 导致消息发给错误用户 | 管理员页面添加字段说明提示；发送失败时 warn 日志可供排查 |
| fire-and-forget 推送在进程关闭时可能丢失 | 通知重要性不高于站内通知，丢失可接受；后续可引入持久化队列 |
| 钉钉 API 限流（每个应用每分钟 20 条工作通知） | 当前用户规模小，暂不处理；后续可做限流降级 |

## 迁移计划

1. 在 `prisma/schema.prisma` 中 `User` model 新增 `dingtalkUserId String?` 字段
2. 执行 `npx prisma migrate dev --name add_user_dingtalk_user_id`
3. 在 `.env` / `.env.local` 中补充 `DINGTALK_APP_KEY`、`DINGTALK_APP_SECRET`、`DINGTALK_AGENT_ID`（不填则钉钉推送静默跳过）
4. 部署新代码，无需数据回填（现有用户 `dingtalkUserId` 为 null，推送自动跳过）
5. 管理员逐步在用户编辑页录入各员工的钉钉 userId

**回滚**：只需将 `DINGTALK_APP_KEY` 环境变量置空，`dingtalk.ts` 检测到配置缺失时跳过所有推送，功能静默关闭。

## 开放问题

- 钉钉 `userId` 与 `unionId` 的选择：建议使用 `unionId`（跨应用唯一），但需确认企业钉钉版本是否支持 —— 暂时字段命名为 `dingtalkUserId`，具体值由管理员按实际情况填写
- 是否需要在用户个人设置页面提供自助绑定入口（而非仅管理员维护）—— 本期不做，后续可迭代
