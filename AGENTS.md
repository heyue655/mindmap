# 项目军规

> 本文档为项目开发强制规范，所有成员（含 AI 编程助手）必须严格遵守。
> 分为五大类：**通用规范**、**数据库规范**、**前端规范**、**安全规范**、**文档规范**。

---

## 零、技术栈概览

| 层 | 技术 |
|----|------|
| 框架 | Next.js 14 App Router（`src/app/`） |
| 语言 | TypeScript 5，所有文件 UTF-8 |
| 数据库 | MySQL + Prisma ORM（`prisma/schema.prisma`） |
| 认证 | bcryptjs（cost=12）+ jose JWT |
| 样式 | Tailwind CSS + shadcn/ui（`src/components/ui/`） |
| 状态管理 | React Context（`src/store/StoreProvider.tsx`） |
| 日志 | `src/lib/logger.ts` + `src/lib/withApiLogger.ts` |
| 环境变量 | 参见 `.env.example` |

**关键约定：**
- 所有 Client Component 顶部必须写 `"use client"`
- 路由跳转使用 `next/navigation`（`useRouter`/`usePathname`/`useSearchParams`），**禁止** react-router-dom
- 弹窗/提示使用 `toast`（`@/store/toast`）和 `<ConfirmDialog>`，**禁止** `window.alert/confirm/prompt`
- 环境变量 `NEXT_PUBLIC_USE_API`（客户端可读）控制 API/mock 模式
- 数据库主键为 INT 自增，API 层序列化为字符串返回前端

---

## 一、通用规范

### 规范 1-1：开发语言
**所有回答、代码注释、文档、沟通一律使用中文。**

### 规范 1-2：文件编码
**所有文件一律使用 UTF-8 编码。**

### 规范 1-3：修改表单必须自动带出原数据
**任何编辑/修改操作，打开表单时必须自动填充当前数据，禁止让用户从空白开始填写。**

### 规范 1-4：API 日志规范
**所有接口必须打印请求进入日志和请求完成日志（含耗时），关键业务操作须记录过程日志。**

**日志格式（每行必须包含）：**
- 时间（精确到毫秒，格式 `YYYY-MM-DD HH:mm:ss.SSS`）
- 请求 ID（`req:XXXXXXXX`，每次 HTTP 请求由 `withApiLogger` 生成 8 位十六进制随机 ID）
- 操作人（`user:N`，未认证请求记为 `anon`）
- 接口名（`METHOD /path`，如 `POST /api/tasks`）
- 请求参数（query 参数 + 请求体，敏感字段如 `password`/`token` 自动掩码为 `***`）
- 接口耗时（仅在请求完成/异常日志中记录，单位 ms）

**实现方式：**
- 统一使用 `src/lib/logger.ts` 提供的 `logger.info / logger.warn / logger.error` 方法输出结构化日志
- 所有 Route Handler 必须用 `src/lib/withApiLogger.ts` 提供的 `withApiLogger(handler)` HOF 包裹导出，自动完成请求进入/完成/异常日志（含 `requestId` 字段）
- 关键操作（如创建任务、指派、审批、删除节点）须在处理过程中额外调用 `logger.info` 记录业务操作步骤，并将 `requestId` 透传至 `LogContext` 以关联同一请求的所有日志

**日志示例：**
```
[2026-05-18 10:23:45.123] [req:a1b2c3d4] [INFO] [user:3] [POST /api/tasks] → 请求进入 params={"title":"新任务"}
[2026-05-18 10:23:45.167] [req:a1b2c3d4] [INFO] [user:3] [POST /api/tasks] [201] [44ms] ← 请求完成
```

---

## 二、数据库规范

### 规范 2-1：主键类型
**数据库主键一律使用 INT 自增（AUTO_INCREMENT），禁止使用字符串、UUID 或其他类型作为主键。**

### 规范 2-2：时间字段存储时区
**所有数据库时间字段一律存储中国北京时间（Asia/Shanghai，UTC+8），禁止存 UTC 时间。**

