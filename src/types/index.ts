// 核心数据模型类型定义（前端原型版本）
// 对应需求文档第 4 节

export type UserId = string;
export type NodeId = string;
export type MindMapId = string;

// ---------- 组织 ----------

export interface User {
  id: UserId;
  employeeNo: string;
  name: string;
  email: string;
  avatar?: string; // emoji 或图片 URL
  departmentId: string;
  jobTitle: string;
  status: "active" | "disabled";
  isAdmin?: boolean;
  // 直接上级用户 ID（NULL 表示无上级）
  managerId?: string;
  // 是否需要在下次登录时强制修改密码
  mustResetPassword?: boolean;
  // 是否绑定钉钉（mock，绑定后 @提到 / 派任务 / 状态变化的消息会"推送到钉钉"）
  dingtalkBound?: boolean;
  // 已连接的日历（mac / google / dingtalk）
  connectedCalendars?: CalendarProvider[];
}

// ---------- 外部日历集成 ----------
export type CalendarProvider = "mac" | "dingtalk" | "google";

export type CalendarSyncStatus = "synced" | "pending" | "failed";

export interface CalendarSync {
  id: string;
  nodeId: NodeId;
  // 节点所有者绑定的某条日历
  userId: UserId;
  provider: CalendarProvider;
  // 模拟外部事件 id（mock 拼一个）
  externalEventId: string;
  // 末次同步时的标题/截止/状态快照（用于展示）
  syncedTitle: string;
  syncedDeadline?: string;
  syncedStatus?: TaskStatus;
  // 是否在外部日历上被勾选完成（外部 → 应用 单向回写示意）
  externalCompleted?: boolean;
  status: CalendarSyncStatus;
  syncedAt: string;
  lastError?: string;
}

export interface Department {
  id: string;
  name: string;
  parentId?: string;
}

export type RelationType = "solid" | "dotted";

export interface OrgRelation {
  id: string;
  subordinateId: UserId;
  managerId: UserId;
  relationType: RelationType;
  effectiveFrom: string; // ISO date
  effectiveTo?: string; // dotted 关系强制带；solid 一般为 undefined
}

// ---------- 思维导图 ----------

// XMind 风格：结构（决定布局）和主题（决定视觉）
export type MindMapStructure =
  | "mindmap" // 中心向四周（双向放射）
  | "right-logic" // 向右逻辑图（默认 · 也是年度模板的样式）
  | "org-chart"; // 组织架构图（自上而下）

export type MindMapTheme =
  | "snowbrush" // 经典橙色（默认）
  | "business" // 商务深蓝
  | "mono"; // 极简黑白

export interface MindMap {
  id: MindMapId;
  ownerId: UserId;
  year: number;
  /** 导图名称（列表与切换器展示）；未设时由界面按模板类型生成默认文案 */
  title?: string;
  structure?: MindMapStructure;
  theme?: MindMapTheme;
  // 是否启用"年度模板"骨架样式（年-季-月）。新建空白图为 false。
  useAnnualTemplate?: boolean;
}

export type NodeType = "skeleton" | "normal";
export type TimeBucketKind = "year" | "quarter" | "month" | "week";

export type TaskStatus = "not_started" | "in_progress" | "done" | "blocked";
export type Priority = "P0" | "P1" | "P2" | "P3";

export interface TaskFields {
  status: TaskStatus;
  progressPct: number; // 0-100
  priority: Priority;
  deadline?: string; // ISO date
  ownerId: UserId;
  estimatedHours?: number;
  actualHours?: number;
  openedAt: string;
  closedAt?: string;
  /** 甘特图开始日 YYYY-MM-DD；缺省用 openedAt 日期 */
  ganttStart?: string;
  /** 甘特图工期（天）；缺省由截止日或默认 7 天推算 */
  ganttDurationDays?: number;
}

/** 上下级「成对任务」：派任务接受后、或关注被同意后，双方导图各有一份，由执行方选择是否同步进度到对方副本 */
export type TaskPeerLinkKind = "assignment" | "follow_grant";

export interface TaskPeerLink {
  peerNodeId: NodeId;
  peerMindmapId: MindMapId;
  peerUserId: UserId;
  kind: TaskPeerLinkKind;
  /** true = 执行方（下级）主任务；false = 上级导图上的关联副本 */
  iAmExecutor: boolean;
  /** 仅执行方有效：是否把状态/进度/截止同步到上级副本（默认 true） */
  syncProgressToPeer?: boolean;
  refAssignmentId?: string;
  refFollowGrantId?: string;
}

