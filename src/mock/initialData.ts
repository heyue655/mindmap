import type {
  AppNotification,
  Assignment,
  CalendarSync,
  FollowGrant,
  MentionEvent,
  MindMap,
  Node,
  NodeShare,
  Relationship,
  TaskLog,
  WorkReport,
} from "@/types";
import { generateSkeleton } from "@/lib/skeleton";
import { users } from "./org";

const YEAR = 2026;
const NOW = "2026-04-27T10:00:00.000Z";

// 为每个用户造一张 MindMap（默认就是"年度模板"风格 · 向右逻辑图 · 默认主题）
export const mindmaps: MindMap[] = users.map((u) => ({
  id: `mm-${u.id}`,
  ownerId: u.id,
  year: YEAR,
  structure: "right-logic",
  theme: "snowbrush",
  useAnnualTemplate: true,
}));

// 额外造一张 XMind 演示用的"空白图"，挂在 JOJO 名下，演示中心放射 / 概要 / 边界 / 联系线
mindmaps.push({
  id: "mm-xmind-demo",
  ownerId: "u-fe-dev1",
  year: YEAR,
  title: "XMind 演示图",
  structure: "mindmap",
  theme: "snowbrush",
  useAnnualTemplate: false,
});

// 骨架节点（仅给"年度模板"图生成）
const skeletonNodes: Node[] = mindmaps
  .filter((mm) => mm.useAnnualTemplate)
  .flatMap((mm) =>
    generateSkeleton({ mindmapId: mm.id, ownerId: mm.ownerId, year: YEAR }),
  );

// XMind demo 图的演示节点：中心 + 4 个分支 + 子节点 + 概要 + 边界 + 联系线
const xmindDemoNodes: Node[] = [
  {
    id: "xd-root",
    mindmapId: "mm-xmind-demo",
    sortOrder: 0,
    title: "2026 年度规划",
    description: "中心主题",
    nodeType: "normal",
    createdBy: "u-fe-dev1",
    createdAt: NOW,
    updatedAt: NOW,
    isDeleted: false,
    notes: "这是一张 XMind 风格的演示图：中心放射结构 + 概要 / 边界 / 联系线 / 笔记",
  },
  // 4 个一级分支
  {
    id: "xd-b1",
    mindmapId: "mm-xmind-demo",
    parentId: "xd-root",
    sortOrder: 0,
    title: "技术",
    nodeType: "normal",
    createdBy: "u-fe-dev1",
    createdAt: NOW,
    updatedAt: NOW,
    isDeleted: false,
    labels: ["架构"],
  },
  {
    id: "xd-b2",
    mindmapId: "mm-xmind-demo",
    parentId: "xd-root",
    sortOrder: 1,
    title: "团队",
    nodeType: "normal",
    createdBy: "u-fe-dev1",
    createdAt: NOW,
    updatedAt: NOW,
    isDeleted: false,
  },
  {
    id: "xd-b3",
    mindmapId: "mm-xmind-demo",
    parentId: "xd-root",
    sortOrder: 2,
    title: "成长",
    nodeType: "normal",
    createdBy: "u-fe-dev1",
    createdAt: NOW,
    updatedAt: NOW,
    isDeleted: false,
  },
  {
    id: "xd-b4",
    mindmapId: "mm-xmind-demo",
    parentId: "xd-root",
    sortOrder: 3,
    title: "生活",
    nodeType: "normal",
    createdBy: "u-fe-dev1",
    createdAt: NOW,
    updatedAt: NOW,
    isDeleted: false,
  },
  // 技术下的子节点（用来演示概要）
  {
    id: "xd-b1-1",
    mindmapId: "mm-xmind-demo",
    parentId: "xd-b1",
    sortOrder: 0,
    title: "前端工程化",
    nodeType: "normal",
    createdBy: "u-fe-dev1",
    createdAt: NOW,
    updatedAt: NOW,
    isDeleted: false,
    markers: ["priority-1"],
  },
  {
    id: "xd-b1-2",
    mindmapId: "mm-xmind-demo",
    parentId: "xd-b1",
    sortOrder: 1,
    title: "组件库 v3",
    nodeType: "normal",
    createdBy: "u-fe-dev1",
    createdAt: NOW,
    updatedAt: NOW,
    isDeleted: false,
  },
  {
    id: "xd-b1-3",
    mindmapId: "mm-xmind-demo",
    parentId: "xd-b1",
    sortOrder: 2,
    title: "性能监控",
    nodeType: "normal",
    createdBy: "u-fe-dev1",
    createdAt: NOW,
    updatedAt: NOW,
    isDeleted: false,
  },
  // 概要节点：把上面三个汇总成"H1 技术目标"
  {
    id: "xd-sum-1",
    mindmapId: "mm-xmind-demo",
    parentId: "xd-b1",
    sortOrder: 99,
    title: "H1 技术目标",
    nodeType: "normal",
    createdBy: "u-fe-dev1",
    createdAt: NOW,
    updatedAt: NOW,
    isDeleted: false,
    summaryRange: ["xd-b1-1", "xd-b1-2", "xd-b1-3"],
  },
  // 团队下的子节点（用来演示边界）
  {
    id: "xd-b2-1",
    mindmapId: "mm-xmind-demo",
    parentId: "xd-b2",
    sortOrder: 0,
    title: "招聘 2 名前端",
    nodeType: "normal",
    createdBy: "u-fe-dev1",
    createdAt: NOW,
    updatedAt: NOW,
    isDeleted: false,
  },
  {
    id: "xd-b2-2",
    mindmapId: "mm-xmind-demo",
    parentId: "xd-b2",
    sortOrder: 1,
    title: "梯度培养",
    nodeType: "normal",
    createdBy: "u-fe-dev1",
    createdAt: NOW,
    updatedAt: NOW,
    isDeleted: false,
  },
  // 边界节点：把团队下的 2 个圈起来
  {
    id: "xd-bnd-1",
    mindmapId: "mm-xmind-demo",
    parentId: "xd-b2",
    sortOrder: 100,
    title: "组织保障",
    nodeType: "normal",
    createdBy: "u-fe-dev1",
    createdAt: NOW,
    updatedAt: NOW,
    isDeleted: false,
    boundaryRange: ["xd-b2-1", "xd-b2-2"],
  },
  // 浮动主题
  {
    id: "xd-floating-1",
    mindmapId: "mm-xmind-demo",
    sortOrder: 0,
    title: "灵感记录",
    description: "随手记的浮动主题，不挂在任何分支下",
    nodeType: "normal",
    createdBy: "u-fe-dev1",
    createdAt: NOW,
    updatedAt: NOW,
    isDeleted: false,
    isFloating: true,
    floatX: 80,
    floatY: 80,
    notes: "浮动主题：不属于任何中心层级，可自由移动",
  },
];

