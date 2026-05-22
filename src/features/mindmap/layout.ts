import type { MindMapStructure, Node, NodeId } from "@/types";
import { groupByParent, monthsOfQuarter } from "@/lib/skeleton";

// 节点的"放置方向"：决定连线如何弯曲
export type LayoutDirection = "left" | "right" | "down" | "up";

export interface PositionedNode {
  node: Node;
  depth: number;
  x: number;
  y: number;
  width: number;
  height: number;
  // 节点相对父节点的方向（用于连线绘制）
  direction: LayoutDirection;
}

export interface BracketInfo {
  // 用作 key
  id: string;
  // 端点节点（年度模板里=quarter；普通=summary node）
  endpointId: NodeId;
  // 括号几何
  bracketX: number;
  hookStartX: number;
  top: number;
  bot: number;
  // 用于"概要"——可以选择给括号染上不同色（默认主题色）
  variant: "quarter" | "summary";
}

export interface BoundaryInfo {
  id: string;
  // 边界节点本身（用来读取 title / 颜色 / 等）
  boundaryNode: Node;
  // 矩形几何
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutResult {
  positioned: PositionedNode[];
  byId: Map<NodeId, PositionedNode>;
  width: number;
  height: number;
  brackets: BracketInfo[];
  boundaries: BoundaryInfo[];
  // 被边界框 / 概要包住、不绘制普通父子连线的子节点 id 集合
  hiddenEdgesToChild: Set<NodeId>;
  // 浮动节点的最终偏移（已按需归一化），方便外层渲染时使用
}

const NODE_WIDTH = 200;
const NODE_HEIGHT_TASK = 76;
const NODE_HEIGHT_NORMAL = 56;
const NODE_HEIGHT_SKELETON_YEAR = 64;
const NODE_HEIGHT_SKELETON_OTHER = 52;
const HORIZ_GAP = 96;
const VERT_GAP = 18;
const BRACKET_WIDTH = 56;
// 边界矩形 padding
const BOUNDARY_PAD_X = 14;
const BOUNDARY_PAD_Y = 16;
// 中心放射结构的左右间隔
const MINDMAP_HORIZ_GAP = 96;
// 组织结构图的层间垂直间隔
const ORG_VERT_GAP = 64;
const ORG_HORIZ_GAP = 24;

function nodeHeight(node: Node): number {
  if (node.nodeType === "skeleton") {
    return node.timeBucketKind === "year"
      ? NODE_HEIGHT_SKELETON_YEAR
      : NODE_HEIGHT_SKELETON_OTHER;
  }
  return node.task ? NODE_HEIGHT_TASK : NODE_HEIGHT_NORMAL;
}

/** 单节点画布宽度（与右侧「样式」面板 widthPx 一致） */
export function layoutNodeWidth(node: Node): number {
  const w = node.topicFormat?.widthPx;
  if (typeof w === "number" && Number.isFinite(w)) {
    return Math.min(480, Math.max(120, Math.round(w)));
  }
  return NODE_WIDTH;
}

// 判断一个节点是否被视为"概要节点"（不参与正常树布局，单独定位）
function isSummaryNode(n: Node): boolean {
  return Array.isArray(n.summaryRange) && n.summaryRange.length > 0;
}
// 判断一个节点是否被视为"边界节点"（不参与正常树布局，画一个框）
function isBoundaryNode(n: Node): boolean {
  return Array.isArray(n.boundaryRange) && n.boundaryRange.length > 0;
}

function visibleChildrenOf(
  parentId: NodeId,
  byParent: Map<NodeId | "ROOT", Node[]>,
  collapsed: Set<NodeId>,
): Node[] {
  if (collapsed.has(parentId)) return [];
  return (byParent.get(parentId) ?? []).filter(
    (c) =>
      !c.isDeleted &&
      !c.isFloating &&
      !isSummaryNode(c) &&
      !isBoundaryNode(c),
  );
}

// =========================================================
// 子树布局：横向（向右）
// =========================================================
function layoutSubtreeRight(opts: {
  rootId: NodeId;
  byParent: Map<NodeId | "ROOT", Node[]>;
  collapsed: Set<NodeId>;
  startDepth: number;
  startY: number;
  baseX: number;
}): { positioned: PositionedNode[]; root: PositionedNode; leafYAfter: number } {
  const { byParent, collapsed, startDepth, startY, baseX } = opts;
  const positioned: PositionedNode[] = [];
  let cursorY = startY;

  const findNode = (id: NodeId): Node | undefined => {
    for (const arr of byParent.values()) {
      const m = arr.find((n) => n.id === id);
      if (m) return m;
    }
    return undefined;
  };

  function visit(node: Node, depth: number): PositionedNode {
    const children = visibleChildrenOf(node.id, byParent, collapsed);
    const x = baseX + depth * (NODE_WIDTH + HORIZ_GAP);
    const h = nodeHeight(node);

    if (children.length === 0) {
      const y = cursorY;
      cursorY += h + VERT_GAP;
      const p: PositionedNode = {
        node,
        depth,
        x,
        y,
        width: layoutNodeWidth(node),
        height: h,
        direction: "right",
      };
      positioned.push(p);
      return p;
    }

    const childPositions = children.map((c) => visit(c, depth + 1));
    const first = childPositions[0];
    const last = childPositions[childPositions.length - 1];
    const cy =
      (first.y + first.height / 2 + last.y + last.height / 2) / 2 - h / 2;
    const p: PositionedNode = {
      node,
      depth,
      x,
      y: cy,
      width: layoutNodeWidth(node),
      height: h,
      direction: "right",
    };
    positioned.push(p);
    return p;
  }

  const rootNode = findNode(opts.rootId);
  if (!rootNode) {
    return {
      positioned: [],
      root: {
        node: { id: opts.rootId } as Node,
        depth: startDepth,
        x: baseX,
        y: startY,
        width: NODE_WIDTH,
        height: NODE_HEIGHT_NORMAL,
        direction: "right",
      },
      leafYAfter: startY,
    };
  }
  const rootPos = visit(rootNode, startDepth);
  return { positioned, root: rootPos, leafYAfter: cursorY };
}

// =========================================================
// 子树布局：横向（向左）—— 给中心放射结构的左半边用
// 镜像版本：x 减少而不是增加
// =========================================================
function layoutSubtreeLeft(opts: {
  rootId: NodeId;
  byParent: Map<NodeId | "ROOT", Node[]>;
  collapsed: Set<NodeId>;
  startDepth: number;
  startY: number;
  baseX: number; // 子树根 x = baseX - startDepth * (NODE_WIDTH+HORIZ_GAP)
}): { positioned: PositionedNode[]; root: PositionedNode; leafYAfter: number } {
  const { byParent, collapsed, startDepth, startY, baseX } = opts;
  const positioned: PositionedNode[] = [];
  let cursorY = startY;

  const findNode = (id: NodeId): Node | undefined => {
    for (const arr of byParent.values()) {
      const m = arr.find((n) => n.id === id);
      if (m) return m;
    }
    return undefined;
  };

  function visit(node: Node, depth: number): PositionedNode {
    const children = visibleChildrenOf(node.id, byParent, collapsed);
    const x = baseX - depth * (NODE_WIDTH + HORIZ_GAP);
    const h = nodeHeight(node);

    if (children.length === 0) {
      const y = cursorY;
      cursorY += h + VERT_GAP;
      const p: PositionedNode = {
        node,
        depth,
        x,
        y,
        width: layoutNodeWidth(node),
        height: h,
        direction: "left",
      };
      positioned.push(p);
      return p;
    }

    const childPositions = children.map((c) => visit(c, depth + 1));
    const first = childPositions[0];
    const last = childPositions[childPositions.length - 1];
    const cy =
      (first.y + first.height / 2 + last.y + last.height / 2) / 2 - h / 2;
    const p: PositionedNode = {
      node,
      depth,
      x,
      y: cy,
      width: layoutNodeWidth(node),
      height: h,
      direction: "left",
    };
    positioned.push(p);
    return p;
  }

  const rootNode = findNode(opts.rootId);
  if (!rootNode) {
    return {
      positioned: [],
      root: {
        node: { id: opts.rootId } as Node,
        depth: startDepth,
        x: baseX,
        y: startY,
        width: NODE_WIDTH,
        height: NODE_HEIGHT_NORMAL,
        direction: "left",
      },
      leafYAfter: startY,
    };
  }
  const rootPos = visit(rootNode, startDepth);
  return { positioned, root: rootPos, leafYAfter: cursorY };
}

// =========================================================
// 子树布局：组织架构（自上而下）
// =========================================================
function layoutSubtreeDown(opts: {
  rootId: NodeId;
  byParent: Map<NodeId | "ROOT", Node[]>;
  collapsed: Set<NodeId>;
  startDepth: number;
  startX: number; // 当前子树左边界
  baseY: number; // 当前子树根的 y
}): { positioned: PositionedNode[]; root: PositionedNode; widthAfter: number } {
  const { byParent, collapsed, startDepth, startX, baseY } = opts;
  const positioned: PositionedNode[] = [];
  let cursorX = startX;

  const findNode = (id: NodeId): Node | undefined => {
    for (const arr of byParent.values()) {
      const m = arr.find((n) => n.id === id);
      if (m) return m;
    }
    return undefined;
  };

  function visit(node: Node, depth: number): PositionedNode {
    const children = visibleChildrenOf(node.id, byParent, collapsed);
    const y = baseY + depth * (nodeHeight(node) + ORG_VERT_GAP);
    const h = nodeHeight(node);

    if (children.length === 0) {
      const x = cursorX;
      cursorX += layoutNodeWidth(node) + ORG_HORIZ_GAP;
      const p: PositionedNode = {
        node,
        depth,
        x,
        y,
        width: layoutNodeWidth(node),
        height: h,
        direction: "down",
      };
      positioned.push(p);
      return p;
    }

    const childPositions = children.map((c) => visit(c, depth + 1));
    const first = childPositions[0];
    const last = childPositions[childPositions.length - 1];
    const cx =
      (first.x + first.width / 2 + last.x + last.width / 2) / 2 -
      layoutNodeWidth(node) / 2;
    const p: PositionedNode = {
      node,
      depth,
      x: cx,
      y,
      width: layoutNodeWidth(node),
      height: h,
      direction: "down",
    };
    positioned.push(p);
    return p;
  }

  const rootNode = findNode(opts.rootId);
  if (!rootNode) {
    return {
      positioned: [],
      root: {
        node: { id: opts.rootId } as Node,
        depth: startDepth,
        x: startX,
        y: baseY,
        width: NODE_WIDTH,
        height: NODE_HEIGHT_NORMAL,
        direction: "down",
      },
      widthAfter: startX,
    };
  }
  const rootPos = visit(rootNode, startDepth);
  return { positioned, root: rootPos, widthAfter: cursorX };
}

// =========================================================
// 入口：layoutByStructure
// =========================================================
export function layoutByStructure(opts: {
  rootId: NodeId;
  allNodes: Node[];
  collapsed?: Set<NodeId>;
  structure?: MindMapStructure;
  useAnnualTemplate?: boolean;
}): LayoutResult {
  const {
    rootId,
    allNodes,
    collapsed = new Set(),
    structure = "right-logic",
    useAnnualTemplate = false,
  } = opts;
  const byParent = groupByParent(allNodes);
  const root = allNodes.find((n) => n.id === rootId);
  if (!root) {
    return emptyResult();
  }

  let result: LayoutResult;
  // 年度模板（向右逻辑图特有）：保留原来"月主干 + 季度括号"
  if (
    structure === "right-logic" &&
    useAnnualTemplate &&
    hasAnnualSkeleton(root, byParent)
  ) {
    result = layoutAnnualTemplate({ root, byParent, collapsed });
  } else if (structure === "mindmap") {
    result = layoutMindMap({ root, byParent, collapsed });
  } else if (structure === "org-chart") {
    result = layoutOrgChart({ root, byParent, collapsed });
  } else {
    result = layoutRightLogic({ root, byParent, collapsed });
  }

  // 在普通布局完成后追加：summary、boundary、floating
  attachSummariesBoundariesFloating({
    root,
    byParent,
    collapsed,
    structure,
    result,
  });

  // 归一化：保证最小坐标 ≥ 0
  normalize(result);

  return result;
}

// 兼容旧 API 名
export const layoutTree = layoutByStructure;

function emptyResult(): LayoutResult {
  return {
    positioned: [],
    byId: new Map(),
    width: 0,
    height: 0,
    brackets: [],
    boundaries: [],
    hiddenEdgesToChild: new Set(),
  };
}

function hasAnnualSkeleton(
  root: Node,
  byParent: Map<NodeId | "ROOT", Node[]>,
): boolean {
  const direct = (byParent.get(root.id) ?? []).filter((n) => !n.isDeleted);
  return direct.some(
    (c) => c.nodeType === "skeleton" && c.timeBucketKind === "month",
  );
}

// =========================================================
// 布局：年度模板（保留原行为）
// =========================================================
function layoutAnnualTemplate(opts: {
  root: Node;
  byParent: Map<NodeId | "ROOT", Node[]>;
  collapsed: Set<NodeId>;
}): LayoutResult {
  const { root, byParent, collapsed } = opts;
  const directChildren = (byParent.get(root.id) ?? []).filter(
    (n) => !n.isDeleted,
  );
  const quarterChildren = directChildren
    .filter((c) => c.nodeType === "skeleton" && c.timeBucketKind === "quarter")
    .sort((a, b) =>
      (a.timeBucketValue ?? "").localeCompare(b.timeBucketValue ?? ""),
    );
  // 左侧主轴：月份 + 自定义主题（如「全年计划」）按 sortOrder 穿插，支持拖到 1 月上方
  const spineChildren = directChildren.filter(
    (c) =>
      !(c.nodeType === "skeleton" && c.timeBucketKind === "quarter") &&
      !c.isFloating &&
      !isSummaryNode(c) &&
      !isBoundaryNode(c),
  );
  spineChildren.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    const ta = a.timeBucketValue ?? "";
    const tb = b.timeBucketValue ?? "";
    if (ta !== tb) return ta.localeCompare(tb);
    return a.id.localeCompare(b.id);
  });
  const monthChildren = spineChildren.filter(
    (c) => c.nodeType === "skeleton" && c.timeBucketKind === "month",
  );

  const positioned: PositionedNode[] = [];
  const monthBaseX = NODE_WIDTH + HORIZ_GAP;
  const monthRootPositions: Map<NodeId, PositionedNode> = new Map();
  const monthSubtreePositions: Map<NodeId, PositionedNode[]> = new Map();
  let cursorY = 0;
  for (const c of spineChildren) {
    const sub = layoutSubtreeRight({
      rootId: c.id,
      byParent,
      collapsed,
      startDepth: 0,
      startY: cursorY,
      baseX: monthBaseX,
    });
    positioned.push(...sub.positioned);
    if (c.nodeType === "skeleton" && c.timeBucketKind === "month") {
      monthRootPositions.set(c.id, sub.root);
      monthSubtreePositions.set(c.id, sub.positioned);
    }
    cursorY = sub.leafYAfter;
  }

  const monthSubtreeRightX = positioned.length
    ? Math.max(...positioned.map((p) => p.x + p.width), monthBaseX + NODE_WIDTH)
    : monthBaseX + NODE_WIDTH;
  const bracketX = monthSubtreeRightX + 24;
  const quarterX = bracketX + BRACKET_WIDTH;
  const monthRightEdge = monthBaseX + NODE_WIDTH;

  const brackets: BracketInfo[] = [];
  for (const q of quarterChildren) {
    const monthValues = monthsOfQuarter(q.timeBucketValue ?? "");
    const monthsForQ = monthValues
      .map((v) => monthChildren.find((mn) => mn.timeBucketValue === v))
      .filter((n): n is Node => !!n);
    if (monthsForQ.length === 0) continue;
    const subtreeNodes: PositionedNode[] = monthsForQ.flatMap(
      (mn) => monthSubtreePositions.get(mn.id) ?? [],
    );
    if (subtreeNodes.length === 0) continue;
    const wrapTop = Math.min(...subtreeNodes.map((p) => p.y));
    const wrapBot = Math.max(...subtreeNodes.map((p) => p.y + p.height));
    const targetCenter = (wrapTop + wrapBot) / 2;

    const sub = layoutSubtreeRight({
      rootId: q.id,
      byParent,
      collapsed,
      startDepth: 0,
      startY: 0,
      baseX: quarterX,
    });
    const qH = sub.root.height;
    const dy = targetCenter - (sub.root.y + qH / 2);
    for (const p of sub.positioned) {
      p.y += dy;
    }
    positioned.push(...sub.positioned);
    brackets.push({
      id: `q-${q.id}`,
      endpointId: q.id,
      bracketX,
      hookStartX: monthRightEdge,
      top: wrapTop,
      bot: wrapBot,
      variant: "quarter",
    });
  }

  const monthYsTops = monthChildren
    .map((m) => monthRootPositions.get(m.id))
    .filter((p): p is PositionedNode => !!p);
  if (monthYsTops.length > 0) {
    const allTop = Math.min(...monthYsTops.map((p) => p.y));
    const allBot = Math.max(...monthYsTops.map((p) => p.y + p.height));
    const rootH = nodeHeight(root);
    positioned.push({
      node: root,
      depth: 0,
      x: 0,
      y: (allTop + allBot) / 2 - rootH / 2,
      width: layoutNodeWidth(root),
      height: rootH,
      direction: "right",
    });
  } else {
    const rootH = nodeHeight(root);
    positioned.push({
      node: root,
      depth: 0,
      x: 0,
      y: 0,
      width: layoutNodeWidth(root),
      height: rootH,
      direction: "right",
    });
  }

  const byId = new Map(positioned.map((p) => [p.node.id, p] as const));
  const maxX = positioned.length
    ? Math.max(...positioned.map((p) => p.x + p.width))
    : 0;
  const maxY = positioned.length
    ? Math.max(...positioned.map((p) => p.y + p.height))
    : 0;

  const hiddenEdgesToChild = new Set<NodeId>(quarterChildren.map((q) => q.id));

  return {
    positioned,
    byId,
    width: maxX,
    height: maxY,
    brackets,
    boundaries: [],
    hiddenEdgesToChild,
  };
}

