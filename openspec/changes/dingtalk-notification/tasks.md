## 1. 数据库与环境变量

- [x] 1.1 在 `prisma/schema.prisma` 的 `User` model 中新增 `dingtalkUserId String?` 字段，添加 `///` 注释说明用途
- [x] 1.2 执行 `npx prisma migrate dev --name add_user_dingtalk_user_id` 生成并应用迁移文件
- [x] 1.3 执行 `npm run db:comments` 同步 MySQL 字段注释（如项目有此脚本）
- [x] 1.4 在 `.env.example` 中将钉钉相关配置项取消注释并补充说明

## 2. 钉钉服务层

- [x] 2.1 新建 `src/lib/dingtalk.ts`，实现模块级 access_token 缓存逻辑（含过期时间戳，5 分钟提前刷新）
- [x] 2.2 在 `src/lib/dingtalk.ts` 中实现 `getDingtalkToken()` 函数，调用 `https://oapi.dingtalk.com/gettoken` 获取 token；环境变量缺失时返回 null
- [x] 2.3 在 `src/lib/dingtalk.ts` 中实现 `sendDingtalkWorkMessage(dingtalkUserId: string, content: string)` 函数，调用钉钉发送工作通知接口；失败时记录 `logger.warn` 并静默返回

## 3. 通知中心集成

- [x] 3.1 在 `src/lib/notify.ts` 的 `createNotification()` 函数末尾，查询接收用户的 `dingtalkUserId` 字段
- [x] 3.2 在 `createNotification()` 中以 `void sendDingtalkWorkMessage(...)` 方式（fire-and-forget）触发钉钉推送，消息内容格式为 `【工作平台】${content}`
- [x] 3.3 验证现有所有 `createNotification()` 调用点均已覆盖（无需修改调用方，统一在函数内部处理）

## 4. 用户管理 - 后端

- [x] 4.1 在 `PATCH /api/admin/users/[id]` Route Handler 中，接受 `dingtalkUserId` 字段更新
- [x] 4.2 在保存逻辑中，根据 `dingtalkUserId` 是否为非空字符串，自动同步设置 `dingtalkBound` 字段（非空→true，空→false）

## 5. 用户管理 - 前端

- [x] 5.1 在用户编辑表单（管理员用户管理页）中新增"钉钉用户ID"输入框
- [x] 5.2 确保编辑表单打开时自动带出当前用户的 `dingtalkUserId` 值（遵循规范 1-3）
- [x] 5.3 更新用户列表/编辑的前端 TypeScript 类型定义，新增 `dingtalkUserId?: string` 字段

## 6. 文档更新

- [x] 6.1 更新 `.specs/modules/M-07-*.md`（通知中心 SDD），在变更记录中追加本次钉钉推送集成
- [x] 6.2 更新 `.specs/modules/M-08-*.md`（用户管理 SDD），新增 `dingtalkUserId` 字段说明和编辑表单变更记录
- [x] 6.3 在 `.specs/MODULES.md` 中登记 `M-10 钉钉通知服务`（若判断需要独立模块）
- [x] 6.4 在 `.specs/CHANGELOG.md` 中追加本次变更条目