实现方式：
- `.env` 设置 `TZ=Asia/Shanghai`，使 Node.js `new Date()` / `@updatedAt` 以北京时间运行
- `src/lib/prisma.ts` 通过 `$use` 中间件在每次查询前执行 `SET time_zone = '+08:00'`，确保 MySQL `CURRENT_TIMESTAMP` / `@default(now())` 也以北京时间写入

### 规范 2-3：表与字段必须填写注释
**创建或修改数据库表时，必须同时在以下两处写入注释：**

1. `prisma/schema.prisma` 中使用 `///` 三斜线注释说明每个 model 和 field 的用途
2. MySQL 实际表/列的 `COMMENT` 字段——修改 schema 后执行 `npm run db:comments` 同步

注释要求：简明说明字段用途、枚举值范围、单位等信息。

### 规范 2-4：禁止 SQL 注入写法
**项目使用 Prisma ORM，禁止直接拼接 SQL 字符串执行原生查询。**

- 禁止使用 `prisma.$queryRawUnsafe(userInput)` 或将用户数据直接拼入 `$queryRaw` 模板字符串
- 如需原生 SQL，必须使用带参数占位符的 `prisma.$queryRaw(Prisma.sql\`SELECT * FROM t WHERE id = ${id}\`)` 形式，由 Prisma 负责参数化
- 搜索关键词等字符串过滤使用 Prisma 的 `contains` / `startsWith`，不得手动拼 `LIKE '%' + keyword + '%'`

---

## 三、前端规范

### 规范 3-1：禁止使用浏览器原生弹窗控件
**禁止在任何地方使用 `window.alert()`、`window.confirm()`、`window.prompt()`。**

统一替换方案：
- 确认/危险操作 → 使用 `<ConfirmDialog>` 组件（`src/components/ui/ConfirmDialog.tsx`）
- 成功/失败/警告提示 → 使用 `toast`（`import { toast } from "@/store/toast"`）
  - `toast.success("操作成功")`
  - `toast.error("操作失败")`
  - `toast.info("提示信息")`

---

## 四、安全规范

### 规范 4-1：XSS（跨站脚本攻击）
**禁止将用户输入直接拼入 HTML 字符串或 DOM。**

- 禁止使用 `dangerouslySetInnerHTML`，如确有必要（如富文本渲染），须先用 `DOMPurify` 或 `sanitize-html` 对内容进行净化
- 所有用户输入在 React JSX 中通过 `{变量}` 插值渲染，React 会自动转义，切勿绕过
- 后端返回的数据渲染到页面前，不得通过字符串拼接方式插入
- Cookie 中的敏感 token 必须设置 `HttpOnly`，防止 JS 读取

### 规范 4-2：横向越权（IDOR）
**每个涉及资源操作的 API，必须校验当前登录用户是否拥有该资源的操作权限。**

- 所有 `GET / PATCH / DELETE` 操作，必须在数据库查询中附带 `userId`（或角色权限）条件，不能仅凭前端传入的 ID 直接操作
- 例：`prisma.task.findUnique({ where: { id, userId } })`，而非 `prisma.task.findUnique({ where: { id } })`
- 禁止依赖前端隐藏字段或 URL 参数来实现权限控制，后端必须独立鉴权
- 审批、导图、节点等资源的批量操作同样需要逐条校验归属

### 规范 4-3：身份认证
**所有需要登录才能访问的 API，必须在 Route Handler 入口处调用 `getAuth(req)` 进行身份验证。**

- `getAuth` 验证失败会抛出异常，由 `fail()` 统一返回 401，禁止在未验证前处理任何业务逻辑
- JWT/Session token 必须设置合理的过期时间，禁止永不过期
- 密码存储必须使用 bcrypt（cost ≥ 12）等强哈希算法，禁止明文或 MD5/SHA1 存储
- 登录接口须做频率限制（rate limiting），防止暴力破解；登录失败信息不得区分"用户不存在"和"密码错误"（防用户枚举）
- 敏感操作（修改密码、删除账号）须二次身份验证