// 给几个员工造点示例任务节点（挂在月份骨架下）
function taskNode(opts: {
  id: string;
  mindmapId: string;
  parentId: string;
  sortOrder: number;
  title: string;
  description?: string;
  status: "not_started" | "in_progress" | "done" | "blocked";
  progressPct: number;
  priority: "P0" | "P1" | "P2" | "P3";
  ownerId: string;
  deadline?: string;
  markers?: string[];
}): Node {
  return {
    id: opts.id,
    mindmapId: opts.mindmapId,
    parentId: opts.parentId,
    sortOrder: opts.sortOrder,
    title: opts.title,
    description: opts.description,
    nodeType: "normal",
    createdBy: opts.ownerId,
    createdAt: NOW,
    updatedAt: NOW,
    isDeleted: false,
    markers: opts.markers,
    task: {
      status: opts.status,
      progressPct: opts.progressPct,
      priority: opts.priority,
      deadline: opts.deadline,
      ownerId: opts.ownerId,
      openedAt: NOW,
      closedAt: opts.status === "done" ? NOW : undefined,
    },
  };
}

// JOJO（前端工程师）的任务
const jojoTasks: Node[] = [
  taskNode({
    id: "t-jojo-1",
    mindmapId: "mm-u-fe-dev1",
    parentId: "sk-u-fe-dev1-y2026m04",
    sortOrder: 0,
    title: "完成思维导图组件 MVP",
    description: "支持节点 CRUD、缩放、拖拽",
    status: "in_progress",
    progressPct: 60,
    priority: "P0",
    ownerId: "u-fe-dev1",
    deadline: "2026-04-30",
    markers: ["priority-1", "task-50", "symbol-fire"],
  }),
  taskNode({
    id: "t-jojo-2",
    mindmapId: "mm-u-fe-dev1",
    parentId: "sk-u-fe-dev1-y2026m04",
    sortOrder: 1,
    title: "节点详情抽屉交互",
    status: "not_started",
    progressPct: 0,
    priority: "P1",
    ownerId: "u-fe-dev1",
    deadline: "2026-05-10",
  }),
  taskNode({
    id: "t-jojo-3",
    mindmapId: "mm-u-fe-dev1",
    parentId: "sk-u-fe-dev1-y2026m03",
    sortOrder: 0,
    title: "学习 React Server Components",
    status: "done",
    progressPct: 100,
    priority: "P2",
    ownerId: "u-fe-dev1",
  }),
  taskNode({
    id: "t-jojo-4",
    mindmapId: "mm-u-fe-dev1",
    parentId: "sk-u-fe-dev1-y2026m05",
    sortOrder: 0,
    title: "UI 组件库性能优化",
    description: "Bundle size 降到 200KB 以内",
    status: "blocked",
    progressPct: 30,
    priority: "P1",
    ownerId: "u-fe-dev1",
    deadline: "2026-05-25",
    markers: ["flag-red", "symbol-warning"],
  }),
];