/** XMind 风格节点外观（可选覆盖主题/骨架默认样式） */
export type NodeShapePreset = "rounded" | "rect" | "pill";

export interface NodeTopicFormat {
  /** 节点框宽度 px（约 120–480；不设则布局默认 ~200） */
  widthPx?: number;
  shape?: NodeShapePreset;
  fillColor?: string;
  borderColor?: string;
  /** 由「边框粗细」预设换算，也可直接存 px */
  borderWidthPx?: number;
  fontFamily?: string;
  fontSizePx?: number;
  fontWeight?: "normal" | "bold";
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  textColor?: string;
  textAlign?: "left" | "center" | "right";
  /** 连到本节点的分支线（父→子） */
  branchColor?: string;
  branchWidthPx?: number;
  /** SVG stroke-dasharray，如 "4 3"；空为实线 */
  branchDash?: string;
}

export interface Node {
  id: NodeId;
  mindmapId: MindMapId;
  parentId?: NodeId;
  sortOrder: number;
  title: string;
  description?: string;
  nodeType: NodeType;
  timeBucketKind?: TimeBucketKind;
  timeBucketValue?: string; // '2026' | '2026Q1' | '2026-03' | '2026-W12'
  createdBy: UserId;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  deletedAt?: string;
  task?: TaskFields; // 节点是否"是任务"由这里是否非空决定
  // XMind 风格的标记图标（标签/优先级/旗帜/星星/符号 等）
  markers?: string[];

  // ---------- XMind 节点扩展属性 ----------
  // 长文本笔记
  notes?: string;
  // 简短标签 chips（区别于 markers 的图标，用于自由文本分类）
  labels?: string[];
  // 超链接
  hyperlink?: string;
  // 图片（data url 或外链）
  image?: string;

  // 概要节点（指向被概要的同级节点 id 列表 [from, to]，渲染为大括号 + 概要主题）
  // 当一个节点是 summary 节点时，summaryRange 是它"汇总"的兄弟节点 id 列表
  summaryRange?: NodeId[];

  // 边界：把若干同级节点圈起来，可加标题
  // 如果当前节点是 boundary 节点，boundaryRange 列出它"框住"的兄弟节点 id 列表
  boundaryRange?: NodeId[];

  // 浮动主题（脱离父子层级，自由摆放）
  isFloating?: boolean;
  floatX?: number;
  floatY?: number;

  /** 与上级/下级导图任务的配对关系（派任务、关注通过后生成） */
  taskPeer?: TaskPeerLink;

  /** 导图主题外观覆盖（右侧「样式」面板） */
  topicFormat?: NodeTopicFormat;
}

// ---------- XMind 联系线 ----------
export interface Relationship {
  id: string;
  mindmapId: MindMapId;
  fromId: NodeId;
  toId: NodeId;
  label?: string;
  createdBy: UserId;
  createdAt: string;
}

// ---------- 日志 / 附件 ----------

export type LogType =
  | "status_change"
  | "progress_change"
  | "comment"
  | "attachment_added"
  | "assignment_event";

export interface TaskLog {
  id: string;
  nodeId: NodeId;
  authorId: UserId;
  logType: LogType;
  contentText: string;
  contentMeta?: Record<string, unknown>;
  createdAt: string;
}

export interface Attachment {
  id: string;
  nodeId: NodeId;
  logId?: string;
  fileName: string;
  fileUrl: string; // 原型用 data:url 或假地址
  fileSize: number;
  mimeType: string;
  uploadedBy: UserId;
  uploadedAt: string;
}

// ---------- 协作工作流 ----------

export type AssignmentState =
  | "pending"
  | "accepted"
  | "negotiating"
  | "adjusted"
  | "rejected_by_system";

export interface Assignment {
  id: string;
  assignerId: UserId;
  assigneeId: UserId;
  /**
   * 目标导图 ID。派任务时若下属尚无导图则为 undefined，
   * 下属首次登录时由服务端 reconciliation 自动填充。
   */
  targetMindmapId?: MindMapId;
  /**
   * 目标骨架节点 ID。派任务时若下属尚无对应骨架节点则为 undefined，
   * 下属首次登录时由服务端 reconciliation 自动填充。
   */
  targetSkeletonNodeId?: NodeId;
  /** 时间桶类型：quarter / month，用于 reconciliation 匹配骨架节点 */
  timeBucketKind?: string;
  /** 时间桶值，如 "2025-Q1"，用于 reconciliation 匹配骨架节点 */
  timeBucketValue?: string;
  proposedTitle: string;
  proposedDescription?: string;
  proposedDeadline?: string;
  proposedPriority: Priority;
  state: AssignmentState;
  resultNodeId?: NodeId;
  /** 接受派任务后，在上级自己导图上生成的关联副本节点 id（若有） */
  assignerMirrorNodeId?: NodeId;
  /**
   * 派任务时上级在自己导图中选中的原始普通节点 id。
   * 仅当该节点无 task / taskPeer 字段时记录；下级接受后该节点直接升级为 mirror
   * 任务节点，而不新建副本，避免上级导图出现重复节点。
   */
  assignerSourceNodeId?: NodeId;
  adjustmentRequest?: AdjustmentRequest;
  createdAt: string;
  resolvedAt?: string;
}