// =========================================================
// 布局：向右逻辑图（普通横向树）
// =========================================================
function layoutRightLogic(opts: {
  root: Node;
  byParent: Map<NodeId | "ROOT", Node[]>;
  collapsed: Set<NodeId>;
}): LayoutResult {
  const { root, byParent, collapsed } = opts;
  const sub = layoutSubtreeRight({
    rootId: root.id,
    byParent,
    collapsed,
    startDepth: 0,
    startY: 0,
    baseX: 0,
  });
  const positioned = sub.positioned;
  const byId = new Map(positioned.map((p) => [p.node.id, p] as const));
  const maxX = positioned.length
    ? Math.max(...positioned.map((p) => p.x + p.width))
    : 0;
  const maxY = positioned.length
    ? Math.max(...positioned.map((p) => p.y + p.height))
    : 0;
  return {
    positioned,
    byId,
    width: maxX,
    height: maxY,
    brackets: [],
    boundaries: [],
    hiddenEdgesToChild: new Set(),
  };
}

// =========================================================
// 布局：思维导图（中心放射，左右各一半）
// =========================================================
function layoutMindMap(opts: {
  root: Node;
  byParent: Map<NodeId | "ROOT", Node[]>;
  collapsed: Set<NodeId>;
}): LayoutResult {
  const { root, byParent, collapsed } = opts;
  const directChildren = visibleChildrenOf(root.id, byParent, collapsed);

  // 把直接子节点按 sortOrder 拆成左右两半（偶数右、奇数左 — 简单交错）
  const right: Node[] = [];
  const left: Node[] = [];
  directChildren.forEach((c, i) => {
    if (i % 2 === 0) right.push(c);
    else left.push(c);
  });

  const positioned: PositionedNode[] = [];
  const rootH = nodeHeight(root);
  // 先在临时 y=0 的位置布局两侧
  let cursorR = 0;
  const rightSubs: { sub: ReturnType<typeof layoutSubtreeRight> }[] = [];
  for (const c of right) {
    const sub = layoutSubtreeRight({
      rootId: c.id,
      byParent,
      collapsed,
      startDepth: 1,
      startY: cursorR,
      baseX: NODE_WIDTH + MINDMAP_HORIZ_GAP,
    });
    rightSubs.push({ sub });
    cursorR = sub.leafYAfter;
  }
  let cursorL = 0;
  const leftSubs: { sub: ReturnType<typeof layoutSubtreeLeft> }[] = [];
  for (const c of left) {
    const sub = layoutSubtreeLeft({
      rootId: c.id,
      byParent,
      collapsed,
      startDepth: 1,
      startY: cursorL,
      baseX: -MINDMAP_HORIZ_GAP, // 左侧的子节点 x = -GAP - depth*(W+GAP)
    });
    leftSubs.push({ sub });
    cursorL = sub.leafYAfter;
  }

  const rightTotal = cursorR;
  const leftTotal = cursorL;
  // 居中：让左右两边都对中心对齐（左右两半各自整体偏移）
  const tallest = Math.max(rightTotal, leftTotal);
  const dyR = (tallest - rightTotal) / 2;
  const dyL = (tallest - leftTotal) / 2;
  for (const { sub } of rightSubs) {
    for (const p of sub.positioned) p.y += dyR;
  }
  for (const { sub } of leftSubs) {
    for (const p of sub.positioned) p.y += dyL;
  }

  // 中心节点居中
  const rootY = tallest / 2 - rootH / 2;
  positioned.push({
    node: root,
    depth: 0,
    x: 0,
    y: rootY,
    width: layoutNodeWidth(root),
    height: rootH,
    direction: "right",
  });
  for (const { sub } of rightSubs) positioned.push(...sub.positioned);
  for (const { sub } of leftSubs) positioned.push(...sub.positioned);

  const byId = new Map(positioned.map((p) => [p.node.id, p] as const));
  // 左侧 x 是负的，需要平移
  const minX = positioned.length
    ? Math.min(...positioned.map((p) => p.x))
    : 0;
  if (minX < 0) {
    for (const p of positioned) p.x -= minX;
  }
  const maxX = positioned.length
    ? Math.max(...positioned.map((p) => p.x + p.width))
    : 0;
  const maxY = positioned.length
    ? Math.max(...positioned.map((p) => p.y + p.height))
    : 0;
  return {
    positioned,
    byId,
    width: maxX,
    height: maxY,
    brackets: [],
    boundaries: [],
    hiddenEdgesToChild: new Set(),
  };
}

