import type {
  AppNotification,
  CalendarProvider,
  CalendarSync,
  Node,
  TaskStatus,
  User,
} from "@/types";
import { newId } from "./id";

export const CALENDAR_LABEL: Record<CalendarProvider, string> = {
  mac: "Mac 日历",
  dingtalk: "钉钉日历",
  google: "Google 日历",
};

export const CALENDAR_EMOJI: Record<CalendarProvider, string> = {
  mac: "🍎",
  dingtalk: "🐬",
  google: "🟦",
};

export const ALL_CALENDAR_PROVIDERS: CalendarProvider[] = [
  "mac",
  "dingtalk",
  "google",
];

/**
 * 任务节点变更（创建 / 标题 / 截止 / 状态）时，把它同步到 owner 已连接的所有日历。
 * - 已存在记录：更新快照 + syncedAt
 * - 不存在的连接：新建记录
 * - 用户取消连接的 provider：保留旧记录但状态置 failed（演示用，简化为不删除）
 *
 * 这是一个纯计算函数：不直接 setState，调用方拿到结果合并。
 */
export function reconcileNodeCalendarSyncs(args: {
  node: Node;
  owner: User | undefined;
  prev: CalendarSync[];
  nowISO: string;
}): {
  next: CalendarSync[];
  added: CalendarSync[];
  updated: CalendarSync[];
} {
  const { node, owner, prev, nowISO } = args;
  if (!owner || !node.task) return { next: prev, added: [], updated: [] };
  const providers = owner.connectedCalendars ?? [];
  if (providers.length === 0) return { next: prev, added: [], updated: [] };

  const next: CalendarSync[] = [...prev];
  const added: CalendarSync[] = [];
  const updated: CalendarSync[] = [];
  for (const p of providers) {
    const idx = next.findIndex(
      (cs) => cs.nodeId === node.id && cs.provider === p,
    );
    if (idx === -1) {
      const cs: CalendarSync = {
        id: newId("cs"),
        nodeId: node.id,
        userId: owner.id,
        provider: p,
        externalEventId: `${p}-evt-${node.id}`,
        syncedTitle: node.title,
        syncedDeadline: node.task.deadline,
        syncedStatus: node.task.status,
        status: "synced",
        syncedAt: nowISO,
      };
      next.push(cs);
      added.push(cs);
    } else {
      const old = next[idx]!;
      const merged: CalendarSync = {
        ...old,
        userId: owner.id,
        syncedTitle: node.title,
        syncedDeadline: node.task.deadline,
        syncedStatus: node.task.status,
        status: "synced",
        syncedAt: nowISO,
      };
      next[idx] = merged;
      updated.push(merged);
    }
  }
  return { next, added, updated };
}

/**
 * 把"日历同步成功"事件转成给 owner 自己的一条提示通知。
 * 不会刷屏：仅当至少有一项 added/updated 时返回一条聚合通知。
 */
export function buildCalendarSyncedNotification(args: {
  node: Node;
  owner: User;
  added: CalendarSync[];
  updated: CalendarSync[];
  nowISO: string;
}): AppNotification | null {
  const { node, owner, added, updated, nowISO } = args;
  if (added.length === 0 && updated.length === 0) return null;
  const providers = [...added, ...updated]
    .map((cs) => CALENDAR_LABEL[cs.provider])
    .filter((v, i, arr) => arr.indexOf(v) === i);
  return {
    id: newId("n"),
    recipientId: owner.id,
    kind: "calendar_synced",
    title: `任务已同步到日历`,
    body: `${node.title} → ${providers.join(" / ")}`,
    refNodeId: node.id,
    createdAt: nowISO,
  };
}

/**
 * 模拟"在外部日历里勾完成"：把对应 CalendarSync 的 externalCompleted 置 true，
 * 并返回应用侧应当回写的 task 状态（done）+ 一条提示通知。
 */
export function simulateCalendarCompletion(args: {
  syncId: string;
  prev: CalendarSync[];
  node: Node;
  owner: User;
  nowISO: string;
}): {
  next: CalendarSync[];
  notification: AppNotification | null;
  shouldMarkTaskDone: boolean;
  newTaskStatus: TaskStatus;
} {
  const { syncId, prev, node, owner, nowISO } = args;
  const idx = prev.findIndex((cs) => cs.id === syncId);
  if (idx === -1) {
    return {
      next: prev,
      notification: null,
      shouldMarkTaskDone: false,
      newTaskStatus: node.task?.status ?? "not_started",
    };
  }
  const cs = prev[idx]!;
  const next = [...prev];
  next[idx] = {
    ...cs,
    externalCompleted: true,
    syncedStatus: "done",
    syncedAt: nowISO,
  };
  // 顺手把同节点其它 provider 的同步记录也回写为 done（模拟所有日历都收到这个状态）
  for (let i = 0; i < next.length; i++) {
    if (i === idx) continue;
    const other = next[i]!;
    if (other.nodeId === cs.nodeId) {
      next[i] = {
        ...other,
        syncedStatus: "done",
        syncedAt: nowISO,
      };
    }
  }
  const notification: AppNotification = {
    id: newId("n"),
    recipientId: owner.id,
    kind: "calendar_completion",
    title: `${CALENDAR_LABEL[cs.provider]}：你勾选了一项任务为完成`,
    body: node.title,
    refNodeId: node.id,
    calendarProvider: cs.provider,
    createdAt: nowISO,
  };
  return {
    next,
    notification,
    shouldMarkTaskDone: node.task?.status !== "done",
    newTaskStatus: "done",
  };
}