### 规范 4-4：敏感信息泄露
**禁止将敏感数据暴露在客户端可访问的范围内。**

- `.env` 文件中的数据库连接串、密钥、第三方 API Key 等，只能在服务端使用，禁止以 `NEXT_PUBLIC_` 前缀暴露到客户端
- API 响应中不得返回密码哈希、内部 token、完整身份证号、完整银行卡号等敏感字段；手机号、邮箱等在列表接口中应做掩码处理（如 `138****8888`）
- 错误响应禁止返回数据库报错堆栈、文件路径、服务器内部信息；生产环境统一返回通用错误描述
- git 提交前必须确认 `.gitignore` 已排除 `.env`、`.env.local` 等配置文件

### 规范 4-5：XXE（XML 外部实体注入）
**项目中若需解析 XML / SVG / Office 文档，必须禁用外部实体加载。**

- 使用 `fast-xml-parser` 等库时，须设置 `allowDoctype: false`、`ignoreAttributes: false` 并关闭实体扩展
- 禁止直接使用浏览器或 Node.js 内置的无配置 XML 解析器处理来自用户的 XML 输入
- 上传接口若接受 `.svg`、`.xml`、`.docx` 等格式，须在服务端验证文件 MIME 类型，并在解析前剥离外部实体声明

### 规范 4-6：CSRF（跨站请求伪造）
**所有状态变更接口（POST / PATCH / DELETE）必须具备 CSRF 防护。**

- Next.js App Router 的 Server Actions 和 Route Handlers 默认不携带浏览器 Cookie 以外的凭证，前端使用 `Authorization: Bearer <token>` 头部鉴权，第三方站点无法伪造该头部，天然防 CSRF
- 如有表单使用 Cookie Session 鉴权，须附带 `SameSite=Strict` 或 `SameSite=Lax` 属性，并在接口侧校验 `Origin` / `Referer` 头
- 禁止使用 GET 请求执行任何写操作（创建、修改、删除）

### 规范 4-7：SSRF（服务端请求伪造）
**禁止将用户输入的 URL 直接用于服务端 HTTP 请求。**

- 若业务需要请求外部 URL（如图片代理、Webhook 回调），须对目标地址进行白名单校验，禁止请求内网 IP（`10.x`、`172.16-31.x`、`192.168.x`、`127.x`、`169.254.x`）及 `file://`、`gopher://` 等非 HTTP 协议
- 服务端请求须设置超时时间（≤ 5s），防止因外部服务挂起导致服务拒绝
- 上传接口若支持"通过 URL 抓取"功能，须先解析域名 IP 再做内网检测，防止 DNS 重绑定绕过

### 规范 4-8：HTTP 头注入（Header Injection）
**禁止将用户输入未经过滤地写入 HTTP 响应头。**

- 在 Route Handler 中设置自定义响应头时（如 `Content-Disposition`、`Location`、`Set-Cookie`），必须对值进行校验，去除 `\r`、`\n`、`\0` 等控制字符，防止响应头拆分攻击
- 重定向目标地址（`Location`）必须使用白名单或相对路径，禁止将用户输入的 URL 直接作为重定向目标
- `Content-Type` 头必须显式指定（如 `application/json; charset=utf-8`），防止 MIME 类型嗅探导致的 XSS
- 文件下载接口的 `Content-Disposition: attachment; filename=` 中的文件名须经过 `encodeURIComponent` 处理

---

## 五、文档规范

### 规范 5-1：SDD（模块设计文档）

SDD（Software Design Document）是每个模块开发前必须维护的设计说明。所有成员（含 AI 编程助手）在开发新功能或修改已有功能前，**必须先阅读对应模块的 SDD 文件**，开发完成后**必须同步更新 SDD**。

**文件位置与命名：**

