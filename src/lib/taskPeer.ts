import type {
  Assignment,
  FollowGrant,
  MindMap,
  MindMapId,
  Node,
  NodeId,
  TaskPeerLink,
  UserId,
} from "@/types";
import { newId } from "./id";
import { primaryMindmapForOwner } from "./mindmapResolve";

/** 从任意节点向上找到最近的时间骨架（月/季/年） */
export function findNearestSkeletonAncestor(
  startId: NodeId | undefined,
  allNodes: Node[],
): Node | null {
  const map = new Map(allNodes.map((n) => [n.id, n] as const));
  let cur: NodeId | undefined = startId;
  while (cur) {
    const n = map.get(cur);
    if (!n) return null;
    if (
      n.nodeType === "skeleton" &&
      n.timeBucketKind &&
      n.timeBucketValue
    ) {
      return n;
    }
    cur = n.parentId;
  }
  return null;
}

function findSkeletonOnManagerMindmap(
  managerMindmap: MindMap,
  templateSk: Node | null,
  allNodes: Node[],
): Node | null {
  if (templateSk?.timeBucketKind && templateSk.timeBucketValue) {
    const hit = allNodes.find(
      (n) =>
        n.mindmapId === managerMindmap.id &&
        !n.isDeleted &&
        n.nodeType === "skeleton" &&
        n.timeBucketKind === templateSk.timeBucketKind &&
        n.timeBucketValue === templateSk.timeBucketValue,
    );
    if (hit) return hit;
  }
  const y = allNodes.find(
    (n) =>
      n.mindmapId === managerMindmap.id &&
      !n.isDeleted &&
      n.nodeType === "skeleton" &&
      n.timeBucketKind === "year",
  );
  return y ?? null;
}

function buildMirrorNode(args: {
  source: Node;
  mirrorId: NodeId;
  targetMindmapId: MindMapId;
  parentSkeletonId: NodeId;
  createdBy: UserId;
  managerPeer: TaskPeerLink;
  nowISO: string;
  existingNodes: Node[];
}): Node {
  const siblings = args.existingNodes.filter(
    (n) =>
      n.parentId === args.parentSkeletonId &&
      !n.isDeleted &&
      n.mindmapId === args.targetMindmapId,
  );
  const src = args.source;
  return {
    id: args.mirrorId,
    mindmapId: args.targetMindmapId,
    parentId: args.parentSkeletonId,
    sortOrder: siblings.length,
    title: src.title,
    description: src.description,
    nodeType: "normal",
    createdBy: args.createdBy,
    createdAt: args.nowISO,
    updatedAt: args.nowISO,
    isDeleted: false,
    task: src.task ? { ...src.task } : undefined,
    markers: src.markers ? [...src.markers] : undefined,
    labels: src.labels ? [...src.labels] : undefined,
    taskPeer: args.managerPeer,
  };
}

/** 派任务落地后：在上级导图创建关联副本，并与执行方主任务互链。
 *
 * 若 assignment.assignerSourceNodeId 存在，且对应节点是无 task/taskPeer 的普通节点，
 * 则直接升级该已有节点（追加 task + taskPeer），而非新建 mirror，
 * 以避免上级导图出现重复节点。返回值中 isUpgrade=true 时，
 * mirrorNode 是被升级的已有节点（调用方需走 updatedNodes 路径而非 newNodes 路径）。
 */