// 孟增（前端 Lead）自己的任务
const mengTasks: Node[] = [
  taskNode({
    id: "t-meng-1",
    mindmapId: "mm-u-fe-lead",
    parentId: "sk-u-fe-lead-y2026q2",
    sortOrder: 0,
    title: "组建前端组招聘计划",
    status: "in_progress",
    progressPct: 40,
    priority: "P0",
    ownerId: "u-fe-lead",
    deadline: "2026-06-30",
  }),
  taskNode({
    id: "t-meng-2",
    mindmapId: "mm-u-fe-lead",
    parentId: "sk-u-fe-lead-y2026m04",
    sortOrder: 0,
    title: "推动 Design System 落地",
    status: "in_progress",
    progressPct: 70,
    priority: "P1",
    ownerId: "u-fe-lead",
    deadline: "2026-04-30",
    markers: ["star-yellow", "task-75"],
  }),
];

// Tina 的任务
const tinaTasks: Node[] = [
  taskNode({
    id: "t-tina-1",
    mindmapId: "mm-u-fe-dev2",
    parentId: "sk-u-fe-dev2-y2026m04",
    sortOrder: 0,
    title: "登录页改版",
    status: "in_progress",
    progressPct: 50,
    priority: "P1",
    ownerId: "u-fe-dev2",
    deadline: "2026-04-28",
  }),
];

export const initialNodes: Node[] = [
  ...skeletonNodes,
  ...jojoTasks,
  ...mengTasks,
  ...tinaTasks,
  ...xmindDemoNodes,
];

// 派任务：孟增派给 JOJO 的一条 pending（让 JOJO 登录后能看到待办）
export const initialAssignments: Assignment[] = [
  {
    id: "asg-1",
    assignerId: "u-fe-lead",
    assigneeId: "u-fe-dev1",
    targetMindmapId: "mm-u-fe-dev1",
    targetSkeletonNodeId: "sk-u-fe-dev1-y2026m05",
    proposedTitle: "调研并落地 i18n 方案",
    proposedDescription: "覆盖中英文，支持运行时切换",
    proposedDeadline: "2026-05-20",
    proposedPriority: "P1",
    state: "pending",
    createdAt: NOW,
  },
  // 已 accepted 的派任务：吴产品（产品VP）→ Alice → 已落地为 Alice 的任务节点
  {
    id: "asg-2",
    assignerId: "u-prod-vp",
    assigneeId: "u-pm1",
    targetMindmapId: "mm-u-pm1",
    targetSkeletonNodeId: "sk-u-pm1-y2026m04",
    proposedTitle: "用户调研报告 Q2",
    proposedPriority: "P0",
    state: "accepted",
    resultNodeId: "t-alice-from-vp",
    assignerMirrorNodeId: "t-alice-from-vp-mirr",
    createdAt: "2026-04-15T10:00:00.000Z",
    resolvedAt: "2026-04-16T09:00:00.000Z",
  },
  // 孟增（前端 ld）派给 JOJO 一条已经接受的任务，模拟"上级看下级进度"的场景
  {
    id: "asg-3",
    assignerId: "u-fe-lead",
    assigneeId: "u-fe-dev1",
    targetMindmapId: "mm-u-fe-dev1",
    targetSkeletonNodeId: "sk-u-fe-dev1-y2026m04",
    proposedTitle: "组件库迁移到 v3",
    proposedDescription: "把项目里散落的旧版组件统一迁到 v3 API",
    proposedDeadline: "2026-04-28",
    proposedPriority: "P0",
    state: "accepted",
    resultNodeId: "t-jojo-from-meng",
    assignerMirrorNodeId: "t-jojo-from-meng-mirr",
    createdAt: "2026-04-10T03:00:00.000Z",
    resolvedAt: "2026-04-10T08:30:00.000Z",
  },
  // 孟增派给 Tina 一条 pending（让 Tina 也有事干，让"派出"tab 顶部出现红点）
  {
    id: "asg-4",
    assignerId: "u-fe-lead",
    assigneeId: "u-fe-dev2",
    targetMindmapId: "mm-u-fe-dev2",
    targetSkeletonNodeId: "sk-u-fe-dev2-y2026m04",
    proposedTitle: "登录页 A/B 实验",
    proposedDescription: "对照新旧设计跑 1 周 AB",
    proposedDeadline: "2026-04-25",
    proposedPriority: "P1",
    state: "pending",
    createdAt: "2026-04-22T02:00:00.000Z",
  },
];

