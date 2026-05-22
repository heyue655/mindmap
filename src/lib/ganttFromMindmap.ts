import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
} from "date-fns";
import type { Node, NodeId, TaskFields } from "@/types";

export type GanttBarKind = "task" | "group";

export interface GanttRow {
  nodeId: NodeId;
  title: string;
  depth: number;
  ownerId: string;
  barKind: GanttBarKind;
  /** YYYY-MM-DD */
  startStr: string;
  /** YYYY-MM-DD 含尾日 */
  endStr: string;
  durationDays: number;
  /** 有子任务时可折叠 */
  canCollapse: boolean;
}

export function dayOnly(iso: string): string {
  return iso.slice(0, 10);
}

/** 单任务条的起止（不含子树聚合） */
export function ownTaskRange(task: TaskFields): { start: string; end: string } {
  const start =
    task.ganttStart?.trim() || dayOnly(task.openedAt);
  let end: string;
  if (task.ganttDurationDays != null && task.ganttDurationDays > 0) {
    end = format(
      addDays(parseISO(start), task.ganttDurationDays - 1),
      "yyyy-MM-dd",
    );
  } else if (task.deadline) {
    end = dayOnly(task.deadline);
    if (end < start) end = start;
  } else {
    end = format(addDays(parseISO(start), 6), "yyyy-MM-dd");
  }
  return { start, end };
}

export function inclusiveDurationDays(start: string, end: string): number {
  return differenceInCalendarDays(parseISO(end), parseISO(start)) + 1;
}

function buildChildrenMap(nodes: Node[], mindmapId: string) {
  const byId = new Map<NodeId, Node>();
  const children = new Map<NodeId | "ROOT", Node[]>();
  for (const n of nodes) {
    if (n.mindmapId !== mindmapId || n.isDeleted) continue;
    byId.set(n.id, n);
    const p = n.parentId ?? "ROOT";
    if (!children.has(p)) children.set(p, []);
    children.get(p)!.push(n);
  }
  for (const [, arr] of children) {
    arr.sort((a, b) => a.sortOrder - b.sortOrder);
  }
  return { byId, children };
}

function hasTask(n: Node | undefined): boolean {
  return !!n?.task;
}

/** 子树内所有带 task 的节点（含自身）的 [minStart, maxEnd] */
function aggregateTaskRange(
  nodeId: NodeId,
  byId: Map<NodeId, Node>,
  children: Map<NodeId | "ROOT", Node[]>,
): { start: string; end: string } | null {
  const node = byId.get(nodeId);
  if (!node || node.isDeleted) return null;

  let minS: string | null = null;
  let maxE: string | null = null;

  const bump = (start: string, end: string) => {
    if (!minS || start < minS) minS = start;
    if (!maxE || end > maxE) maxE = end;
  };

  if (node.task) {
    const r = ownTaskRange(node.task);
    bump(r.start, r.end);
  }

  for (const c of children.get(nodeId) ?? []) {
    const sub = aggregateTaskRange(c.id, byId, children);
    if (sub) bump(sub.start, sub.end);
  }

  if (minS && maxE) return { start: minS, end: maxE };
  return null;
}

/** 任意后代（不含自身）是否存在带 task 的节点 */
function hasDescendantTask(
  nodeId: NodeId,
  children: Map<NodeId | "ROOT", Node[]>,
): boolean {
  for (const c of children.get(nodeId) ?? []) {
    if (hasTask(c)) return true;
    if (hasDescendantTask(c.id, children)) return true;
  }
  return false;
}

/**
 * 从导图根前序遍历，仅输出带 task 的节点行；含子任务时为 group 条（紫色聚合区间）。
 */
export function buildGanttRows(
  nodes: Node[],
  mindmapId: string,
  rootNodeId: NodeId,
  collapsed: Set<NodeId>,
): GanttRow[] {
  const { byId, children } = buildChildrenMap(nodes, mindmapId);
  const rows: GanttRow[] = [];

  const walk = (nodeId: NodeId, depth: number) => {
    const node = byId.get(nodeId);
    if (!node) return;

    if (hasTask(node)) {
      const isGroup = hasDescendantTask(node.id, children);
      let startStr: string;
      let endStr: string;
      if (isGroup) {
        const agg = aggregateTaskRange(node.id, byId, children);
        if (!agg) return;
        startStr = agg.start;
        endStr = agg.end;
      } else {
        const r = ownTaskRange(node.task!);
        startStr = r.start;
        endStr = r.end;
      }
      const durationDays = inclusiveDurationDays(startStr, endStr);
      rows.push({
        nodeId: node.id,
        title: node.title,
        depth,
        ownerId: node.task!.ownerId,
        barKind: isGroup ? "group" : "task",
        startStr,
        endStr,
        durationDays,
        canCollapse: isGroup,
      });
    }

    if (collapsed.has(nodeId)) return;

    for (const c of children.get(nodeId) ?? []) {
      if (c.isFloating) continue;
      walk(c.id, depth + 1);
    }
  };

  walk(rootNodeId, 0);

  // 浮动且带任务的主题
  for (const n of nodes) {
    if (
      n.mindmapId !== mindmapId ||
      n.isDeleted ||
      !n.isFloating ||
      !n.task
    ) {
      continue;
    }
    const isGroup = hasDescendantTask(n.id, children);
    let startStr: string;
    let endStr: string;
    if (isGroup) {
      const agg = aggregateTaskRange(n.id, byId, children);
      if (!agg) continue;
      startStr = agg.start;
      endStr = agg.end;
    } else {
      const r = ownTaskRange(n.task);
      startStr = r.start;
      endStr = r.end;
    }
    rows.push({
      nodeId: n.id,
      title: n.title,
      depth: 0,
      ownerId: n.task.ownerId,
      barKind: isGroup ? "group" : "task",
      startStr,
      endStr,
      durationDays: inclusiveDurationDays(startStr, endStr),
      canCollapse: isGroup,
    });
  }

  return rows;
}

/** 根据所有行计算时间轴可见 [start, end] 各加边距 */
export function ganttTimelineBounds(
  rows: GanttRow[],
  marginDays = 4,
): { start: Date; end: Date; days: number } {
  if (rows.length === 0) {
    const t = new Date();
    const s = addDays(t, -7);
    const e = addDays(t, 30);
    return {
      start: s,
      end: e,
      days: differenceInCalendarDays(e, s) + 1,
    };
  }
  let minS = rows[0].startStr;
  let maxE = rows[0].endStr;
  for (const r of rows) {
    if (r.startStr < minS) minS = r.startStr;
    if (r.endStr > maxE) maxE = r.endStr;
  }
  const start = addDays(parseISO(minS), -marginDays);
  const end = addDays(parseISO(maxE), marginDays);
  return {
    start,
    end,
    days: differenceInCalendarDays(end, start) + 1,
  };
}

export function eachDay(start: Date, count: number): Date[] {
  const out: Date[] = [];
  for (let i = 0; i < count; i++) {
    out.push(addDays(start, i));
  }
  return out;
}
