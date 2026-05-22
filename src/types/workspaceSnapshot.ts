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
  User,
  WorkReport,
} from "./index";

/** 与后端 /api/workspace 同步的一份数据（演示环境：全员共享同一工作区） */
export interface WorkspaceSnapshot {
  users: User[];
  mindmaps: MindMap[];
  nodes: Node[];
  assignments: Assignment[];
  follows: FollowGrant[];
  shares: NodeShare[];
  logs: TaskLog[];
  notifications: AppNotification[];
  relationships: Relationship[];
  calendarSyncs: CalendarSync[];
  mentions: MentionEvent[];
  workReports: WorkReport[];
}
