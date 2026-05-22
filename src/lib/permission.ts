import type {
  Assignment,
  FollowGrant,
  MindMap,
  Node,
  NodeId,
  NodeShare,
  OrgRelation,
  UserId,
} from "@/types";
import { getMiddleManagers } from "./org";

// 节点的 owner（即节点所属 MindMap 的 owner）
export function ownerOfNode(
  node: Node,
  mindmaps: MindMap[],
): UserId | undefined {
  const m = mindmaps.find((mm) => mm.id === node.mindmapId);
  return m?.ownerId;
}

export interface ViewContext {
  mindmaps: MindMap[];
  nodes: Node[];
  relations: OrgRelation[];
  assignments: Assignment[];
  follows: FollowGrant[];
  shares: NodeShare[];
}

// 计算从 node 向上的所有祖先 nodeId（含自身）
function ancestorIds(nodeId: NodeId, nodes: Node[]): Set<NodeId> {
  const map = new Map(nodes.map((n) => [n.id, n] as const));
  const result = new Set<NodeId>();
  let cur: NodeId | undefined = nodeId;
  while (cur) {
    if (result.has(cur)) break;
    result.add(cur);
    cur = map.get(cur)?.parentId;
  }
  return result;
}

// 判断 currentUser 能否 read 某节点
export function canRead(
  currentUserId: UserId,
  node: Node,
  ctx: ViewContext,
): boolean {
  // 1. owner 自己
  const owner = ownerOfNode(node, ctx.mindmaps);
  if (owner === currentUserId) return true;

  // 2. 派任务可见：节点是某 Assignment.resultNodeId，且当前用户是 assigner 或处在实线链路中间层
  const ancestors = ancestorIds(node.id, ctx.nodes);
  for (const a of ctx.assignments) {
    if (!a.resultNodeId || a.state !== "accepted") continue;
    if (!ancestors.has(a.resultNodeId)) continue;
    if (a.assignerId === currentUserId) return true;
    const middle = getMiddleManagers(a.assignerId, a.assigneeId, ctx.relations);
    if (middle.includes(currentUserId)) return true;
  }

  // 3. 主动分享
  for (const s of ctx.shares) {
    if (s.revokedAt) continue;
    if (s.audienceId !== currentUserId) continue;
    if (s.nodeId === node.id) return true;
    // 分享是单任务级别，不级联到子节点
  }

  // 4. 关注授权
  for (const f of ctx.follows) {
    if (f.state !== "granted") continue;
    if (f.granteeId !== currentUserId) continue;
    if (f.scope === "single_task" && f.targetNodeId === node.id) return true;
    if (f.scope === "subtree" && ancestors.has(f.targetNodeId)) return true;
  }

  return false;
}

// 判断 currentUser 能否 write 某节点
export function canWrite(
  currentUserId: UserId,
  node: Node,
  ctx: ViewContext,
): boolean {
  // 仅 owner 可写
  const owner = ownerOfNode(node, ctx.mindmaps);
  if (owner !== currentUserId) return false;
  // 骨架节点的"标题/时间标签"由系统持有，但其他写入（添加子节点）允许
  // 调用方需要根据具体操作再判一下骨架节点字段保护
  return true;
}

export function isSkeletonProtected(node: Node): boolean {
  return node.nodeType === "skeleton";
}