// 把 asg-2 派下去落地的节点也加进去
initialNodes.push({
  ...taskNode({
    id: "t-alice-from-vp",
    mindmapId: "mm-u-pm1",
    parentId: "sk-u-pm1-y2026m04",
    sortOrder: 0,
    title: "用户调研报告 Q2",
    description: "由吴产品派给的任务",
    status: "in_progress",
    progressPct: 35,
    priority: "P0",
    ownerId: "u-pm1",
    deadline: "2026-04-30",
  }),
  taskPeer: {
    peerNodeId: "t-alice-from-vp-mirr",
    peerMindmapId: "mm-u-prod-vp",
    peerUserId: "u-prod-vp",
    kind: "assignment",
    iAmExecutor: true,
    syncProgressToPeer: true,
    refAssignmentId: "asg-2",
  },
});

// asg-3 派下去落地的节点（JOJO 在做的，由孟增派的任务）+ 孟增导图上的关联副本
initialNodes.push({
  ...taskNode({
    id: "t-jojo-from-meng",
    mindmapId: "mm-u-fe-dev1",
    parentId: "sk-u-fe-dev1-y2026m04",
    sortOrder: 5,
    title: "组件库迁移到 v3",
    description: "由孟增派给我的任务，已开始拆分子模块",
    status: "in_progress",
    progressPct: 60,
    priority: "P0",
    ownerId: "u-fe-dev1",
    deadline: "2026-04-28",
    markers: ["priority-1", "task-75"],
  }),
  taskPeer: {
    peerNodeId: "t-jojo-from-meng-mirr",
    peerMindmapId: "mm-u-fe-lead",
    peerUserId: "u-fe-lead",
    kind: "assignment",
    iAmExecutor: true,
    syncProgressToPeer: true,
    refAssignmentId: "asg-3",
  },
});

initialNodes.push({
  ...taskNode({
    id: "t-jojo-from-meng-mirr",
    mindmapId: "mm-u-fe-lead",
    parentId: "sk-u-fe-lead-y2026m04",
    sortOrder: 1,
    title: "组件库迁移到 v3",
    description: "由孟增派给我的任务，已开始拆分子模块",
    status: "in_progress",
    progressPct: 60,
    priority: "P0",
    ownerId: "u-fe-dev1",
    deadline: "2026-04-28",
    markers: ["priority-1", "task-75"],
  }),
  createdBy: "u-fe-lead",
  taskPeer: {
    peerNodeId: "t-jojo-from-meng",
    peerMindmapId: "mm-u-fe-dev1",
    peerUserId: "u-fe-dev1",
    kind: "assignment",
    iAmExecutor: false,
    refAssignmentId: "asg-3",
  },
});

initialNodes.push({
  ...taskNode({
    id: "t-alice-from-vp-mirr",
    mindmapId: "mm-u-prod-vp",
    parentId: "sk-u-prod-vp-y2026m04",
    sortOrder: 0,
    title: "用户调研报告 Q2",
    description: "由吴产品派给的任务",
    status: "in_progress",
    progressPct: 35,
    priority: "P0",
    ownerId: "u-pm1",
    deadline: "2026-04-30",
  }),
  createdBy: "u-prod-vp",
  taskPeer: {
    peerNodeId: "t-alice-from-vp",
    peerMindmapId: "mm-u-pm1",
    peerUserId: "u-pm1",
    kind: "assignment",
    iAmExecutor: false,
    refAssignmentId: "asg-2",
  },
});

