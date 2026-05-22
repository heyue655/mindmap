import type { Node, NodeId } from "@/types";
import type { PositionedNode } from "@/features/mindmap/layout";

export type DropHint = "before-sibling" | "after-sibling" | "child";

export interface ResolvedDrop {
  targetId: NodeId;
  hint: DropHint;
}

/** target 是否在 dragged 的子树里（不能把节点拖到自己的后代上） */
export function isUnderSubtree(
  draggedRootId: NodeId,
  targetId: NodeId,
  nodes: Node[],
): boolean {
  let cur: NodeId | undefined = targetId;
  const map = new Map(nodes.map((n) => [n.id, n] as const));
  while (cur) {
    if (cur === draggedRootId) return true;
    cur = map.get(cur)?.parentId;
  }
  return false;
}

/** 点到轴对齐矩形的最短距离（内部为 0） */
function distancePointToRect(
  px: number,
  py: number,
  x: number,
  y: number,
  w: number,
  h: number,
): number {
  const cx = Math.max(x, Math.min(px, x + w));
  const cy = Math.max(y, Math.min(py, y + h));
  return Math.hypot(px - cx, py - cy);
}

/**
 * 指针下的「可见」主题：在布局顺序中后绘制的在上层。
 * 拖动时指针往往落在被拖节点矩形内，必须跳过它才能命中下面的目标。
 */
export function hitTestDropTarget(
  canvasX: number,
  canvasY: number,
  positioned: PositionedNode[],
  draggedId: NodeId,
  nearestMaxPx: number,
): PositionedNode | null {
  let containedBest: PositionedNode | null = null;
  let containedIdx = -1;
  for (let i = 0; i < positioned.length; i++) {
    const p = positioned[i]!;
    if (p.node.isDeleted || p.node.id === draggedId) continue;
    if (
      canvasX >= p.x &&
      canvasX <= p.x + p.width &&
      canvasY >= p.y &&
      canvasY <= p.y + p.height
    ) {
      if (i > containedIdx) {
        containedIdx = i;
        containedBest = p;
      }
    }
  }
  if (containedBest) return containedBest;

  let nearest: PositionedNode | null = null;
  let nearestD = nearestMaxPx;
  for (const p of positioned) {
    if (p.node.isDeleted || p.node.id === draggedId) continue;
    const d = distancePointToRect(
      canvasX,
      canvasY,
      p.x,
      p.y,
      p.width,
      p.height,
    );
    if (d < nearestD) {
      nearestD = d;
      nearest = p;
    }
  }
  return nearest;
}

/**
 * 根据指针相对目标节点的位置决定：
 * - 偏左：与目标同级（插在目标前/后，由纵向区分）
 * - 偏右：挂到目标下作为子节点（跨级/降级）
 * - 中间且本就同级：上下调整同级顺序
 */
export function resolveDropTarget(opts: {
  draggedId: NodeId;
  canvasX: number;
  canvasY: number;
  positioned: PositionedNode[];
  nodes: Node[];
  /** 无重叠命中时，在多少画布像素内吸附最近节点（XMind 式邻近落点） */
  nearestMaxPx?: number;
}): ResolvedDrop | null {
  const { draggedId, canvasX, canvasY, positioned, nodes } = opts;
  const nearestMaxPx = opts.nearestMaxPx ?? 120;
  const hit = hitTestDropTarget(
    canvasX,
    canvasY,
    positioned,
    draggedId,
    nearestMaxPx,
  );
  if (!hit) return null;

  const dragged = nodes.find((n) => n.id === draggedId);
  const target = hit.node;
  if (!dragged || !target || target.id === draggedId) return null;
  if (isUnderSubtree(draggedId, target.id, nodes)) return null;

  const nx = (canvasX - hit.x) / Math.max(hit.width, 1);
  const ny = (canvasY - hit.y) / Math.max(hit.height, 1);
  const sameParent =
    dragged.parentId != null &&
    dragged.parentId === target.parentId;

  if (nx > 0.62) {
    return { targetId: target.id, hint: "child" };
  }

  if (nx < 0.38 && target.parentId != null) {
    return {
      targetId: target.id,
      hint: ny < 0.5 ? "before-sibling" : "after-sibling",
    };
  }

  if (sameParent) {
    return {
      targetId: target.id,
      hint: ny < 0.5 ? "before-sibling" : "after-sibling",
    };
  }

  return { targetId: target.id, hint: "child" };
}

export function applyMindmapDrop(opts: {
  nodes: Node[];
  draggedId: NodeId;
  targetId: NodeId;
  hint: DropHint;
  nowISO: string;
}): Node[] {
  const { nodes, draggedId, targetId, hint, nowISO } = opts;
  const dragged = nodes.find((n) => n.id === draggedId);
  const target = nodes.find((n) => n.id === targetId);
  if (!dragged || !target || dragged.isDeleted || target.isDeleted)
    return nodes;

  if (hint === "child") {
    const children = nodes.filter(
      (n) => n.parentId === target.id && !n.isDeleted,
    );
    const maxOrder = children.reduce(
      (m, c) => Math.max(m, c.sortOrder),
      -1,
    );
    const nextOrder = maxOrder + 1;
    return nodes.map((n) =>
      n.id === draggedId
        ? {
            ...n,
            parentId: target.id,
            mindmapId: target.mindmapId,
            sortOrder: nextOrder,
            isFloating: false,
            floatX: undefined,
            floatY: undefined,
            updatedAt: nowISO,
          }
        : n,
    );
  }

  const parentId = target.parentId;
  if (parentId == null) return nodes;

  const siblings = nodes
    .filter((n) => n.parentId === parentId && !n.isDeleted)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const ids = siblings.map((s) => s.id).filter((id) => id !== draggedId);
  const ti = ids.indexOf(targetId);
  if (ti === -1) return nodes;

  const insertAt =
    hint === "before-sibling" ? ti : ti + 1;
  ids.splice(insertAt, 0, draggedId);

  const orderMap = new Map(ids.map((id, i) => [id, i] as const));
  const mindmapId =
    siblings.find((s) => s.id === targetId)?.mindmapId ?? target.mindmapId;

  return nodes.map((n) => {
    if (n.id === draggedId) {
      return {
        ...n,
        parentId,
        mindmapId,
        sortOrder: orderMap.get(draggedId) ?? 0,
        isFloating: false,
        floatX: undefined,
        floatY: undefined,
        updatedAt: nowISO,
      };
    }
    if (orderMap.has(n.id) && n.parentId === parentId) {
      return {
        ...n,
        sortOrder: orderMap.get(n.id)!,
        updatedAt: nowISO,
      };
    }
    return n;
  });
}
