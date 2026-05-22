## 修改需求

### 需求:管理员编辑用户信息
管理员必须能够在用户编辑表单中查看和修改用户的 `dingtalkUserId` 字段。该字段为可选文本输入，标签显示为"钉钉用户ID"，支持置空（清除绑定）。保存时若 `dingtalkUserId` 非空，系统必须自动将该用户的 `dingtalkBound` 字段同步为 `true`；若为空，则同步为 `false`。管理员编辑表单必须自动带出当前用户的所有数据（含 `dingtalkUserId`）。

#### 场景:管理员填写钉钉用户ID并保存
- **当** 管理员在用户编辑表单中填写 `dingtalkUserId` 并提交
- **那么** 系统将 `dingtalkUserId` 和 `dingtalkBound=true` 同步保存到数据库

#### 场景:管理员清空钉钉用户ID
- **当** 管理员将 `dingtalkUserId` 字段清空并提交
- **那么** 系统将 `dingtalkUserId` 置为 null，`dingtalkBound` 置为 false

#### 场景:编辑表单自动带出现有钉钉用户ID
- **当** 管理员打开某用户的编辑表单
- **那么** 表单中 `dingtalkUserId` 输入框显示该用户当前保存的值（可为空）