// 关注：JOJO 申请 Alice 关注他的某个分支
export const initialFollows: FollowGrant[] = [
  {
    id: "fg-1",
    requesterId: "u-fe-dev1",
    granteeId: "u-pm1",
    targetNodeId: "t-jojo-1",
    scope: "single_task",
    state: "pending",
    expiresAt: "2026-07-27T00:00:00.000Z",
    reason: "这个组件直接影响 PM 演示效果，希望你能盯进度",
    createdAt: NOW,
  },
];

// 主动分享：Tina 把登录页改版分享给孟增
export const initialShares: NodeShare[] = [
  {
    id: "ns-1",
    sharerId: "u-fe-dev2",
    audienceId: "u-fe-lead",
    nodeId: "t-tina-1",
    createdAt: NOW,
  },
];

// 任务日志（部分任务有更新历史）
export const initialLogs: TaskLog[] = [
  {
    id: "log-1",
    nodeId: "t-jojo-1",
    authorId: "u-fe-dev1",
    logType: "progress_change",
    contentText: "完成节点添加和删除，进度 60%",
    contentMeta: { from: 30, to: 60 },
    createdAt: "2026-04-25T15:00:00.000Z",
  },
  {
    id: "log-2",
    nodeId: "t-jojo-1",
    authorId: "u-fe-dev1",
    logType: "comment",
    contentText: "缩放交互参考了 Figma，鼠标滚轮 + Ctrl 触发",
    createdAt: "2026-04-26T11:30:00.000Z",
  },
  {
    id: "log-3",
    nodeId: "t-jojo-4",
    authorId: "u-fe-dev1",
    logType: "status_change",
    contentText: "状态：进行中 → 阻塞",
    contentMeta: { from: "in_progress", to: "blocked" },
    createdAt: "2026-04-26T14:00:00.000Z",
  },
  {
    id: "log-4",
    nodeId: "t-jojo-4",
    authorId: "u-fe-dev1",
    logType: "comment",
    contentText: "等设计同学的最终 token 表，预计 4/29 拿到",
    createdAt: "2026-04-26T14:01:00.000Z",
  },
  // 由孟增派给 JOJO 的任务的更新（让"派出"tab 顶部出现"最近更新"预览）
  {
    id: "log-5",
    nodeId: "t-jojo-from-meng",
    authorId: "u-fe-dev1",
    logType: "progress_change",
    contentText: "进度：30% → 60%",
    contentMeta: { from: 30, to: 60 },
    createdAt: "2026-04-26T17:30:00.000Z",
  },
  {
    id: "log-6",
    nodeId: "t-jojo-from-meng",
    authorId: "u-fe-dev1",
    logType: "comment",
    contentText: "已完成 Button/Input/Select 三组迁移，剩 Modal 和 Drawer",
    createdAt: "2026-04-26T17:35:00.000Z",
  },
  // 吴产品派给 Alice 的任务的更新
  {
    id: "log-7",
    nodeId: "t-alice-from-vp",
    authorId: "u-pm1",
    logType: "progress_change",
    contentText: "进度：20% → 35%",
    contentMeta: { from: 20, to: 35 },
    createdAt: "2026-04-25T10:00:00.000Z",
  },
];

// 通知（给当前需要演示的用户造一些）
export const initialNotifications: AppNotification[] = [
  {
    id: "n-1",
    recipientId: "u-fe-dev1",
    actorId: "u-fe-lead",
    kind: "assignment_received",
    title: "孟增 派给你一个新任务",
    body: "调研并落地 i18n 方案 · 5 月 20 日",
    refAssignmentId: "asg-1",
    createdAt: NOW,
    dingtalkPushedAt: NOW,
  },
  // 演示：discuss @ 提及通知
  {
    id: "n-mention-1",
    recipientId: "u-fe-dev1",
    actorId: "u-fe-lead",
    kind: "mentioned_discuss",
    title: "孟增 在评论里 @ 了你",
    body: "@JOJO 这个 v3 迁移的进度还来得及周五前吗？",
    refNodeId: "t-jojo-from-meng",
    createdAt: "2026-04-26T17:50:00.000Z",
    dingtalkPushedAt: "2026-04-26T17:50:01.000Z",
  },
  // 演示：日历回写
  {
    id: "n-cal-1",
    recipientId: "u-fe-dev1",
    kind: "calendar_completion",
    title: "Mac 日历：你勾选了一项任务为完成",
    body: "学习 React Server Components",
    refNodeId: "t-jojo-3",
    calendarProvider: "mac",
    createdAt: "2026-04-20T08:01:00.000Z",
  },
  {
    id: "n-2",
    recipientId: "u-fe-lead",
    actorId: "u-fe-dev2",
    kind: "node_shared",
    title: "Tina 分享了任务给你",
    body: "登录页改版",
    refNodeId: "t-tina-1",
    createdAt: NOW,
  },
  {
    id: "n-3",
    recipientId: "u-pm1",
    actorId: "u-fe-dev1",
    kind: "follow_request_received",
    title: "JOJO 申请你关注一个任务",
    body: "完成思维导图组件 MVP",
    refFollowGrantId: "fg-1",
    createdAt: NOW,
  },
  {
    id: "n-4",
    recipientId: "u-fe-lead",
    actorId: "u-fe-dev1",
    kind: "task_blocked",
    title: "JOJO 的任务进入阻塞状态",
    body: "UI 组件库性能优化",
    refNodeId: "t-jojo-4",
    createdAt: "2026-04-26T14:00:00.000Z",
  },
];

