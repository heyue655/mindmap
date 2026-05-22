"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Calendar,
  Send,
  Share2,
  Eye,
  Activity,
  Inbox as InboxIcon,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useStore } from "@/store/StoreProvider";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import NodeDetailDrawer from "@/features/task/NodeDetailDrawer";
import AssignDialog from "@/features/assignment/AssignDialog";
import { canRead } from "@/lib/permission";
import {
  getAllSolidDescendants,
  getAllDescendantsByManagerId,
  getDirectReports,
  getUserById,
} from "@/lib/org";
import { skeletonLabel } from "@/features/assignment/labels";
import {
  STATUS_COLOR,
  PRIORITY_COLOR,
} from "@/features/mindmap/nodeStyle";
import type { Node, NodeId, UserId } from "@/types";
import { cn } from "@/lib/utils";

type SourceTag = "assigned" | "shared" | "follow";

interface RelevantTask {
  node: Node;
  bucket: Node | null; // 所属 quarter / month 骨架节点
  source: SourceTag[]; // 该任务对当前用户的可见来源
  lastUpdateAt?: string;
  lastUpdateText?: string;
}

const SOURCE_LABEL: Record<
  SourceTag,
  { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }
> = {
  assigned: {
    label: "派给的",
    icon: Send,
    cls: "bg-orange-100 text-orange-700",
  },
  shared: {
    label: "已分享",
    icon: Share2,
    cls: "bg-emerald-100 text-emerald-700",
  },
  follow: {
    label: "关注中",
    icon: Eye,
    cls: "bg-blue-100 text-blue-700",
  },
};

