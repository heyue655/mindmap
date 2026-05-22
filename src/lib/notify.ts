import type {
  Assignment,
  FollowGrant,
  MindMap,
  Node,
  NodeShare,
  OrgRelation,
  UserId,
} from "@/types";
import { ownerOfNode } from "./permission";

/**
 * 当某个任务节点 (status / progress / 内容) 发生变更时，需要被同步通知的人。
 * 包含：
 *  - 派任务人（accepted Assignment 的 assignerId）
 *  - 关注人（granted FollowGrant 的 granteeId，scope=single_task 或 subtree）
 *  - 主动分享对象（NodeShare.audienceId，未撤销）
 *  - 该节点 owner 的实线上级中"在派任务链路上"的中间层（沿用既有可见性规则；这里简化只取 assigner）
 *
 * 排除：变更发起人自己。
 */
export function collectTaskUpdateRecipients(args: {
  node: Node;
  actorId: UserId;
  mindmaps: MindMap[];
  nodes: Node[];
  assignments: Assignment[];
  follows: FollowGrant[];
  shares: NodeShare[];
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  relations: OrgRelation[];
}): UserId[] {
  const { node, actorId, mindmaps, nodes, assignments, follows, shares } = args;

  const recipients = new Set<UserId>();

  const owner = ownerOfNode(node, mindmaps);

  // 1. 派任务人：node 是某 accepted Assignment 的 resultNodeId，或 node 是其后代
  const ancestorIds = new Set<string>();
  ancestorIds.add(node.id);
  let cursor: string | undefined = node.parentId;
  while (cursor) {
    ancestorIds.add(cursor);
    const p = nodes.find((n) => n.id === cursor);
    cursor = p?.parentId;
  }
  for (const a of assignments) {
    if (!a.resultNodeId) continue;
    if (a.state !== "accepted" && a.state !== "adjusted") continue;
    if (ancestorIds.has(a.resultNodeId)) {
      recipients.add(a.assignerId);
    }
  }

  // 2. 关注人
  for (const f of follows) {
    if (f.state !== "granted") continue;
    if (f.scope === "single_task" && f.targetNodeId === node.id) {
      recipients.add(f.granteeId);
    } else if (f.scope === "subtree" && ancestorIds.has(f.targetNodeId)) {
      recipients.add(f.granteeId);
    }
  }

  // 3. 主动分享
  for (const s of shares) {
    if (s.revokedAt) continue;
    if (s.nodeId === node.id) {
      recipients.add(s.audienceId);
    }
  }

  // 排除自己 + 节点所有者（owner 本身就是改动发起人时不需通知；如果 actor 是别人，owner 也不需被通知自己的节点）
  recipients.delete(actorId);
  if (owner) recipients.delete(owner);

  return Array.from(recipients);
}