// 日历同步（mock）：给几条 JOJO 的 4 月任务预置同步记录，体现"已经同步到 X 日历"
// 包含一条"外部已勾完成"的记录，让用户能直观看到外部 → 内部的回写状态。
export const initialCalendarSyncs: CalendarSync[] = [
  {
    id: "cs-1",
    nodeId: "t-jojo-1",
    userId: "u-fe-dev1",
    provider: "mac",
    externalEventId: "mac-evt-jojo-1",
    syncedTitle: "完成思维导图组件 MVP",
    syncedDeadline: "2026-04-30",
    syncedStatus: "in_progress",
    status: "synced",
    syncedAt: "2026-04-25T09:30:00.000Z",
  },
  {
    id: "cs-2",
    nodeId: "t-jojo-1",
    userId: "u-fe-dev1",
    provider: "dingtalk",
    externalEventId: "ding-evt-jojo-1",
    syncedTitle: "完成思维导图组件 MVP",
    syncedDeadline: "2026-04-30",
    syncedStatus: "in_progress",
    status: "synced",
    syncedAt: "2026-04-25T09:30:00.000Z",
  },
  {
    id: "cs-3",
    nodeId: "t-jojo-1",
    userId: "u-fe-dev1",
    provider: "google",
    externalEventId: "g-evt-jojo-1",
    syncedTitle: "完成思维导图组件 MVP",
    syncedDeadline: "2026-04-30",
    syncedStatus: "in_progress",
    status: "synced",
    syncedAt: "2026-04-25T09:30:00.000Z",
  },
  {
    id: "cs-4",
    nodeId: "t-jojo-3",
    userId: "u-fe-dev1",
    provider: "mac",
    externalEventId: "mac-evt-jojo-3",
    syncedTitle: "学习 React Server Components",
    syncedStatus: "done",
    externalCompleted: true,
    status: "synced",
    syncedAt: "2026-04-20T08:00:00.000Z",
  },
  {
    id: "cs-5",
    nodeId: "t-meng-2",
    userId: "u-fe-lead",
    provider: "google",
    externalEventId: "g-evt-meng-2",
    syncedTitle: "推动 Design System 落地",
    syncedDeadline: "2026-04-30",
    syncedStatus: "in_progress",
    status: "synced",
    syncedAt: "2026-04-22T01:00:00.000Z",
  },
];

// @ 提及（mock）：给 JOJO 的"组件库迁移"留一条孟增的提及，演示讨论
export const initialMentions: MentionEvent[] = [
  {
    id: "m-1",
    nodeId: "t-jojo-from-meng",
    byUserId: "u-fe-lead",
    mentionedUserId: "u-fe-dev1",
    kind: "discuss",
    text: "@JOJO 这个 v3 迁移的进度还来得及周五前吗？",
    createdAt: "2026-04-26T17:50:00.000Z",
    dingtalkPushedAt: "2026-04-26T17:50:01.000Z",
  },
];

export const initialWorkReports: WorkReport[] = [];

// XMind 联系线（演示图里：技术 ↔ 团队，串一条"组织保障 → 技术目标"的箭头）
export const initialRelationships: Relationship[] = [
  {
    id: "rel-1",
    mindmapId: "mm-xmind-demo",
    fromId: "xd-bnd-1",
    toId: "xd-sum-1",
    label: "支撑",
    createdBy: "u-fe-dev1",
    createdAt: NOW,
  },
  {
    id: "rel-2",
    mindmapId: "mm-xmind-demo",
    fromId: "xd-b3",
    toId: "xd-b1",
    label: "驱动",
    createdBy: "u-fe-dev1",
    createdAt: NOW,
  },
];