// =========================================================
// 布局：组织架构（自上而下）
// =========================================================
function layoutOrgChart(opts: {
  root: Node;
  byParent: Map<NodeId | "ROOT", Node[]>;
  collapsed: Set<NodeId>;
}): LayoutResult {
  const { root, byParent, collapsed } = opts;
  const sub = layoutSubtreeDown({
    rootId: root.id,
    byParent,
    collapsed,
    startDepth: 0,
    startX: 0,
    baseY: 0,
  });
  const positioned = sub.positioned;
  const byId = new Map(positioned.map((p) => [p.node.id, p] as const));
  const maxX = positioned.length
    ? Math.max(...positioned.map((p) => p.x + p.width))
    : 0;
  const maxY = positioned.length
    ? Math.max(...positioned.map((p) => p.y + p.height))
    : 0;
  return {
    positioned,
    byId,
    width: maxX,
    height: maxY,
    brackets: [],
    boundaries: [],
    hiddenEdgesToChild: new Set(),
  };
}

// =========================================================
// 概要 / 边界 / 浮动主题
// =========================================================
function attachSummariesBoundariesFloating(opts: {
  root: Node;
  byParent: Map<NodeId | "ROOT", Node[]>;
  collapsed: Set<NodeId>;
  structure: MindMapStructure;
  result: LayoutResult;
}) {
  const { byParent, collapsed, structure, result } = opts;
  const all = [...byParent.values()].flat();

  // ----- 概要 summaries -----
  // 当一组同级节点已经被布局，我们在右侧（向右逻辑图）或方向侧画括号 + 概要节点
  const summaryNodes = all.filter(
    (n) => !n.isDeleted && !n.isFloating && isSummaryNode(n),
  );
  for (const sn of summaryNodes) {
    const range = (sn.summaryRange ?? [])
      .map((id) => result.byId.get(id))
      .filter((p): p is PositionedNode => !!p);
    if (range.length === 0) continue;
    const top = Math.min(...range.map((p) => p.y));
    const bot = Math.max(...range.map((p) => p.y + p.height));
    const rightX = Math.max(...range.map((p) => p.x + p.width));
    const leftX = Math.min(...range.map((p) => p.x));
    const targetCenter = (top + bot) / 2;

    if (structure === "org-chart") {
      // 自上而下：概要在下侧（暂时简单实现，仅概要节点定位 + 直线连）
      const x = (leftX + rightX) / 2 - layoutNodeWidth(sn) / 2;
      const y = bot + 32;
      const h = nodeHeight(sn);
      result.positioned.push({
        node: sn,
        depth: 0,
        x,
        y,
        width: layoutNodeWidth(sn),
        height: h,
        direction: "down",
      });
      result.byId.set(sn.id, result.positioned[result.positioned.length - 1]);
      continue;
    }

    // 横向（向右逻辑图 / 思维导图右半边都按这个走，左半边后面再说）
    const direction =
      result.byId.get(range[0].node.parentId ?? "")?.direction ?? "right";
    const goRight = direction !== "left"; // 左半边的节点 x 是更小，需要往左挂概要

    const bracketX = goRight ? rightX + 24 : leftX - 24;
    const hookStartX = goRight ? rightX : leftX;
    const x = goRight
      ? bracketX + BRACKET_WIDTH
      : bracketX - BRACKET_WIDTH - layoutNodeWidth(sn);
    const h = nodeHeight(sn);

    // 概要节点的子树（如果有）也需要布局
    const subTree =
      goRight
        ? layoutSubtreeRight({
            rootId: sn.id,
            byParent,
            collapsed,
            startDepth: 0,
            startY: 0,
            baseX: x,
          })
        : layoutSubtreeLeft({
            rootId: sn.id,
            byParent,
            collapsed,
            startDepth: 0,
            startY: 0,
            baseX: x + layoutNodeWidth(sn), // 因为左布局的 baseX 是子树根的右边对齐
          });
    const dy = targetCenter - (subTree.root.y + h / 2);
    for (const p of subTree.positioned) p.y += dy;
    result.positioned.push(...subTree.positioned);
    for (const p of subTree.positioned) result.byId.set(p.node.id, p);

    result.brackets.push({
      id: `sum-${sn.id}`,
      endpointId: sn.id,
      bracketX,
      hookStartX,
      top,
      bot,
      variant: "summary",
    });
    // 概要节点的"父子连线"由括号代替，需要隐藏（概要节点本身有 parentId 指向其同级的父）
    result.hiddenEdgesToChild.add(sn.id);
  }

  // ----- 边界 boundaries -----
  const boundaryNodes = all.filter(
    (n) => !n.isDeleted && !n.isFloating && isBoundaryNode(n),
  );
  for (const bn of boundaryNodes) {
    const range = (bn.boundaryRange ?? [])
      .map((id) => result.byId.get(id))
      .filter((p): p is PositionedNode => !!p);
    if (range.length === 0) continue;
    const minX = Math.min(...range.map((p) => p.x));
    const maxX2 = Math.max(...range.map((p) => p.x + p.width));
    const minY = Math.min(...range.map((p) => p.y));
    const maxY2 = Math.max(...range.map((p) => p.y + p.height));
    // 还要把这些节点的所有后代也包进来
    const ids = new Set<NodeId>();
    const queue: NodeId[] = (bn.boundaryRange ?? []).slice();
    while (queue.length) {
      const id = queue.shift()!;
      if (ids.has(id)) continue;
      ids.add(id);
      const ch = (byParent.get(id) ?? []).map((c) => c.id);
      queue.push(...ch);
    }
    let bxMin = minX,
      byMin = minY,
      bxMax = maxX2,
      byMax = maxY2;
    for (const id of ids) {
      const p = result.byId.get(id);
      if (!p) continue;
      bxMin = Math.min(bxMin, p.x);
      byMin = Math.min(byMin, p.y);
      bxMax = Math.max(bxMax, p.x + p.width);
      byMax = Math.max(byMax, p.y + p.height);
    }

    result.boundaries.push({
      id: `b-${bn.id}`,
      boundaryNode: bn,
      x: bxMin - BOUNDARY_PAD_X,
      y: byMin - BOUNDARY_PAD_Y - 18, // 18 是给标题留的位置
      width: bxMax - bxMin + BOUNDARY_PAD_X * 2,
      height: byMax - byMin + BOUNDARY_PAD_Y * 2 + 18,
    });
    // 边界节点不渲染为节点，连线也隐藏
    result.hiddenEdgesToChild.add(bn.id);
  }

  // ----- 浮动主题 -----
  const floatingNodes = all.filter((n) => !n.isDeleted && n.isFloating);
  for (const fn of floatingNodes) {
    const fx = fn.floatX ?? 80;
    const fy = fn.floatY ?? 80;
    const h = nodeHeight(fn);
    result.positioned.push({
      node: fn,
      depth: 0,
      x: fx,
      y: fy,
      width: layoutNodeWidth(fn),
      height: h,
      direction: "right",
    });
    result.byId.set(fn.id, result.positioned[result.positioned.length - 1]);
    // 浮动节点没有父子连线
    result.hiddenEdgesToChild.add(fn.id);
  }

  // 重新计算画布大小
  const positioned = result.positioned;
  result.width = positioned.length
    ? Math.max(...positioned.map((p) => p.x + p.width))
    : result.width;
  result.height = positioned.length
    ? Math.max(...positioned.map((p) => p.y + p.height))
    : result.height;
  // 还要把括号 / 边界纳入边界
  for (const b of result.brackets) {
    result.height = Math.max(result.height, b.bot);
  }
  for (const bb of result.boundaries) {
    result.width = Math.max(result.width, bb.x + bb.width);
    result.height = Math.max(result.height, bb.y + bb.height);
  }
}

