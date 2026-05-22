import type {
  AppNotification,
  Assignment,
  MindMap,
  Node,
  NodeId,
  Priority,
  User,
  UserId,
} from "@/types";
import { newId } from "./id";
import { primaryMindmapForOwner } from "./mindmapResolve";
import { pairNodesForAssignmentMirror } from "./taskPeer";

// 由 assignment 产出一个或多个结果节点，并返回更新后的 assignment + 通知
// 不直接调用 setNodes / setAssignments，调用方批量应用
export interface AcceptResult {
  /** 接受时新建的节点（下级任务节点 + 常规 mirror 节点） */
  newNodes: Node[];
  /**
   * 被就地升级的已有节点（当 assignment.assignerSourceNodeId 命中纯普通节点时）。
   * 调用方需对这些节点做 map 更新而非 push 追加，防止产生重复节点。
   */
  updatedNodes: Node[];
  updatedAssignment: Assignment;
  notifications: AppNotification[];
}

interface AcceptOptionsBase {
  assignment: Assignment;
  acceptedById: UserId; // 谁触发了"接受"，记到通知 actor
  existingNodes: Node[];
  mindmaps: MindMap[];
  users: User[];
}

/** 已接受派任务后，尽量在上级导图挂上关联副本（同月/季骨架） */
function attachAssignmentMirror(
  result: AcceptResult,
  existingNodes: Node[],
  mindmaps: MindMap[],
  nowISO: string,
): AcceptResult {
  const { newNodes, updatedAssignment } = result;
  if (
    updatedAssignment.state !== "accepted" ||
    !updatedAssignment.resultNodeId
  ) {
    return result;
  }
  const primary =
    newNodes.find((n) => n.id === updatedAssignment.resultNodeId) ??
    newNodes[0];
  if (!primary) return result;
  const pair = pairNodesForAssignmentMirror({
    primary,
    assignment: updatedAssignment,
    allNodes: [...existingNodes, ...newNodes],
    mindmaps,
    nowISO,
  });
  if (!pair) return result;

  // primary 节点（下级执行方）需追加 taskPeer，统一走 newNodes map
  const updatedNewNodes = newNodes.map((n) =>
    n.id === primary.id ? pair.primaryOut : n,
  );

  if (pair.isUpgrade) {
    // mirrorNode 是已有节点的升级版，走 updatedNodes
    return {
      ...result,
      newNodes: updatedNewNodes,
      updatedNodes: [...result.updatedNodes, pair.mirrorNode],
      updatedAssignment: {
        ...updatedAssignment,
        assignerMirrorNodeId: pair.assignerMirrorNodeId,
      },
    };
  } else {
    // mirrorNode 是全新节点，走 newNodes
    return {
      ...result,
      newNodes: [...updatedNewNodes, pair.mirrorNode],
      updatedAssignment: {
        ...updatedAssignment,
        assignerMirrorNodeId: pair.assignerMirrorNodeId,
      },
    };
  }
}

// 直接接受（不调整）—— 用 proposed 字段建一个任务节点
export function acceptOriginal(opts: AcceptOptionsBase): AcceptResult {
  const { assignment, existingNodes, mindmaps, acceptedById } = opts;
  const nowISO = new Date().toISOString();

  const newNode = buildResultNode({
    assignment,
    title: assignment.proposedTitle,
    description: assignment.proposedDescription,
    deadline: assignment.proposedDeadline,
    priority: assignment.proposedPriority,
    targetMindmapId: assignment.targetMindmapId,
    targetSkeletonNodeId: assignment.targetSkeletonNodeId,
    ownerId: assignment.assigneeId,
    existingNodes,
    nowISO,
  });

  const updatedAssignment: Assignment = {
    ...assignment,
    state: "accepted",
    resultNodeId: newNode.id,
    resolvedAt: nowISO,
    adjustmentRequest: undefined,
  };

  const notif: AppNotification = {
    id: newId("n"),
    recipientId: assignment.assignerId,
    actorId: acceptedById,
    kind: "assignment_accepted",
    title: `任务已被接受`,
    body: assignment.proposedTitle,
    refAssignmentId: assignment.id,
    refNodeId: newNode.id,
    createdAt: nowISO,
  };

  return attachAssignmentMirror(
    {
      newNodes: [newNode],
      updatedNodes: [],
      updatedAssignment,
      notifications: [notif],
    },
    existingNodes,
    mindmaps,
    nowISO,
  );
}

