# M-05 任务派发与协作

**状态：ACTIVE**

## 概述

支持上级向下级派发任务（Assignment）和节点关注授权（FollowGrant）。派发任务后下级需在「待我处理」收件箱中确认、协商或拒绝。

## 数据模型

### assignments 表

| 字段 | 说明 |
|------|------|
| id | INT 自增主键 |
| assignerId | 派任务者（上级） |
| assigneeId | 被派任务者（下级） |
| targetMindmapId | 落地导图 ID（可为 NULL，登录时 reconciliation 自动填充） |
| targetSkeletonNodeId | 落地骨架节点 ID（可为 NULL，登录时 reconciliation 自动填充） |
| timeBucketKind | 时间桶类型：quarter / month（用于 reconciliation 匹配） |
| timeBucketValue | 时间桶值，如 "2025-Q1"（用于 reconciliation 匹配） |
| state | pending / accepted / negotiating / rejected / completed |
| proposedTitle / proposedDescription / proposedDeadline / proposedPriority | 任务提议 |
| resultNodeId | 下级接受后创建的节点 ID |
| assignerMirrorNodeId | 上级导图中的镜像节点 ID |
| assignerSourceNodeId | 派任务时上级选中的自己导图中的原始普通节点 ID（无 task/taskPeer 时记录）；接受后该节点直接升级为 mirror |

### follow_grants 表

| 字段 | 说明 |
|------|------|
| id | INT 自增主键 |
| requesterId | 申请查看者 |
| granteeId | 被申请人（节点所有者） |
| targetNodeId | 目标节点 |
| scope | read_node / read_subtree |
| state | pending / approved / rejected |
| expiresAt | 授权到期时间 |

## API 接口

通过 `GET/PUT /api/workspace`（M-02）整体同步；暂无独立的 Assignment CRUD 接口。

## 业务逻辑

- 派任务流程：assigner 填写提议 → assignee 在收件箱处理（接受/协商/拒绝）
- 接受后：在 assignee 导图中创建节点，assigner 导图中创建/升级镜像节点，双方节点通过 `taskPeer` 字段互相关联
- **mirror 节点创建策略（T-05-003）**：
  - 若 `assignment.assignerSourceNodeId` 存在，且对应节点无 `task` / `taskPeer` → 就地升级该节点（追加 `task` + `taskPeer`，走 `updatedNodes`），`isUpgrade=true`
  - 否则（节点已有 task/taskPeer，或 `assignerSourceNodeId` 未设置）→ 走原有流程新建 mirror 节点（走 `newNodes`），`isUpgrade=false`
  - `AcceptResult.updatedNodes` 存放就地升级的已有节点，调用方需对其做 map 更新（而非 push 追加），防止重复节点
- 关注授权：下级申请上级关注自己的某任务节点（requesterId=下级，granteeId=上级）；上级在收件箱批准后：
  - 若上级导图存在匹配骨架节点：在上级导图创建镜像节点并与原节点互链（`taskPeer`）；
  - 若不存在匹配骨架：权限仍授予（state=granted），toast 提示未能创建副本；原节点可在「团队视图」通过 canRead rule 4 查看
- TeamPage `allMembers` 合并 OrgRelation（`getAllSolidDescendants`）+ User.managerId 链（`getAllDescendantsByManagerId`）两路下属来源，去重展示，兜底历史数据

### GET /api/workspace 跨用户节点加载（B-05-005）

`getHandler` 在加载完自有 mindmaps/nodes 后，额外执行以下逻辑：

1. 收集 **crossNodeIds**：
   - 所有 `FollowGrant` 中 `granteeId === userId`（含 `pending`）的 `targetNodeId`
   - 所有 `Assignment` 中 `assignerId === userId` 且 `resultNodeId != null` 的 `resultNodeId`
2. 查询这些节点的 `mindmapId`，排除已属于当前用户的导图，得到 **extraMindmapIds**
3. 并发加载 extraMindmaps / extraNodes（非删除）/ extraRelationships / extraLogs
4. 与自有数据以 id 去重合并后写入 snapshot

**原因**：`pairNodesForFollowGrant` 需要在 `nodes` 状态中找到 `target`（下级节点）和下级导图的骨架节点，才能在上级导图中创建副本。TeamPage 也需要下级节点数据才能展示任务状态。前端 `canRead` 规则仍负责可见性过滤，额外数据不越权暴露。

### GET /api/workspace 下属骨架数据加载（B-05-007 + B-05-008）

在跨用户加载之后：

1. BFS 遍历下属（双路：User.managerId 链 + OrgRelation solid），得到 **subordinateIds**
2. 加载下属全部 mindmap（subMindmaps）
3. **B-05-008 新增**：对每个没有当前年度年度导图的下属，代为自动创建年度导图 + 12 月 + 4 季度骨架节点（与当前用户自动初始化逻辑相同）。保证首次派任务时能找到目标骨架节点。
4. 加载 subMindmaps 中所有 `nodeType="skeleton"` 节点（轻量），合并到 mergedNodes

### PUT /api/workspace 数据保护（B-05-009）

PUT handler 的两处"孤儿数据清理"原无 ownerId 约束，会误删下属数据：