function normalize(result: LayoutResult) {
  if (result.positioned.length === 0) return;
  let minX = Math.min(...result.positioned.map((p) => p.x));
  let minY = Math.min(...result.positioned.map((p) => p.y));
  for (const b of result.brackets) {
    minX = Math.min(minX, b.bracketX - 16);
    minY = Math.min(minY, b.top - 8);
  }
  for (const bb of result.boundaries) {
    minX = Math.min(minX, bb.x);
    minY = Math.min(minY, bb.y);
  }
  if (minX !== 0 || minY !== 0) {
    for (const p of result.positioned) {
      p.x -= minX;
      p.y -= minY;
    }
    for (const b of result.brackets) {
      b.bracketX -= minX;
      b.hookStartX -= minX;
      b.top -= minY;
      b.bot -= minY;
    }
    for (const bb of result.boundaries) {
      bb.x -= minX;
      bb.y -= minY;
    }
    result.width -= minX;
    result.height -= minY;
  }
}

export const LAYOUT_CONST = {
  NODE_WIDTH,
  NODE_HEIGHT_TASK,
  NODE_HEIGHT_NORMAL,
  NODE_HEIGHT_SKELETON_YEAR,
  NODE_HEIGHT_SKELETON_OTHER,
  HORIZ_GAP,
  VERT_GAP,
  BRACKET_WIDTH,
};