// 接受调整方案 —— 按 adjustmentRequest 调整后再生成节点
export function acceptAdjustment(opts: AcceptOptionsBase): AcceptResult {
  const { assignment, existingNodes, mindmaps, acceptedById } = opts;
  const nowISO = new Date().toISOString();
  const adj = assignment.adjustmentRequest;
  if (!adj) {
    // 没有 adjustment，回退为直接接受
    return acceptOriginal(opts);
  }

  let newNodes: Node[] = [];
  let updated: Assignment;
  let bodyExtra = "";

  if (adj.kind === "deadline") {
    const node = buildResultNode({
      assignment,
      title: assignment.proposedTitle,
      description: assignment.proposedDescription,
      deadline: adj.newDeadline,
      priority: assignment.proposedPriority,
      targetMindmapId: assignment.targetMindmapId,
      targetSkeletonNodeId: assignment.targetSkeletonNodeId,
      ownerId: assignment.assigneeId,
      existingNodes,
      nowISO,
    });
    newNodes = [node];
    updated = {
      ...assignment,
      proposedDeadline: adj.newDeadline,
      state: "accepted",
      resultNodeId: node.id,
      resolvedAt: nowISO,
    };
    bodyExtra = `（按调整后的截止 ${adj.newDeadline}）`;
  } else if (adj.kind === "split") {
    const parent = buildResultNode({
      assignment,
      title: assignment.proposedTitle,
      description: assignment.proposedDescription
        ? `${assignment.proposedDescription}\n\n（拆分为 ${adj.subtasks.length} 个子任务）`
        : `（拆分为 ${adj.subtasks.length} 个子任务）`,
      deadline: assignment.proposedDeadline,
      priority: assignment.proposedPriority,
      targetMindmapId: assignment.targetMindmapId,
      targetSkeletonNodeId: assignment.targetSkeletonNodeId,
      ownerId: assignment.assigneeId,
      existingNodes,
      nowISO,
    });
    const subs = adj.subtasks.map((s, idx) =>
      buildResultNode({
        assignment,
        title: s.title,
        deadline: s.deadline ?? assignment.proposedDeadline,
        priority: assignment.proposedPriority,
        targetMindmapId: assignment.targetMindmapId,
        targetSkeletonNodeId: parent.id,
        ownerId: assignment.assigneeId,
        existingNodes: [...existingNodes, parent, ...newNodes],
        nowISO,
        sortOrderOverride: idx,
      }),
    );
    newNodes = [parent, ...subs];
    updated = {
      ...assignment,
      state: "accepted",
      resultNodeId: parent.id,
      resolvedAt: nowISO,
    };
    bodyExtra = `（拆分为 ${adj.subtasks.length} 个子任务）`;
  } else {
    // transfer：换人 + 在新人导图找等价骨架节点
    const newAssigneeId = adj.newAssigneeId;
    const targetMm = mindmaps.find((m) => m.id === assignment.targetMindmapId);
    const newMindmap = primaryMindmapForOwner(
      mindmaps,
      newAssigneeId,
      targetMm?.year,
    );
    if (!newMindmap) return acceptOriginal(opts);

    const oldSkeleton = existingNodes.find(
      (n) => n.id === assignment.targetSkeletonNodeId,
    );
    const newSkeleton = oldSkeleton
      ? existingNodes.find(
          (n) =>
            n.mindmapId === newMindmap.id &&
            n.nodeType === "skeleton" &&
            n.timeBucketKind === oldSkeleton.timeBucketKind &&
            n.timeBucketValue === oldSkeleton.timeBucketValue &&
            !n.isDeleted,
        )
      : undefined;
    // fallback：转派失败时挂到年度根
    const fallback = existingNodes.find(
      (n) =>
        n.mindmapId === newMindmap.id &&
        n.nodeType === "skeleton" &&
        n.timeBucketKind === "year" &&
        !n.isDeleted,
    );
    const targetSkeleton = newSkeleton ?? fallback;
    if (!targetSkeleton) return acceptOriginal(opts);

    const node = buildResultNode({
      assignment,
      title: assignment.proposedTitle,
      description: assignment.proposedDescription,
      deadline: assignment.proposedDeadline,
      priority: assignment.proposedPriority,
      targetMindmapId: newMindmap.id,
      targetSkeletonNodeId: targetSkeleton.id,
      ownerId: newAssigneeId,
      existingNodes,
      nowISO,
    });
    newNodes = [node];
    updated = {
      ...assignment,
      state: "accepted",
      assigneeId: newAssigneeId,
      targetMindmapId: newMindmap.id,
      targetSkeletonNodeId: targetSkeleton.id,
      resultNodeId: node.id,
      resolvedAt: nowISO,
    };
    bodyExtra = `（转派给新负责人）`;
  }

  const notif: AppNotification = {
    id: newId("n"),
    recipientId: assignment.assignerId,
    actorId: acceptedById,
    kind: "assignment_accepted",
    title: `调整后任务已落地`,
    body: `${assignment.proposedTitle} ${bodyExtra}`,
    refAssignmentId: updated.id,
    refNodeId: updated.resultNodeId,
    createdAt: nowISO,
  };

  // 如果是 transfer，新负责人也需要被通知
  const extraNotifs: AppNotification[] = [];
  if (adj.kind === "transfer" && updated.assigneeId !== assignment.assigneeId) {
    extraNotifs.push({
      id: newId("n"),
      recipientId: updated.assigneeId,
      actorId: acceptedById,
      kind: "assignment_received",
      title: `${getName(opts.users, assignment.assignerId)} 派给你一个新任务（转派）`,
      body: assignment.proposedTitle,
      refAssignmentId: updated.id,
      refNodeId: updated.resultNodeId,
      createdAt: nowISO,
    });
  }

  return attachAssignmentMirror(
    {
      newNodes,
      updatedNodes: [],
      updatedAssignment: updated,
      notifications: [notif, ...extraNotifs],
    },
    existingNodes,
    mindmaps,
    nowISO,
  );
}