export type AdjustmentRequest =
  | { kind: "deadline"; newDeadline: string; reason?: string }
  | {
      kind: "split";
      subtasks: Array<{ title: string; deadline?: string }>;
      reason?: string;
    }
  | { kind: "transfer"; newAssigneeId: UserId; reason?: string };

export type FollowGrantState =
  | "pending"
  | "granted"
  | "denied"
  | "revoked"
  | "expired";

export type FollowScope = "single_task" | "subtree";

export interface FollowGrant {
  id: string;
  requesterId: UserId; // 下级
  granteeId: UserId; // 上级
  targetNodeId: NodeId;
  scope: FollowScope;
  state: FollowGrantState;
  expiresAt: string;
  reason?: string;
  decidedReason?: string;
  createdAt: string;
  decidedAt?: string;
  /** 同意关注后，在上级导图上自动创建的关联任务节点 id（若有） */
  granteeMirrorNodeId?: NodeId;
}

export interface NodeShare {
  id: string;
  sharerId: UserId;
  audienceId: UserId;
  nodeId: NodeId;
  createdAt: string;
  revokedAt?: string;
}

// ---------- @ 提及 ----------

export type MentionKind =
  | "assign" // 在标题或描述里 @ 一个人 = 把这条派给他（兼任务派发）
  | "discuss"; // 在评论 / 日志里 @ 一个人 = 拉他进讨论

export interface MentionEvent {
  id: string;
  nodeId: NodeId;
  byUserId: UserId;
  mentionedUserId: UserId;
  kind: MentionKind;
  // 原始文本（包含 @姓名）
  text: string;
  createdAt: string;
  // 是否已"推送到钉钉"（mock，所有 dingtalkBound 用户都视为成功）
  dingtalkPushedAt?: string;
}

// ---------- 通知 ----------

export type NotificationKind =
  | "assignment_received"
  | "assignment_accepted"
  | "assignment_negotiating"
  | "assignment_adjusted"
  | "task_status_changed"
  | "task_blocked"
  | "task_progress_updated"
  | "follow_request_received"
  | "follow_granted"
  | "follow_denied"
  | "node_shared"
  // @ 提及（标题/描述里 = 派任务；评论里 = 拉讨论）
  | "mentioned_assign"
  | "mentioned_discuss"
  // 日历同步 / 外部完成回写
  | "calendar_synced"
  | "calendar_completion"
  // 工作汇报（提交上级 / @ 同事）
  | "report_submitted"
  | "report_shared";

/** AI 工作汇报（基于导图/任务活动生成的周报、月报、季报） */
export type WorkReportKind = "weekly" | "monthly" | "quarterly";
export type WorkReportStatus = "draft" | "submitted";

export interface WorkReportSummaryStats {
  nodesTouched: number;
  tasksCompleted: number;
  tasksInProgress: number;
  newTasks: number;
  assignmentsInvolved: number;
  logsAdded: number;
}

export interface WorkReport {
  id: string;
  authorId: UserId;
  kind: WorkReportKind;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  contentMarkdown: string;
  summaryStats?: WorkReportSummaryStats;
  status: WorkReportStatus;
  submittedAt?: string;
  /** 提交给的直属实线上级 */
  submitToUserId?: UserId;
  /** @ 分享的同时 */
  ccUserIds: UserId[];
  createdAt: string;
  updatedAt: string;
}

export interface AppNotification {
  id: string;
  recipientId: UserId;
  actorId?: UserId;
  kind: NotificationKind;
  title: string;
  body?: string;
  refNodeId?: NodeId;
  refAssignmentId?: string;
  refFollowGrantId?: string;
  refReportId?: string;
  createdAt: string;
  readAt?: string;
  // 已推送到钉钉（mock，仅 mention / 任务派发类通知会带上）
  dingtalkPushedAt?: string;
  // 来源日历（calendar_* 通知专用）
  calendarProvider?: CalendarProvider;
}