- **节点软删除**：`snapMindmapIds` 含下属导图 ID；下属的 task 节点不在 `snapNodeIds` 中（仅 skeleton 节点在）→ 修复：加 `mindmap: { ownerId: userId }` 过滤，只软删自己的节点
- **联系线删除**：同上，`Relationship` 无 mindmap 关联，改用 `createdBy: userId` 过滤，只删自己创建的联系线

## 前端组件

- `src/pages/TeamPage.tsx`：管理者视图，展示下属任务状态，入口派发新任务；任务列表按最近更新时间倒序排列（无更新记录的以截止日期倒序兜底）
- `src/features/assignment/AssignDialog.tsx`：派任务对话框
- `src/app/(app)/inbox/page.tsx` → `src/pages/InboxPage.tsx`：收件箱，处理待办

## 变更记录

| 日期 | 编号 | 变更内容 | 原始需求 |
|------|------|----------|----------|
| 2026-05-19 | T-05-001 | TeamPage 迁移至 Next.js | Next.js 迁移 |
| 2026-05-19 | B-05-001 | AssignDialog：alert → toast.error / toast.success | 规范 3-1 |
| 2026-05-19 | B-05-002 | RequestFollowDialog：ancestors 合并 OrgRelation + User.managerId 两路来源 | 修复申请关注提示"没有上级" |
| 2026-05-19 | B-05-003 | ShareDialog：同上，修复分享弹窗"没有上级"问题 | 修复分享提示"没有上级" |
| 2026-05-19 | B-05-004 | InboxPage `decideFollow`：pair=null 时增加 toast.info 提示副本未创建；pair 成功时增加 toast.success | 明确同意关注后的 UX 反馈 |
| 2026-05-19 | B-03-001 | TeamPage `allMembers` 合并 OrgRelation + managerId 两路来源，去重；isManager 兜底 | 修复历史数据 OrgRelation 缺失导致 TeamPage 下属不可见 |
| 2026-05-19 | B-05-005 | GET /api/workspace 跨用户节点加载：上级审批关注/查看派任务结果时，将下级节点及其导图数据合并到快照，修复 `pairNodesForFollowGrant` 返回 null 及 TeamPage 下属任务不可见问题 | 修复关注审批副本创建失败、TeamPage 下属任务不显示 |
| 2026-05-19 | B-05-006 | AssignDialog `directReportIds`/`allReportIds`：合并 OrgRelation + User.managerId 两路下属来源，去重后展示，修复派任务界面下属列表为空 | 修复派任务界面无法带出下属 |
| 2026-05-19 | B-05-007 | GET /api/workspace 加载下属骨架数据：通过 User.managerId 链 BFS 找所有下属，加载其 mindmap 及 skeleton 节点，确保 AssignDialog 中 mindmapForAssigneeBucket 能匹配到目标骨架，修复"派出"按钮点击无效（所有 assignee 被跳过导致 toast.error 或按钮 disabled） | 修复派出按钮点击无效 |
| 2026-05-19 | B-05-008 | GET /api/workspace：为没有当前年度导图的下属代为自动创建年度导图 + 骨架节点，解决下属从未登录时派任务全部被跳过的问题 | 修复派出无匹配骨架节点 |
| 2026-05-19 | B-05-009 | PUT /api/workspace 节点软删除加 `mindmap.ownerId` 约束、联系线删除加 `createdBy` 约束，防止管理者保存工作区时误删下属的 task 节点和联系线 | 修复数据污染 Bug |
| 2026-05-19 | B-05-010 | TeamPage `relevantTasks` 排序由桶时间升序改为最近更新时间（`lastUpdateAt`）倒序，无更新记录的以截止日期倒序兜底 | 团队视图数据应按时间倒序展示 |
| 2026-05-21 | T-05-002 | AssignDialog `handleSubmit` 改为 async；指派前 JIT 调用 `POST /api/workspace/ensure-subordinate-mindmap` 为无年度导图的下属初始化数据，并将结果 merge 到 store；骨架节点解析由 `resolveSkeletonForAssignee` 改为直接基于 workingNodes 内联查找 | 优化登录初始化策略 |
| 2026-05-19 | T-05-002 | AssignDialog 优化：①新增 `presetNode` prop，打开时自动带出选中节点标题和截止日期（任务节点取 task.deadline，普通节点取 title，截止日期默认今天）；②删除手动「放到他们月份」选择器，改由截止日期变化时自动推断所属月份 bucket；③字段顺序调整为：标题→描述→指派给→截止日期→优先级 | 派任务界面体验优化 |
| 2026-05-20 | T-05-003 | `Assignment` 新增 `assignerSourceNodeId`；`pairNodesForAssignmentMirror` 就地升级分支；`AcceptResult.updatedNodes`；`InboxPage applyAcceptResult` | 上级原节点就地升级为 mirror |
| 2026-05-22 | T-05-004 | 重新设计指派策略为"存储意图"模式：`assignments.targetMindmapId`/`targetSkeletonNodeId` 改为可空；新增 `timeBucketKind`/`timeBucketValue` 字段；AssignDialog 去除 JIT 逻辑，无论下属是否有导图均无条件创建 assignment；GET /api/workspace 登录时执行 dangling assignment reconciliation 自动补填目标字段；InboxPage/assignment.ts 对 null 目标加防御性守卫 | 彻底解决下属无导图时派任务被跳过问题 |