```
.specs/modules/
├── M-01-{英文标识}.md
├── M-02-{英文标识}.md
└── ...
```

命名规则：`M-{两位序号}-{英文标识}.md`，序号从 01 开始，按模块创建顺序递增。

**SDD 文件必须包含以下章节**（带 `*` 的不得省略）：

```markdown
# M-XX 模块名称

## 概述 *
简要说明模块的职责和边界。

## 数据模型 *
列出涉及的数据表/模型，说明关键字段含义。

## API 接口 *
列出所有接口，包含请求方法、路径、入参、出参、权限要求。

## 业务逻辑
描述核心业务规则、状态流转、边界条件。

## 前端组件
列出主要页面和组件，说明各自职责。

## 变更记录 *
| 日期 | 编号 | 变更内容 | 原始需求 |
```

**SDD 状态标记：**

| 状态 | 含义 |
|------|------|
| `DRAFT` | 草稿，尚未实现或仍在规划中 |
| `ACTIVE` | 已实现，文档与代码保持同步 |
| `DEPRECATED` | 已废弃，不再维护 |

---

### 规范 5-2：结构化编号

项目所有文档、模块、任务统一使用结构化编号，**禁止使用无意义的随机 ID 或纯序号**。

**模块编号：** `M-{两位序号}`，例如 `M-01`、`M-02`。新增模块时在 `.specs/MODULES.md` 中登记，并创建对应的 SDD 文件。

**任务/需求编号：** `T-{模块编号}-{三位序号}`，例如 `T-01-001`（第 1 个模块的第 1 个任务）。在 `.specs/CHANGELOG.md` 中记录每个任务的状态和描述。

**Bug 编号：** `B-{模块编号}-{三位序号}`，例如 `B-01-001`。记录在 `.specs/CHANGELOG.md` 的 Bug 区块中。

---

### 规范 5-3：需求变更 & 迭代日志

**每一次功能新增、需求变更、Bug 修复，必须同步更新以下文档，不得遗漏。**

**需要更新的文档清单：**

| 变更类型 | 必须更新的文件 |
|----------|--------------|
| 新增模块 | `.specs/MODULES.md`、新建对应 `M-XX-xxx.md` |
| 新增功能（已有模块） | 对应 `M-XX-xxx.md` 的接口/组件/业务逻辑章节 + 变更记录 |
| 需求变更 | 对应 `M-XX-xxx.md` 变更记录 + `.specs/CHANGELOG.md` |
| Bug 修复 | `.specs/CHANGELOG.md` |
| 数据库模型变更 | 数据库 schema 定义文件（含注释）+ 执行注释同步脚本（如有） |
| 删除/废弃功能 | 对应 SDD 状态改为 `DEPRECATED` + `.specs/CHANGELOG.md` |

**CHANGELOG 格式**（文件路径：`.specs/CHANGELOG.md`）：

```markdown
# 变更日志

## [YYYY-MM-DD] 版本或迭代描述

### 新增
- T-XX-001 简要描述新增功能

### 变更
- T-XX-002 简要描述变更内容

### 修复
- B-XX-001 简要描述修复内容

### 数据库
- 表名 新增/修改/删除字段说明
```

**SDD 变更记录格式**（追加在每个 `M-XX-xxx.md` 文件末尾）：

```markdown
## 变更记录

| 日期 | 编号 | 变更内容 | 原始需求 |
|------|------|----------|----------|
| YYYY-MM-DD | T-XX-001 | 变更描述 | 需求来源 |
```

**Agent 完成每次开发任务后，必须按以下顺序执行文档更新，不得跳过：**

1. 更新对应模块 SDD（`M-XX-xxx.md`）中的接口/组件/业务逻辑描述
2. 在 SDD 变更记录表追加一行
3. 在 `.specs/CHANGELOG.md` 追加本次变更条目
4. 如有数据库模型变更，同步更新 schema 注释并执行注释同步脚本（如有）
5. 如涉及新模块，在 `.specs/MODULES.md` 登记
