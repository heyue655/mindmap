## 新增需求

### 需求:获取钉钉 access_token
系统必须能够通过企业内部应用的 AppKey 和 AppSecret 向钉钉 OpenAPI 获取 access_token，并将其缓存在模块级变量中，在过期前 5 分钟自动刷新。当 `DINGTALK_APP_KEY` 或 `DINGTALK_APP_SECRET` 环境变量未配置时，系统必须直接返回 null 并跳过所有钉钉操作，不得抛出异常。

#### 场景:配置完整时获取 token
- **当** 环境变量 `DINGTALK_APP_KEY` 和 `DINGTALK_APP_SECRET` 均已配置，且缓存为空或已过期
- **那么** 系统向 `https://oapi.dingtalk.com/gettoken` 发起请求并返回有效 token，缓存过期时间戳

#### 场景:缓存有效时复用 token
- **当** 缓存的 access_token 距离过期时间超过 5 分钟
- **那么** 系统直接返回缓存 token，不发起网络请求

#### 场景:环境变量未配置时跳过
- **当** `DINGTALK_APP_KEY` 或 `DINGTALK_APP_SECRET` 任一为空
- **那么** 系统返回 null，不发起任何网络请求，不抛出异常

### 需求:发送钉钉工作通知
系统必须提供 `sendDingtalkWorkMessage(dingtalkUserId: string, content: string)` 函数，通过钉钉企业内部应用工作通知接口向指定用户发送纯文本消息。发送失败时必须记录 `logger.warn` 日志，禁止抛出异常影响调用方业务流程。

#### 场景:成功发送工作通知
- **当** access_token 有效，`dingtalkUserId` 非空，且钉钉 API 返回 `errcode=0`
- **那么** 消息成功投递，函数正常返回

#### 场景:发送失败静默降级
- **当** 钉钉 API 返回非 0 errcode 或网络请求抛出异常
- **那么** 系统记录 `logger.warn` 包含错误信息和 userId，函数正常返回不抛出异常

#### 场景:DINGTALK_AGENT_ID 未配置时跳过
- **当** 环境变量 `DINGTALK_AGENT_ID` 未配置
- **那么** 函数直接返回不发起请求，不记录错误日志
