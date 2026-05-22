"use client";

import { useState } from "react";
import {
  CheckCircle2,
  MessageSquare,
  Inbox as InboxIcon,
  Send,
  CornerDownLeft,
  Calendar,
  Split,
  ArrowRightLeft,
  Eye,
  XCircle,
  Clock,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useStore } from "@/store/StoreProvider";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import NegotiateDialog from "@/features/assignment/NegotiateDialog";
import { skeletonLabel } from "@/features/assignment/labels";
import {
  acceptAdjustment,
  acceptOriginal,
  insistOriginal,
} from "@/lib/assignment";
import { newId } from "@/lib/id";
import { primaryMindmapForOwner } from "@/lib/mindmapResolve";
import { pairNodesForFollowGrant } from "@/lib/taskPeer";
import type {
  AdjustmentRequest,
  AppNotification,
  Assignment,
  AssignmentState,
  FollowGrant,
} from "@/types";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/store/toast";

const STATE_LABEL: Record<AssignmentState, { label: string; cls: string }> = {
  pending: { label: "待接受", cls: "bg-amber-100 text-amber-800" },
  accepted: { label: "已接受", cls: "bg-emerald-100 text-emerald-800" },
  negotiating: { label: "调整中", cls: "bg-blue-100 text-blue-800" },
  adjusted: { label: "已调整", cls: "bg-blue-100 text-blue-800" },
  rejected_by_system: { label: "已拒收", cls: "bg-rose-100 text-rose-800" },
};