// 上级"按原方案"——调整被驳回，回到 pending
export function insistOriginal(opts: {
  assignment: Assignment;
  acceptedById: UserId;
}): { updatedAssignment: Assignment; notifications: AppNotification[] } {
  const nowISO = new Date().toISOString();
  const updated: Assignment = {
    ...opts.assignment,
    state: "pending",
    adjustmentRequest: undefined,
  };
  const n: AppNotification = {
    id: newId("n"),
    recipientId: opts.assignment.assigneeId,
    actorId: opts.acceptedById,
    kind: "assignment_negotiating",
    title: `上级未采纳你的调整方案`,
    body: `${opts.assignment.proposedTitle} · 仍按原方案执行`,
    refAssignmentId: opts.assignment.id,
    createdAt: nowISO,
  };
  return { updatedAssignment: updated, notifications: [n] };
}

interface BuildNodeOpts {
  assignment: Assignment;
  title: string;
  description?: string;
  deadline?: string;
  priority: Priority;
  targetMindmapId: string | undefined;
  targetSkeletonNodeId: NodeId | undefined;
  ownerId: UserId;
  existingNodes: Node[];
  nowISO: string;
  sortOrderOverride?: number;
}

function buildResultNode(opts: BuildNodeOpts): Node {
  const siblings = opts.targetSkeletonNodeId
    ? opts.existingNodes.filter(
        (n) => n.parentId === opts.targetSkeletonNodeId && !n.isDeleted,
      )
    : [];
  const id = newId("n");
  return {
    id,
    mindmapId: opts.targetMindmapId ?? "",
    parentId: opts.targetSkeletonNodeId,
    sortOrder: opts.sortOrderOverride ?? siblings.length,
    title: opts.title,
    description: opts.description,
    nodeType: "normal",
    createdBy: opts.assignment.assignerId,
    createdAt: opts.nowISO,
    updatedAt: opts.nowISO,
    isDeleted: false,
    task: {
      status: "not_started",
      progressPct: 0,
      priority: opts.priority,
      deadline: opts.deadline,
      ownerId: opts.ownerId,
      openedAt: opts.nowISO,
    },
  };
}

function getName(users: User[], id: UserId): string {
  return users.find((u) => u.id === id)?.name ?? "某人";
}
