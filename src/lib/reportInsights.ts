import {
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  format,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  subMilliseconds,
} from "date-fns";
import type {
  Assignment,
  MindMap,
  Node,
  TaskLog,
  UserId,
  WorkReportKind,
  WorkReportSummaryStats,
} from "@/types";

export interface ReportPeriod {
  start: string;
  end: string;
  label: string;
}

function toIsoEndOfDay(d: Date): string {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.toISOString();
}

function toIsoStartOfDay(d: Date): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}

/** 以 anchor 为参考，得到已结束的上一完整周/月/季（便于「写刚过去的周期」） */
export function getReportPeriod(
  kind: WorkReportKind,
  anchor: Date = new Date(),
): ReportPeriod {
  const ref = new Date(anchor);
  if (kind === "weekly") {
    const lastWeekEnd = endOfWeek(ref, { weekStartsOn: 1 });
    const lastWeekStart = startOfWeek(lastWeekEnd, { weekStartsOn: 1 });
    const wn = format(lastWeekStart, "w");
    return {
      start: toIsoStartOfDay(lastWeekStart),
      end: toIsoEndOfDay(lastWeekEnd),
      label: `${format(lastWeekStart, "yyyy")}年第${wn}周（${format(lastWeekStart, "M/d")}–${format(lastWeekEnd, "M/d")}）`,
    };
  }
  if (kind === "monthly") {
    ref.setMonth(ref.getMonth() - 1);
    const s = startOfMonth(ref);
    const e = endOfMonth(ref);
    return {
      start: toIsoStartOfDay(s),
      end: toIsoEndOfDay(e),
      label: `${format(s, "yyyy年M月")}`,
    };
  }
  const thisQStart = startOfQuarter(anchor);
  const endPrevQ = subMilliseconds(thisQStart, 1);
  const s = startOfQuarter(endPrevQ);
  const e = endOfQuarter(endPrevQ);
  const q = Math.floor(s.getMonth() / 3) + 1;
  return {
    start: toIsoStartOfDay(s),
    end: toIsoEndOfDay(e),
    label: `${format(s, "yyyy")}年Q${q}（${format(s, "M/d")}–${format(e, "M/d")}）`,
  };
}

function inRange(iso: string, start: string, end: string): boolean {
  return iso >= start && iso <= end;
}

export function collectReportInsights(
  userId: UserId,
  period: Pick<ReportPeriod, "start" | "end">,
  data: {
    mindmaps: MindMap[];
    nodes: Node[];
    logs: TaskLog[];
    assignments: Assignment[];
  },
): { stats: WorkReportSummaryStats; highlights: string[] } {
  const myMapIds = new Set(
    data.mindmaps.filter((m) => m.ownerId === userId).map((m) => m.id),
  );
  const myNodes = data.nodes.filter(
    (n) => myMapIds.has(n.mindmapId) && !n.isDeleted,
  );

  const nodesTouched = myNodes.filter(
    (n) =>
      inRange(n.updatedAt, period.start, period.end) ||
      inRange(n.createdAt, period.start, period.end),
  ).length;

  const taskNodes = myNodes.filter((n) => n.task);
  const tasksCompleted = taskNodes.filter(
    (n) =>
      n.task!.status === "done" &&
      n.task!.closedAt &&
      inRange(n.task!.closedAt, period.start, period.end),
  ).length;

  const tasksInProgress = taskNodes.filter(
    (n) => n.task!.status === "in_progress",
  ).length;

  const newTasks = taskNodes.filter(
    (n) => inRange(n.createdAt, period.start, period.end),
  ).length;

  const logsAdded = data.logs.filter(
    (l) =>
      l.nodeId &&
      myNodes.some((n) => n.id === l.nodeId) &&
      inRange(l.createdAt, period.start, period.end),
  ).length;

  const assignmentsInvolved = data.assignments.filter(
    (a) =>
      (a.assigneeId === userId || a.assignerId === userId) &&
      (inRange(a.createdAt, period.start, period.end) ||
        (a.resolvedAt != null &&
          inRange(a.resolvedAt, period.start, period.end))),
  ).length;

  const stats: WorkReportSummaryStats = {
    nodesTouched,
    tasksCompleted,
    tasksInProgress,
    newTasks,
    assignmentsInvolved,
    logsAdded,
  };

  const highlights: string[] = [];
  const doneTitles = taskNodes
    .filter(
      (n) =>
        n.task!.status === "done" &&
        n.task!.closedAt &&
        inRange(n.task!.closedAt, period.start, period.end),
    )
    .map((n) => n.title)
    .slice(0, 8);
  if (doneTitles.length)
    highlights.push(`本期完成任务：${doneTitles.join("；")}`);
  const progTitles = taskNodes
    .filter((n) => n.task!.status === "in_progress")
    .map((n) => n.title)
    .slice(0, 5);
  if (progTitles.length)
    highlights.push(`进行中重点：${progTitles.join("；")}`);

  return { stats, highlights };
}