export default function InboxPage() {
  const {
    currentUser,
    currentUserId,
    users,
    nodes,
    mindmaps,
    setNodes,
    assignments,
    setAssignments,
    setNotifications,
    follows,
    setFollows,
    shares,
    setShares,
  } = useStore();

  const [negotiateAssignment, setNegotiateAssignment] =
    useState<Assignment | null>(null);

  if (!currentUser || !currentUserId) return null;

  // 待我处理：作为 assignee 的 pending、作为 assigner 的 negotiating
  const myPendingAsAssignee = assignments.filter(
    (a) => a.assigneeId === currentUserId && a.state === "pending",
  );
  const myNegotiatingAsAssigner = assignments.filter(
    (a) => a.assignerId === currentUserId && a.state === "negotiating",
  );
  const followsToDecide = follows.filter(
    (f) => f.granteeId === currentUserId && f.state === "pending",
  );

  // 我派出的 / 我作为 assignee 已处理过的：用一张时间线显示
  const sentByMe = assignments
    .filter((a) => a.assignerId === currentUserId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const myFollowRequests = follows
    .filter((f) => f.requesterId === currentUserId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const sharesOut = shares
    .filter((s) => s.sharerId === currentUserId && !s.revokedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const todoCount =
    myPendingAsAssignee.length +
    myNegotiatingAsAssigner.length +
    followsToDecide.length;

  // ----- 操作 -----
  // 将 AcceptResult 中的 newNodes（新建）和 updatedNodes（升级的已有节点）合并写入 store
  const applyAcceptResult = (result: ReturnType<typeof acceptOriginal>) => {
    setNodes((prev) => {
      // 先追加全新节点
      const withNew = [...prev, ...result.newNodes];
      // 再把就地升级的节点 map 覆盖
      if (result.updatedNodes.length === 0) return withNew;
      const upgradeMap = new Map(result.updatedNodes.map((n) => [n.id, n]));
      return withNew.map((n) => upgradeMap.get(n.id) ?? n);
    });
    setAssignments((prev) =>
      prev.map((a) =>
        a.id === result.updatedAssignment.id ? result.updatedAssignment : a,
      ),
    );
    setNotifications((prev) => [...result.notifications, ...prev]);
  };

  const handleAccept = (assignment: Assignment) => {
    // 防止对已处理的 assignment 重复操作
    if (assignment.state !== "pending") return;
    if (!assignment.targetSkeletonNodeId || !assignment.targetMindmapId) {
      toast.error("该任务尚未落地（骨架节点未匹配），请刷新页面后重试。");
      return;
    }
    const result = acceptOriginal({
      assignment,
      acceptedById: currentUserId,
      existingNodes: nodes,
      mindmaps,
      users,
    });
    applyAcceptResult(result);
  };

  const handleNegotiate = (req: AdjustmentRequest) => {
    if (!negotiateAssignment) return;
    const nowISO = new Date().toISOString();
    setAssignments((prev) =>
      prev.map((a) =>
        a.id === negotiateAssignment.id
          ? { ...a, state: "negotiating", adjustmentRequest: req }
          : a,
      ),
    );
    setNotifications((prev) => [
      {
        id: `n-${nowISO}-${Math.random().toString(36).slice(2, 6)}`,
        recipientId: negotiateAssignment.assignerId,
        actorId: currentUserId,
        kind: "assignment_negotiating",
        title: `下属对你派的任务申请调整`,
        body: negotiateAssignment.proposedTitle,
        refAssignmentId: negotiateAssignment.id,
        createdAt: nowISO,
      },
      ...prev,
    ]);
    setNegotiateAssignment(null);
  };

  const handleAcceptAdjustment = (assignment: Assignment) => {
    // 防止对已处理的 assignment 重复操作
    if (assignment.state !== "negotiating" && assignment.state !== "adjusted") return;
    if (!assignment.targetSkeletonNodeId || !assignment.targetMindmapId) {
      toast.error("该任务尚未落地（骨架节点未匹配），请刷新页面后重试。");
      return;
    }
    const result = acceptAdjustment({
      assignment,
      acceptedById: currentUserId,
      existingNodes: nodes,
      mindmaps,
      users,
    });
    applyAcceptResult(result);
  };

  const decideFollow = (
    follow: FollowGrant,
    decision: "granted" | "denied",
    decidedReason?: string,
  ) => {
    const nowISO = new Date().toISOString();

    if (decision === "granted") {
      const target = nodes.find((n) => n.id === follow.targetNodeId);
      const granteeMm = primaryMindmapForOwner(mindmaps, follow.granteeId);
      const pair =
        target && granteeMm
          ? pairNodesForFollowGrant({
              source: target,
              follow,
              granteeMindmap: granteeMm,
              allNodes: nodes,
              nowISO,
            })
          : null;

      if (pair) {
        setNodes((prev) => {
          const mapped = prev.map((n) =>
            n.id === target!.id ? pair.sourceOut : n,
          );
          return [...mapped, pair.mirror];
        });
        setFollows((prev) =>
          prev.map((f) =>
            f.id === follow.id
              ? {
                  ...f,
                  state: decision,
                  decidedReason,
                  decidedAt: nowISO,
                  granteeMirrorNodeId: pair.granteeMirrorNodeId,
                }
              : f,
          ),
        );
        toast.success("已同意关注，副本已添加到你的导图");
      } else {
        // 权限仍然授予，但未能在当前用户导图中创建镜像节点
        setFollows((prev) =>
          prev.map((f) =>
            f.id === follow.id
              ? {
                  ...f,
                  state: decision,
                  decidedReason,
                  decidedAt: nowISO,
                }
              : f,
          ),
        );
        toast.success("已同意关注");
        toast.info("未能在你的导图中创建副本（骨架节点不匹配），你仍可在「团队视图」查看该任务");
      }
    } else {
      setFollows((prev) =>
        prev.map((f) =>
          f.id === follow.id
            ? {
                ...f,
                state: decision,
                decidedReason,
                decidedAt: nowISO,
              }
            : f,
        ),
      );
    }

    const notif: AppNotification = {
      id: newId("n"),
      recipientId: follow.requesterId,
      actorId: currentUserId,
      kind: decision === "granted" ? "follow_granted" : "follow_denied",
      title:
        decision === "granted"
          ? `${currentUser.name} 同意了你的关注申请`
          : `${currentUser.name} 拒绝了你的关注申请`,
      body: decidedReason,
      refNodeId: follow.targetNodeId,
      refFollowGrantId: follow.id,
      createdAt: nowISO,
    };
    setNotifications((prev) => [notif, ...prev]);
  };

  const handleInsist = (assignment: Assignment) => {
    const result = insistOriginal({
      assignment,
      acceptedById: currentUserId,
    });
    setAssignments((prev) =>
      prev.map((a) =>
        a.id === assignment.id ? result.updatedAssignment : a,
      ),
    );
    setNotifications((prev) => [...result.notifications, ...prev]);
  };

  return (
    <>
      <PageHeader
        title="待我处理"
        description="派任务 / 调整 / 关注请求 等需要你决定的事项"
        right={
          todoCount > 0 ? (
            <Badge variant="destructive" className="px-2 py-1">
              {todoCount} 项待办
            </Badge>
          ) : null
        }
      />
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
        <Tabs defaultValue="todo" className="max-w-3xl">
          <TabsList>
            <TabsTrigger value="todo">
              <InboxIcon className="h-3.5 w-3.5" />
              待我处理
              {todoCount > 0 && (
                <Badge variant="destructive" className="h-4 px-1 text-[10px]">
                  {todoCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="sent">
              <Send className="h-3.5 w-3.5" />
              我派出的
            </TabsTrigger>
            <TabsTrigger value="follow">
              <Eye className="h-3.5 w-3.5" />
              关注 / 分享
            </TabsTrigger>
          </TabsList>

          <TabsContent value="todo" className="space-y-3">
            {myPendingAsAssignee.length === 0 &&
              myNegotiatingAsAssigner.length === 0 &&
              followsToDecide.length === 0 && (
                <EmptyState text="清空一片！没有需要处理的事项。" />
              )}

            {myPendingAsAssignee.map((a) => (
              <PendingAssignmentCard
                key={a.id}
                assignment={a}
                onAccept={() => handleAccept(a)}
                onNegotiate={() => setNegotiateAssignment(a)}
              />
            ))}

            {myNegotiatingAsAssigner.map((a) => (
              <NegotiatingCard
                key={a.id}
                assignment={a}
                onAcceptAdjustment={() => handleAcceptAdjustment(a)}
                onInsist={() => handleInsist(a)}
              />
            ))}

            {followsToDecide.map((f) => (
              <FollowDecisionCard
                key={f.id}
                follow={f}
                onDecide={(decision, reason) => decideFollow(f, decision, reason)}
              />
            ))}
          </TabsContent>

          <TabsContent value="sent" className="space-y-3">
            {sentByMe.length === 0 && (
              <EmptyState text="你还没有派出过任务。" />
            )}
            {sentByMe.map((a) => (
              <SentAssignmentCard key={a.id} assignment={a} />
            ))}
          </TabsContent>

          <TabsContent value="follow" className="space-y-4">
            <div>
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                我发起的关注申请（{myFollowRequests.length}）
              </div>
              {myFollowRequests.length === 0 ? (
                <EmptyState text="还没有发起过关注申请。在自己的导图节点上右键 → 申请上级关注。" />
              ) : (
                <div className="space-y-2">
                  {myFollowRequests.map((f) => (
                    <FollowRequestSentCard
                      key={f.id}
                      follow={f}
                      onRevoke={() =>
                        setFollows((prev) =>
                          prev.map((g) =>
                            g.id === f.id
                              ? { ...g, state: "revoked", decidedAt: new Date().toISOString() }
                              : g,
                          ),
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                我主动分享的（{sharesOut.length}）
              </div>
              {sharesOut.length === 0 ? (
                <EmptyState text="还没有主动分享过任务。在自己的导图节点上右键 → 分享给上级。" />
              ) : (
                <div className="space-y-2">
                  {sharesOut.map((s) => (
                    <ShareSentCard
                      key={s.id}
                      shareId={s.id}
                      onRevoke={() =>
                        setShares((prev) =>
                          prev.map((x) =>
                            x.id === s.id
                              ? { ...x, revokedAt: new Date().toISOString() }
                              : x,
                          ),
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <NegotiateDialog
        open={!!negotiateAssignment}
        assignment={negotiateAssignment}
        onClose={() => setNegotiateAssignment(null)}
        onSubmit={handleNegotiate}
      />
    </>
  );
}

// ---------- 子组件 ----------

function PendingAssignmentCard({
  assignment,
  onAccept,
  onNegotiate,
}: {
  assignment: Assignment;
  onAccept: () => void;
  onNegotiate: () => void;
}) {
  const { users, nodes } = useStore();
  const [accepting, setAccepting] = useState(false);
  const assigner = users.find((u) => u.id === assignment.assignerId);
  const skeleton = nodes.find((n) => n.id === assignment.targetSkeletonNodeId);

  const handleAcceptClick = () => {
    if (accepting) return;
    setAccepting(true);
    onAccept();
    // onAccept 是同步的，无需 finally；状态会随 assignment.state 变化自然消失
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Avatar size="md">{assigner?.avatar}</Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-brand-ink">
                {assigner?.name}
              </span>
              <span className="text-sm text-slate-500">派给你</span>
              <StateBadge state="pending" />
            </div>
            <div className="text-base font-semibold text-brand-ink mb-1">
              {assignment.proposedTitle}
            </div>
            {assignment.proposedDescription && (
              <p className="text-sm text-slate-600 mb-2 whitespace-pre-wrap">
                {assignment.proposedDescription}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <Badge variant="outline" className="gap-1">
                <Calendar className="h-3 w-3" />
                {assignment.proposedDeadline ?? "无截止"}
              </Badge>
              <Badge variant="outline">{assignment.proposedPriority}</Badge>
              <Badge variant="outline">
                {skeleton ? skeletonLabel(skeleton) : "—"}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onNegotiate}>
            <MessageSquare className="h-3.5 w-3.5" />
            申请调整
          </Button>
          <Button size="sm" onClick={handleAcceptClick} disabled={accepting}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            {accepting ? "处理中…" : "接受"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function NegotiatingCard({
  assignment,
  onAcceptAdjustment,
  onInsist,
}: {
  assignment: Assignment;
  onAcceptAdjustment: () => void;
  onInsist: () => void;
}) {
  const { users } = useStore();
  const [accepting, setAccepting] = useState(false);
  const assignee = users.find((u) => u.id === assignment.assigneeId);
  const adj = assignment.adjustmentRequest;

  const handleAcceptClick = () => {
    if (accepting) return;
    setAccepting(true);
    onAcceptAdjustment();
  };

  return (
    <Card className="border-blue-200">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Avatar size="md">{assignee?.avatar}</Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-brand-ink">
                {assignee?.name}
              </span>
              <span className="text-sm text-slate-500">对你派的任务申请调整</span>
              <StateBadge state="negotiating" />
            </div>
            <div className="text-base font-semibold text-brand-ink mb-2">
              {assignment.proposedTitle}
            </div>

            {adj && (
              <div className="rounded-md bg-blue-50 border border-blue-100 px-3 py-2 text-sm space-y-1.5">
                {adj.kind === "deadline" && (
                  <>
                    <div className="flex items-center gap-2 text-blue-800 font-medium">
                      <Calendar className="h-3.5 w-3.5" />
                      建议改期
                    </div>
                    <div className="text-slate-700">
                      {assignment.proposedDeadline ?? "—"} →{" "}
                      <strong>{adj.newDeadline}</strong>
                    </div>
                    {adj.reason && (
                      <div className="text-slate-600 text-xs">
                        理由：{adj.reason}
                      </div>
                    )}
                  </>
                )}
                {adj.kind === "split" && (
                  <>
                    <div className="flex items-center gap-2 text-blue-800 font-medium">
                      <Split className="h-3.5 w-3.5" />
                      建议拆分
                    </div>
                    <ul className="text-xs text-slate-700 space-y-0.5 pl-4 list-disc">
                      {adj.subtasks.map((s, i) => (
                        <li key={i}>{s.title}</li>
                      ))}
                    </ul>
                    {adj.reason && (
                      <div className="text-slate-600 text-xs">
                        理由：{adj.reason}
                      </div>
                    )}
                  </>
                )}
                {adj.kind === "transfer" && (
                  <>
                    <div className="flex items-center gap-2 text-blue-800 font-medium">
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                      建议转派
                    </div>
                    <div className="text-slate-700">
                      转派给{" "}
                      <strong>
                        {users.find((u) => u.id === adj.newAssigneeId)?.name ??
                          "—"}
                      </strong>
                    </div>
                    {adj.reason && (
                      <div className="text-slate-600 text-xs">
                        理由：{adj.reason}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onInsist}>
            <CornerDownLeft className="h-3.5 w-3.5" />
            按原方案
          </Button>
          <Button size="sm" onClick={handleAcceptClick} disabled={accepting}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            {accepting ? "处理中…" : "接受调整"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FollowDecisionCard({
  follow,
  onDecide,
}: {
  follow: FollowGrant;
  onDecide: (decision: "granted" | "denied", reason?: string) => void;
}) {
  const { users, nodes } = useStore();
  const requester = users.find((u) => u.id === follow.requesterId);
  const node = nodes.find((n) => n.id === follow.targetNodeId);
  const [showDeny, setShowDeny] = useState(false);
  const [denyReason, setDenyReason] = useState("");

  return (
    <Card className="border-amber-200">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Avatar size="md">{requester?.avatar}</Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-brand-ink">
                {requester?.name}
              </span>
              <span className="text-sm text-slate-500">
                申请你关注他的{" "}
                {follow.scope === "subtree" ? "子树" : "单个任务"}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-amber-100 text-amber-800">
                <Eye className="inline h-3 w-3 mr-0.5" />
                关注请求
              </span>
            </div>
            <div className="text-base font-semibold text-brand-ink mb-1">
              {node?.title ?? "（未知节点）"}
            </div>
            {follow.reason && (
              <p className="text-sm text-slate-600 whitespace-pre-wrap">
                {follow.reason}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-2">
              <Badge variant="outline" className="gap-1">
                <Clock className="h-3 w-3" />
                到期：{follow.expiresAt.slice(0, 10)}
              </Badge>
              <Badge variant="outline">
                范围：{follow.scope === "subtree" ? "子树" : "单条任务"}
              </Badge>
            </div>
          </div>
        </div>
        {showDeny ? (
          <div className="space-y-2">
            <Textarea
              rows={2}
              placeholder="拒绝理由（可选，对方能看到）"
              value={denyReason}
              onChange={(e) => setDenyReason(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowDeny(false);
                  setDenyReason("");
                }}
              >
                取消
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => onDecide("denied", denyReason.trim() || undefined)}
              >
                <XCircle className="h-3.5 w-3.5" />
                确认拒绝
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeny(true)}
            >
              <XCircle className="h-3.5 w-3.5" />
              拒绝
            </Button>
            <Button size="sm" onClick={() => onDecide("granted")}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              同意关注
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SentAssignmentCard({ assignment }: { assignment: Assignment }) {
  const { users, nodes } = useStore();
  const assignee = users.find((u) => u.id === assignment.assigneeId);
  const skeleton = nodes.find((n) => n.id === assignment.targetSkeletonNodeId);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar size="md">{assignee?.avatar}</Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm text-slate-500">指派给</span>
              <span className="font-medium text-brand-ink">
                {assignee?.name}
              </span>
              <StateBadge state={assignment.state} />
            </div>
            <div className="text-base font-semibold text-brand-ink mb-1">
              {assignment.proposedTitle}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <Badge variant="outline" className="gap-1">
                <Calendar className="h-3 w-3" />
                {assignment.proposedDeadline ?? "无截止"}
              </Badge>
              <Badge variant="outline">{assignment.proposedPriority}</Badge>
              {skeleton && (
                <Badge variant="outline">{skeletonLabel(skeleton)}</Badge>
              )}
            </div>
            {assignment.state === "negotiating" &&
              assignment.adjustmentRequest && (
                <div className="mt-2 text-xs text-blue-700">
                  下属正在调整 · 请到上方"待我处理"决定
                </div>
              )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StateBadge({ state }: { state: AssignmentState }) {
  const conf = STATE_LABEL[state];
  return (
    <span
      className={cn(
        "text-[10px] px-1.5 py-0.5 rounded font-medium",
        conf.cls,
      )}
    >
      {conf.label}
    </span>
  );
}

const FOLLOW_STATE_LABEL: Record<
  FollowGrant["state"],
  { label: string; cls: string }
> = {
  pending: { label: "等待审批", cls: "bg-amber-100 text-amber-800" },
  granted: { label: "已同意", cls: "bg-emerald-100 text-emerald-800" },
  denied: { label: "被拒绝", cls: "bg-rose-100 text-rose-800" },
  revoked: { label: "已撤回", cls: "bg-slate-100 text-slate-600" },
  expired: { label: "已过期", cls: "bg-slate-100 text-slate-600" },
};

function FollowRequestSentCard({
  follow,
  onRevoke,
}: {
  follow: FollowGrant;
  onRevoke: () => void;
}) {
  const { users, nodes } = useStore();
  const grantee = users.find((u) => u.id === follow.granteeId);
  const node = nodes.find((n) => n.id === follow.targetNodeId);
  const stateConf = FOLLOW_STATE_LABEL[follow.state];
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <Avatar size="sm">{grantee?.avatar}</Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 text-sm">
              <span className="text-slate-500">申请</span>
              <span className="font-medium text-brand-ink">
                {grantee?.name}
              </span>
              <span className="text-slate-500">关注</span>
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded font-medium",
                  stateConf.cls,
                )}
              >
                {stateConf.label}
              </span>
            </div>
            <div className="text-sm font-medium text-brand-ink truncate">
              {node?.title ?? "（节点已删除）"}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-500">
              <Badge variant="outline">
                {follow.scope === "subtree" ? "子树" : "单条"}
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Clock className="h-3 w-3" />
                到期 {follow.expiresAt.slice(0, 10)}
              </Badge>
              {follow.decidedReason && (
                <span className="text-rose-600">理由：{follow.decidedReason}</span>
              )}
            </div>
          </div>
          {(follow.state === "pending" || follow.state === "granted") && (
            <Button variant="ghost" size="sm" onClick={onRevoke}>
              撤回
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ShareSentCard({
  shareId,
  onRevoke,
}: {
  shareId: string;
  onRevoke: () => void;
}) {
  const { shares, users, nodes } = useStore();
  const share = shares.find((s) => s.id === shareId);
  if (!share) return null;
  const audience = users.find((u) => u.id === share.audienceId);
  const node = nodes.find((n) => n.id === share.nodeId);
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <Avatar size="sm">{audience?.avatar}</Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 text-sm">
              <span className="text-slate-500">分享给</span>
              <span className="font-medium text-brand-ink">
                {audience?.name}
              </span>
            </div>
            <div className="text-sm font-medium text-brand-ink truncate">
              {node?.title ?? "（节点已删除）"}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {share.createdAt.slice(0, 10)}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onRevoke}>
            撤回
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border-2 border-dashed border-slate-200 px-6 py-10 text-center text-sm text-slate-400">
      {text}
    </div>
  );
}