export function pairNodesForAssignmentMirror(opts: {
  primary: Node;
  assignment: Assignment;
  allNodes: Node[];
  mindmaps: MindMap[];
  nowISO: string;
}): {
  primaryOut: Node;
  mirrorNode: Node;
  assignerMirrorNodeId: NodeId;
  isUpgrade: boolean;
} | null {
  const { primary, assignment, allNodes, mindmaps, nowISO } = opts;

  // ── 就地升级分支：上级选中的原始普通节点 ──────────────────────────────────
  if (assignment.assignerSourceNodeId) {
    const sourceNode = allNodes.find(
      (n) => n.id === assignment.assignerSourceNodeId,
    );
    // 仅当节点存在且无 task / taskPeer（未被其他 assignment 占用）时升级
    if (sourceNode && !sourceNode.task && !sourceNode.taskPeer) {
      const executorPeer: TaskPeerLink = {
        peerNodeId: sourceNode.id,
        peerMindmapId: sourceNode.mindmapId,
        peerUserId: assignment.assignerId,
        kind: "assignment",
        iAmExecutor: true,
        syncProgressToPeer: true,
        refAssignmentId: assignment.id,
      };
      const managerPeer: TaskPeerLink = {
        peerNodeId: primary.id,
        peerMindmapId: primary.mindmapId,
        peerUserId: assignment.assigneeId,
        kind: "assignment",
        iAmExecutor: false,
        refAssignmentId: assignment.id,
      };
      // 升级后的上级节点：保留原字段，追加 task（复制自 primary）和 taskPeer
      const upgradedNode: Node = {
        ...sourceNode,
        task: primary.task ? { ...primary.task } : undefined,
        taskPeer: managerPeer,
        updatedAt: nowISO,
      };
      return {
        primaryOut: { ...primary, taskPeer: executorPeer },
        mirrorNode: upgradedNode,
        assignerMirrorNodeId: sourceNode.id,
        isUpgrade: true,
      };
    }
    // 若 sourceNode 不符合升级条件（已有 task / taskPeer / 不存在），
    // 降级到新建 mirror 流程（不中断）
  }

  // ── 常规分支：在上级导图新建 mirror 节点 ────────────────────────────────────
  const primaryMm = mindmaps.find((m) => m.id === primary.mindmapId);
  const assignerMm = primaryMindmapForOwner(
    mindmaps,
    assignment.assignerId,
    primaryMm?.year,
  );
  if (!assignerMm) return null;

  const templateSk = findNearestSkeletonAncestor(primary.parentId, allNodes);
  const parentOnAssigner = findSkeletonOnManagerMindmap(
    assignerMm,
    templateSk,
    allNodes,
  );
  if (!parentOnAssigner) return null;

  const mirrorId = newId("n");
  const executorPeer: TaskPeerLink = {
    peerNodeId: mirrorId,
    peerMindmapId: assignerMm.id,
    peerUserId: assignment.assignerId,
    kind: "assignment",
    iAmExecutor: true,
    syncProgressToPeer: true,
    refAssignmentId: assignment.id,
  };
  const managerPeer: TaskPeerLink = {
    peerNodeId: primary.id,
    peerMindmapId: primary.mindmapId,
    peerUserId: assignment.assigneeId,
    kind: "assignment",
    iAmExecutor: false,
    refAssignmentId: assignment.id,
  };

  const mirror = buildMirrorNode({
    source: primary,
    mirrorId,
    targetMindmapId: assignerMm.id,
    parentSkeletonId: parentOnAssigner.id,
    createdBy: assignment.assignerId,
    managerPeer,
    nowISO,
    existingNodes: allNodes,
  });

  return {
    primaryOut: { ...primary, taskPeer: executorPeer },
    mirrorNode: mirror,
    assignerMirrorNodeId: mirrorId,
    isUpgrade: false,
  };
}

/** 同意关注后：在上级导图创建关联副本，并与下级原任务互链 */
export function pairNodesForFollowGrant(opts: {
  source: Node;
  follow: FollowGrant;
  granteeMindmap: MindMap | undefined;
  allNodes: Node[];
  nowISO: string;
}):
  | {
      sourceOut: Node;
      mirror: Node;
      granteeMirrorNodeId: NodeId;
    }
  | null {
  const { source, follow, granteeMindmap, allNodes, nowISO } = opts;
  if (!granteeMindmap) return null;

  let sourceWork = source;
  if (!source.task && source.nodeType === "normal") {
    sourceWork = {
      ...source,
      task: {
        status: "not_started",
        progressPct: 0,
        priority: "P2",
        ownerId: follow.requesterId,
        openedAt: nowISO,
      },
      updatedAt: nowISO,
    };
  }

  const templateSk = findNearestSkeletonAncestor(sourceWork.parentId, allNodes);
  const parentOnGrantee = findSkeletonOnManagerMindmap(
    granteeMindmap,
    templateSk,
    allNodes,
  );
  if (!parentOnGrantee) return null;

  const mirrorId = newId("n");
  const executorPeer: TaskPeerLink = {
    peerNodeId: mirrorId,
    peerMindmapId: granteeMindmap.id,
    peerUserId: follow.granteeId,
    kind: "follow_grant",
    iAmExecutor: true,
    syncProgressToPeer: true,
    refFollowGrantId: follow.id,
  };
  const managerPeer: TaskPeerLink = {
    peerNodeId: sourceWork.id,
    peerMindmapId: sourceWork.mindmapId,
    peerUserId: follow.requesterId,
    kind: "follow_grant",
    iAmExecutor: false,
    refFollowGrantId: follow.id,
  };

  const mirror = buildMirrorNode({
    source: sourceWork,
    mirrorId,
    targetMindmapId: granteeMindmap.id,
    parentSkeletonId: parentOnGrantee.id,
    createdBy: follow.granteeId,
    managerPeer,
    nowISO,
    existingNodes: allNodes,
  });

  return {
    sourceOut: { ...sourceWork, taskPeer: executorPeer },
    mirror,
    granteeMirrorNodeId: mirrorId,
  };
}

/** 执行方更新任务字段后，把状态/进度/截止/closedAt 推到上级副本（尊重 syncProgressToPeer） */
export function syncExecutorProgressToPeer(
  nodes: Node[],
  executorNodeId: NodeId,
): Node[] {
  const exec = nodes.find((n) => n.id === executorNodeId);
  if (!exec?.task || !exec.taskPeer?.iAmExecutor) return nodes;
  if (exec.taskPeer.syncProgressToPeer === false) return nodes;
  const peerId = exec.taskPeer.peerNodeId;
  const t = exec.task;
  const nowISO = new Date().toISOString();
  return nodes.map((n) => {
    if (n.id !== peerId || !n.task) return n;
    return {
      ...n,
      task: {
        ...n.task,
        status: t.status,
        progressPct: t.progressPct,
        deadline: t.deadline,
        closedAt: t.closedAt,
      },
      updatedAt: nowISO,
    };
  });
}