export default function TeamPage() {
  const router = useRouter();
  const {
    currentUser,
    currentUserId,
    users,
    relations,
    mindmaps,
    nodes,
    assignments,
    shares,
    follows,
    logs,
  } = useStore();
  const [activeMemberId, setActiveMemberId] = useState<UserId | null>(null);
  const [drawerNodeId, setDrawerNodeId] = useState<NodeId | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignPreset, setAssignPreset] = useState<{
    assigneeId?: UserId;
    skeletonId?: NodeId;
  }>({});

  const searchParams = useSearchParams();

  const allMembers = useMemo(() => {
    if (!currentUserId) return [];
    // 合并 OrgRelation 实线记录 + User.managerId 链，去重
    // 兜底：历史数据中 OrgRelation 可能缺失，managerId 链作为补充
    const fromRelations = getAllSolidDescendants(currentUserId, relations);
    const fromManagerId = getAllDescendantsByManagerId(currentUserId, users);
    const merged = Array.from(new Set([...fromRelations, ...fromManagerId]));

    const directIds = new Set(
      getDirectReports(currentUserId, relations).map((r) => r.subordinateId),
    );
    // managerId 直接下属也视为直属
    for (const u of users) {
      if (u.managerId === currentUserId) directIds.add(u.id);
    }

    return merged
      .map((id) => {
        const u = getUserById(users, id);
        if (!u) return null;
        return { user: u, isDirect: directIds.has(id) };
      })
      .filter((x): x is { user: NonNullable<ReturnType<typeof getUserById>>; isDirect: boolean } => !!x);
  }, [currentUserId, relations, users]);

  // 消费通知页跳转传入的 ?member=<userId>，定位到指定成员后清除参数
  useEffect(() => {
    const memberId = searchParams?.get("member");
    if (!memberId) return;
    const found = allMembers.find((m) => String(m.user.id) === memberId);
    if (found) {
      setActiveMemberId(found.user.id);
    }
    router.replace("/team");
  }, [searchParams, allMembers, router]);

  const activeMember = useMemo(() => {
    if (!activeMemberId && allMembers[0])
      return allMembers[0].user;
    return activeMemberId
      ? users.find((u) => u.id === activeMemberId) ?? null
      : null;
  }, [activeMemberId, allMembers, users]);

  // 该成员对当前用户可见的任务集合
  const relevantTasks: RelevantTask[] = useMemo(() => {
    if (!activeMember || !currentUserId) return [];
    const memberMapIds = new Set(
      mindmaps.filter((m) => m.ownerId === activeMember.id).map((m) => m.id),
    );
    if (memberMapIds.size === 0) return [];

    const ctx = { mindmaps, nodes, relations, assignments, follows, shares };
    const memberTaskNodes = nodes.filter(
      (n) =>
        memberMapIds.has(n.mindmapId) &&
        !n.isDeleted &&
        n.task &&
        canRead(currentUserId, n, ctx),
    );

    const result: RelevantTask[] = memberTaskNodes.map((n) => {
      const sources: SourceTag[] = [];
      // 是否派给的
      if (
        assignments.some(
          (a) =>
            a.assignerId === currentUserId &&
            a.state === "accepted" &&
            a.resultNodeId === n.id,
        )
      ) {
        sources.push("assigned");
      }
      // 是否分享给我的
      if (
        shares.some(
          (s) =>
            !s.revokedAt &&
            s.audienceId === currentUserId &&
            s.nodeId === n.id,
        )
      ) {
        sources.push("shared");
      }
      // 是否通过关注获得（任意已授权的关注，且该节点是 target 或子树中）
      if (
        follows.some(
          (f) =>
            f.granteeId === currentUserId &&
            f.state === "granted" &&
            (f.targetNodeId === n.id ||
              (f.scope === "subtree" &&
                isAncestor(f.targetNodeId, n.id, nodes))),
        )
      ) {
        sources.push("follow");
      }
      // 没有显式来源但 canRead 通过——可能是中间层透传
      if (sources.length === 0) sources.push("assigned");

      // 找到所属骨架（向上到第一个 skeleton 节点）
      const bucket = findBucket(n, nodes);

      // 最近一次日志
      const lastLog = logs
        .filter((l) => l.nodeId === n.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

      return {
        node: n,
        bucket,
        source: sources,
        lastUpdateAt: lastLog?.createdAt,
        lastUpdateText: lastLog?.contentText,
      };
    });

    // 按最近更新时间倒序（最新动态排最前），无更新记录的按截止日期倒序兜底
    return result.sort((a, b) => {
      const at = a.lastUpdateAt ?? a.node.task?.deadline ?? "";
      const bt = b.lastUpdateAt ?? b.node.task?.deadline ?? "";
      return bt.localeCompare(at);
    });
  }, [
    activeMember,
    currentUserId,
    mindmaps,
    nodes,
    relations,
    assignments,
    follows,
    shares,
    logs,
  ]);

  // 按 bucket 分组
  const groupedTasks = useMemo(() => {
    const groups = new Map<string, { bucket: Node | null; items: RelevantTask[] }>();
    for (const t of relevantTasks) {
      const key = t.bucket?.id ?? "ungrouped";
      if (!groups.has(key)) groups.set(key, { bucket: t.bucket, items: [] });
      groups.get(key)!.items.push(t);
    }
    return Array.from(groups.values());
  }, [relevantTasks]);

  // 该成员相关任务的活动流
  const activityFeed = useMemo(() => {
    if (!activeMember) return [];
    const taskIds = new Set(relevantTasks.map((t) => t.node.id));
    return logs
      .filter((l) => taskIds.has(l.nodeId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 30);
  }, [logs, relevantTasks, activeMember]);

  if (!currentUser || !currentUserId) return null;

  if (allMembers.length === 0) {
    return (
      <>
        <PageHeader
          title="团队视图"
          description="管理者视角：看下属与你相关的任务集"
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-sm text-slate-400 text-center max-w-sm">
            你目前还没有下属。
            <br />
            切到「孟增」「Alice」「吴产品」「张总」等管理者身份再来看这个页面。
          </div>
        </div>
      </>
    );
  }

  // 派任务跳转
  const openAssignToMember = (assigneeId: UserId, skeletonId?: NodeId) => {
    setAssignPreset({ assigneeId, skeletonId });
    setAssignOpen(true);
  };

  return (
    <>
      <PageHeader
        title="团队视图"
        description={`下属共 ${allMembers.length} 人 · 仅展示与你相关的任务`}
        right={
          <Button size="sm" onClick={() => router.push("/inbox")}>
            <InboxIcon className="h-3.5 w-3.5" />
            待我处理
          </Button>
        }
      />

      {/* 成员 tab */}
      <div className="border-b border-border bg-white px-6 py-2 overflow-x-auto">
        <div className="flex items-center gap-1">
          {allMembers.map(({ user: u, isDirect }) => {
            const active = activeMember?.id === u.id;
            // 该成员对我的待办数（待接受任务 + 调整中的）
            const pending = assignments.filter(
              (a) =>
                a.assignerId === currentUserId &&
                a.assigneeId === u.id &&
                (a.state === "pending" || a.state === "negotiating"),
            ).length;
            return (
              <button
                key={u.id}
                onClick={() => setActiveMemberId(u.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors",
                  "border",
                  active
                    ? "bg-brand-ink text-white border-brand-ink"
                    : "bg-white text-slate-700 border-border hover:bg-slate-50",
                )}
              >
                <Avatar size="sm" className="h-5 w-5 text-[10px]">
                  {u.avatar}
                </Avatar>
                <span>{u.name}</span>
                {!isDirect && (
                  <span
                    className={cn(
                      "text-[10px] px-1 rounded",
                      active
                        ? "bg-white/20 text-white"
                        : "bg-slate-100 text-slate-500",
                    )}
                  >
                    间接
                  </span>
                )}
                {pending > 0 && (
                  <Badge
                    variant="destructive"
                    className="h-4 px-1 text-[10px]"
                  >
                    {pending}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 主体两列布局 */}
      <div className="flex-1 overflow-hidden flex">
        {/* 左：任务列表 */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
          {activeMember && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar size="lg">{activeMember.avatar}</Avatar>
                <div>
                  <div className="font-semibold text-brand-ink">
                    {activeMember.name}
                  </div>
                  <div className="text-xs text-slate-500">
                    {activeMember.jobTitle} · {activeMember.email}
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => openAssignToMember(activeMember.id)}
              >
                <Send className="h-3.5 w-3.5" />
                派任务给 {activeMember.name}
              </Button>
            </div>
          )}

          {relevantTasks.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-slate-200 px-6 py-10 text-center text-sm text-slate-400">
              你和 {activeMember?.name} 之间还没有任何"与你相关"的任务。
              <br />
              试试用上方按钮派一个任务过来，或等他主动分享。
            </div>
          ) : (
            groupedTasks.map(({ bucket, items }) => (
              <div key={bucket?.id ?? "x"}>
                <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                  {bucket ? skeletonLabel(bucket) : "未归类"}
                  <span className="text-[10px] text-slate-400">
                    ({items.length})
                  </span>
                </div>
                <div className="space-y-2">
                  {items.map((t) => (
                    <RelevantTaskCard
                      key={t.node.id}
                      task={t}
                      onClick={() => setDrawerNodeId(t.node.id)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* 右：活动流 */}
        <aside className="w-80 border-l border-border bg-white overflow-y-auto p-4 hidden lg:block">
          <div className="flex items-center gap-2 text-sm font-semibold text-brand-ink mb-3">
            <Activity className="h-4 w-4" />
            最近动态
          </div>
          {activityFeed.length === 0 ? (
            <div className="text-xs text-slate-400">暂无更新</div>
          ) : (
            <div className="space-y-3 relative pl-4 before:absolute before:left-1 before:top-1.5 before:bottom-2 before:w-px before:bg-slate-200">
              {activityFeed.map((log) => {
                const author = users.find((u) => u.id === log.authorId);
                const node = nodes.find((n) => n.id === log.nodeId);
                return (
                  <button
                    key={log.id}
                    onClick={() => setDrawerNodeId(log.nodeId)}
                    className="block w-full text-left relative hover:bg-slate-50 rounded p-1 -ml-1"
                  >
                    <div className="absolute -left-[15px] top-1.5 h-2 w-2 rounded-full bg-brand-orange ring-2 ring-white" />
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Avatar size="sm" className="h-4 w-4 text-[9px]">
                        {author?.avatar}
                      </Avatar>
                      <span className="text-xs font-medium text-brand-ink truncate">
                        {author?.name}
                      </span>
                      <span className="text-[10px] text-slate-400 ml-auto shrink-0">
                        {formatRel(log.createdAt)}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 truncate">
                      {log.contentText}
                    </div>
                    {node && (
                      <div className="text-[10px] text-slate-400 truncate">
                        on · {node.title}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </aside>
      </div>

      <NodeDetailDrawer
        open={drawerNodeId !== null}
        nodeId={drawerNodeId}
        tab="details"
        onTabChange={() => {}}
        variant="modal"
        onClose={() => setDrawerNodeId(null)}
        onAssign={(id) => {
          if (!activeMember) return;
          const node = nodes.find((n) => n.id === id);
          const bucket = node ? findBucket(node, nodes) : null;
          openAssignToMember(activeMember.id, bucket?.id);
          setDrawerNodeId(null);
        }}
      />
      <AssignDialog
        open={assignOpen}
        onClose={() => {
          setAssignOpen(false);
          setAssignPreset({});
        }}
        presetAssigneeId={assignPreset.assigneeId}
        presetTargetSkeletonId={assignPreset.skeletonId}
      />
    </>
  );
}

function RelevantTaskCard({
  task,
  onClick,
}: {
  task: RelevantTask;
  onClick: () => void;
}) {
  const { node, source, lastUpdateAt, lastUpdateText } = task;
  const status = node.task?.status;
  const statusStyle = status ? STATUS_COLOR[status] : null;

  return (
    <Card
      onClick={onClick}
      className="cursor-pointer hover:shadow-md transition-shadow"
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm text-brand-ink truncate">
              {node.title}
            </div>
            {node.description && (
              <div className="text-xs text-slate-500 truncate">
                {node.description}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {source.map((s) => {
              const conf = SOURCE_LABEL[s];
              return (
                <span
                  key={s}
                  className={cn(
                    "inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-medium",
                    conf.cls,
                  )}
                >
                  <conf.icon className="h-2.5 w-2.5" />
                  {conf.label}
                </span>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
          {statusStyle && (
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded font-medium",
                statusStyle.chip,
                statusStyle.chipText,
              )}
            >
              {statusStyle.label}
            </span>
          )}
          {node.task && (
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded font-medium",
                PRIORITY_COLOR[node.task.priority].chip,
                PRIORITY_COLOR[node.task.priority].text,
              )}
            >
              {node.task.priority}
            </span>
          )}
          {node.task?.deadline && (
            <Badge variant="outline" className="gap-1 text-[10px] px-1.5 py-0">
              <Calendar className="h-2.5 w-2.5" />
              {node.task.deadline}
            </Badge>
          )}
        </div>

        {node.task && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full",
                  status === "blocked"
                    ? "bg-rose-400"
                    : status === "done"
                      ? "bg-emerald-400"
                      : "bg-blue-400",
                )}
                style={{ width: `${node.task.progressPct}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-500 tabular-nums">
              {node.task.progressPct}%
            </span>
          </div>
        )}

        {lastUpdateAt && (
          <div className="text-[10px] text-slate-400 mt-1.5 truncate">
            最近：{lastUpdateText} · {formatRel(lastUpdateAt)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- helpers ----------

function findBucket(node: Node, nodes: Node[]): Node | null {
  const map = new Map(nodes.map((n) => [n.id, n] as const));
  let cur: Node | undefined = node;
  while (cur) {
    if (
      cur.nodeType === "skeleton" &&
      (cur.timeBucketKind === "month" || cur.timeBucketKind === "quarter")
    ) {
      return cur;
    }
    cur = cur.parentId ? map.get(cur.parentId) : undefined;
  }
  return null;
}

function isAncestor(
  ancestorId: NodeId,
  descendantId: NodeId,
  nodes: Node[],
): boolean {
  const map = new Map(nodes.map((n) => [n.id, n] as const));
  let cur: NodeId | undefined = descendantId;
  while (cur) {
    if (cur === ancestorId) return true;
    cur = map.get(cur)?.parentId;
  }
  return false;
}

function formatRel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} 天前`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
