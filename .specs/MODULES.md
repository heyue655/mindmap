# 模块注册表

本项目按功能领域划分为以下模块，每个模块对应一个 SDD 文件。

| 编号 | 英文标识 | 模块名称 | SDD 文件 | 状态 |
|------|----------|----------|----------|------|
| M-01 | auth | 认证与授权 | [M-01-auth.md](modules/M-01-auth.md) | ACTIVE |
| M-02 | workspace | 工作区快照同步 | [M-02-workspace.md](modules/M-02-workspace.md) | ACTIVE |
| M-03 | org | 组织与汇报关系 | [M-03-org.md](modules/M-03-org.md) | ACTIVE |
| M-04 | mindmap | 思维导图与节点 | [M-04-mindmap.md](modules/M-04-mindmap.md) | ACTIVE |
| M-05 | assignment | 任务派发与协作 | [M-05-assignment.md](modules/M-05-assignment.md) | ACTIVE |
| M-06 | reports | 工作汇报 | [M-06-reports.md](modules/M-06-reports.md) | ACTIVE |
| M-07 | notifications | 通知中心 | [M-07-notifications.md](modules/M-07-notifications.md) | ACTIVE |
| M-08 | user-mgmt | 用户管理 | [M-08-user-mgmt.md](modules/M-08-user-mgmt.md) | ACTIVE |
| M-09 | dept-mgmt | 部门管理 | [M-09-dept-mgmt.md](modules/M-09-dept-mgmt.md) | ACTIVE |
| M-10 | dingtalk-integration | 钉钉集成 | [M-07-DingTalkIntegration.md](modules/M-07-DingTalkIntegration.md) | ACTIVE |

## 新增模块规范

1. 在本表末尾追加一行，编号递增
2. 在 `modules/` 目录新建对应 SDD 文件（`M-XX-{英文标识}.md`）
3. 在 `.specs/CHANGELOG.md` 记录新增动作
