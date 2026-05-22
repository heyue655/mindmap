"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCheck,
  Inbox,
  MessageSquare,
  CheckCircle2,
  Eye,
  EyeOff,
  Share2,
  AlertTriangle,
  Activity,
  CornerDownRight,
  AtSign,
  CalendarDays,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useStore } from "@/store/StoreProvider";
import type { AppNotification, NotificationKind } from "@/types";
import {
  getApiToken,
  markNotificationsReadApi,
  useRemoteWorkspaceApi,
} from "@/lib/api/workspaceApi";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MentionText from "@/features/mention/MentionText";
import { CALENDAR_LABEL } from "@/lib/calendarSync";

interface KindMeta {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  cls: string; // bg + text classes for the icon chip
}

const KIND_META: Record<NotificationKind, KindMeta> = {
  assignment_received: {
    label: "派任务",
    icon: Inbox,
    cls: "bg-amber-100 text-amber-800",
  },
  assignment_accepted: {
    label: "已接受",
    icon: CheckCircle2,
    cls: "bg-emerald-100 text-emerald-800",
  },
  assignment_negotiating: {
    label: "申请调整",
    icon: MessageSquare,
    cls: "bg-blue-100 text-blue-800",
  },
  assignment_adjusted: {
    label: "已调整",
    icon: CornerDownRight,
    cls: "bg-blue-100 text-blue-800",
  },
  task_status_changed: {
    label: "状态变更",
    icon: Activity,
    cls: "bg-slate-100 text-slate-700",
  },
  task_blocked: {
    label: "任务阻塞",
    icon: AlertTriangle,
    cls: "bg-rose-100 text-rose-800",
  },
  task_progress_updated: {
    label: "进度更新",
    icon: Activity,
    cls: "bg-slate-100 text-slate-700",
  },
  follow_request_received: {
    label: "关注申请",
    icon: Eye,
    cls: "bg-amber-100 text-amber-800",
  },
  follow_granted: {
    label: "关注通过",
    icon: Eye,
    cls: "bg-emerald-100 text-emerald-800",
  },
  follow_denied: {
    label: "关注拒绝",
    icon: EyeOff,
    cls: "bg-rose-100 text-rose-800",
  },
  node_shared: {
    label: "新分享",
    icon: Share2,
    cls: "bg-emerald-100 text-emerald-800",
  },
  mentioned_assign: {
    label: "@ 派任务",
    icon: AtSign,
    cls: "bg-purple-100 text-purple-800",
  },
  mentioned_discuss: {
    label: "@ 讨论",
    icon: AtSign,
    cls: "bg-purple-100 text-purple-800",
  },
  calendar_synced: {
    label: "日历同步",
    icon: CalendarDays,
    cls: "bg-sky-100 text-sky-800",
  },
  calendar_completion: {
    label: "日历回写",
    icon: CalendarDays,
    cls: "bg-emerald-100 text-emerald-800",
  },
  report_submitted: {
    label: "汇报提交",
    icon: MessageSquare,
    cls: "bg-indigo-100 text-indigo-800",
  },
  report_shared: {
    label: "汇报分享",
    icon: AtSign,
    cls: "bg-indigo-100 text-indigo-900",
  },
};

const FILTER_GROUPS: Array<{
  id: string;
  label: string;
  match: (k: NotificationKind) => boolean;
}> = [
  { id: "all", label: "全部", match: () => true },
  {
    id: "assignment",
    label: "派任务",
    match: (k) =>
      k === "assignment_received" ||
      k === "assignment_accepted" ||
      k === "assignment_negotiating" ||
      k === "assignment_adjusted",
  },
  {
    id: "follow",
    label: "关注 / 分享",
    match: (k) =>
      k === "follow_request_received" ||
      k === "follow_granted" ||
      k === "follow_denied" ||
      k === "node_shared",
  },
  {
    id: "task",
    label: "任务动态",
    match: (k) =>
      k === "task_status_changed" ||
      k === "task_progress_updated" ||
      k === "task_blocked",
  },
  {
    id: "mention",
    label: "@ 提及",
    match: (k) => k === "mentioned_assign" || k === "mentioned_discuss",
  },
  {
    id: "calendar",
    label: "日历",
    match: (k) => k === "calendar_synced" || k === "calendar_completion",
  },
  {
    id: "reports",
    label: "工作汇报",
    match: (k) => k === "report_submitted" || k === "report_shared",
  },
];

export default function NotificationsPage() {
  const {
    currentUser,
    currentUserId,
    users,
    notifications,
    setNotifications,
    follows,
    assignments,
  } = useStore();
  const router = useRouter();
  const [filterId, setFilterId] = useState<string>("all");
  const [showRead, setShowRead] = useState<boolean>(true);

  if (!currentUser || !currentUserId) return null;

  const myNotifs = useMemo(
    () =>
      notifications
        .filter((n) => n.recipientId === currentUserId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [notifications, currentUserId],
  );

  const filterDef = FILTER_GROUPS.find((f) => f.id === filterId)!;

  const filtered = myNotifs
    .filter((n) => filterDef.match(n.kind))
    .filter((n) => (showRead ? true : !n.readAt));

  const unreadInFilter = filtered.filter((n) => !n.readAt).length;
  const totalUnread = myNotifs.filter((n) => !n.readAt).length;

  const grouped = useMemo(() => groupByDay(filtered), [filtered]);

  const markRead = (ids: string[]) => {
    if (ids.length === 0) return;
    const set = new Set(ids);
    const nowISO = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) =>
        set.has(n.id) && !n.readAt ? { ...n, readAt: nowISO } : n,
      ),
    );
    // 在 API 模式下立即持久化，不依赖 StoreProvider 1200ms 防抖
    if (useRemoteWorkspaceApi()) {
      const token = getApiToken();
      if (token) {
        void markNotificationsReadApi(token, ids);
      }
    }
  };

  const handleClickNotification = (n: AppNotification) => {
    if (!n.readAt) markRead([n.id]);

    // 跳转到 /mindmap 时，把目标 node id 带上，让 MindMapPage 自动选中并打开详情
    const goMindmap = (tab: "details" | "markers" = "details") => {
      const params = new URLSearchParams();
      if (n.refNodeId) params.set("node", n.refNodeId);
      params.set("tab", tab);
      router.push(`/mindmap?${params.toString()}`);
    };

    // 跳转到 /team 时，携带负责人 userId，让 TeamPage 自动定位到该成员列表
    const goTeam = (memberId?: string) => {
      const params = new URLSearchParams();
      if (memberId) params.set("member", memberId);
      router.push(`/team?${params.toString()}`);
    };

    if (n.kind === "follow_request_received") {
      router.push("/inbox");
      return;
    }
    if (
      n.kind === "assignment_received" ||
      n.kind === "assignment_negotiating"
    ) {
      router.push("/inbox");
      return;
    }
    if (n.kind === "assignment_accepted" || n.kind === "assignment_adjusted") {
      // 我作为 assigner：去团队视图，定位到该下属
      const a = assignments.find((x) => x.id === n.refAssignmentId);
      if (a && a.assigneeId !== currentUserId) {
        goTeam(a.assigneeId);
        return;
      }
      goMindmap();
      return;
    }
    if (n.kind === "follow_granted" || n.kind === "follow_denied") {
      router.push("/inbox");
      return;
    }
    if (n.kind === "node_shared") {
      // actorId 是分享人（下级），定位到该成员列表
      goTeam(n.actorId);
      return;
    }
    if (
      n.kind === "task_status_changed" ||
      n.kind === "task_progress_updated" ||
      n.kind === "task_blocked"
    ) {
      // 下级任务动态通知：actorId 是执行变更的下级，定位到该成员列表
      goTeam(n.actorId);
      return;
    }
    if (
      n.kind === "mentioned_assign" ||
      n.kind === "mentioned_discuss" ||
      n.kind === "calendar_synced" ||
      n.kind === "calendar_completion"
    ) {
      goMindmap();
      return;
    }
    goMindmap();
  };

  return (
    <>
      <PageHeader
        title="通知中心"
        description={`${currentUser.name} · 共 ${myNotifs.length} 条，${totalUnread} 条未读`}
      />
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
        <div className="max-w-3xl">
          <Tabs value={filterId} onValueChange={setFilterId} className="mb-4">
            <TabsList>
              {FILTER_GROUPS.map((g) => {
                const count = myNotifs.filter(
                  (n) => g.match(n.kind) && !n.readAt,
                ).length;
                return (
                  <TabsTrigger key={g.id} value={g.id}>
                    {g.label}
                    {count > 0 && (
                      <Badge variant="destructive" className="h-4 px-1 text-[10px]">
                        {count}
                      </Badge>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>

          <div className="flex items-center justify-between mb-3 text-xs text-slate-500">
            <span>
              当前筛选：{filterDef.label} · {filtered.length} 条
              {unreadInFilter > 0 && (
                <span className="text-rose-600"> · {unreadInFilter} 未读</span>
              )}
            </span>
            <div className="flex items-center gap-3">
              {unreadInFilter > 0 && (
                <button
                  onClick={() =>
                    markRead(filtered.filter((n) => !n.readAt).map((n) => n.id))
                  }
                  className="flex items-center gap-1 text-brand-orange hover:underline"
                >
                  <CheckCheck className="h-3 w-3" />
                  全部标记已读
                </button>
              )}
              <button
                onClick={() => setShowRead((v) => !v)}
                className="text-brand-orange hover:underline"
              >
                {showRead ? "只看未读" : "显示已读"}
              </button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-slate-200 px-6 py-10 text-center text-sm text-slate-400">
              没有通知。
            </div>
          ) : (
            <div className="space-y-5">
              {grouped.map(([day, list]) => (
                <div key={day}>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
                    {day}
                  </div>
                  <div className="rounded-lg border border-border bg-white overflow-hidden divide-y divide-slate-100">
                    {list.map((n) => {
                      const meta = KIND_META[n.kind];
                      const Icon = meta.icon;
                      const actor = users.find((u) => u.id === n.actorId);
                      return (
                        <button
                          key={n.id}
                          onClick={() => handleClickNotification(n)}
                          className={cn(
                            "w-full text-left flex gap-3 px-4 py-3 hover:bg-slate-50 transition-colors",
                            !n.readAt && "bg-amber-50/40",
                          )}
                        >
                          <div
                            className={cn(
                              "shrink-0 h-7 w-7 rounded-md grid place-items-center",
                              meta.cls,
                            )}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 text-sm flex-wrap">
                              {actor?.avatar && (
                                <span className="leading-none shrink-0">
                                  {actor.avatar.startsWith("http") ? (
                                    <img
                                      src={actor.avatar}
                                      alt={actor.name}
                                      className="w-5 h-5 rounded-full object-cover inline-block"
                                    />
                                  ) : (
                                    <span className="text-base">{actor.avatar}</span>
                                  )}
                                </span>
                              )}
                              <span
                                className={cn(
                                  "truncate",
                                  !n.readAt
                                    ? "font-semibold text-brand-ink"
                                    : "text-slate-700",
                                )}
                              >
                                {n.title}
                              </span>
                              <Badge variant="outline" className="text-[10px]">
                                {meta.label}
                              </Badge>
                              {n.dingtalkPushedAt && (
                                <span
                                  className="inline-flex items-center text-[10px] px-1 rounded bg-blue-100 text-blue-700"
                                  title="已推送到钉钉"
                                >
                                  钉
                                </span>
                              )}
                              {n.calendarProvider && (
                                <span
                                  className="inline-flex items-center text-[10px] px-1 rounded bg-sky-100 text-sky-700"
                                  title={CALENDAR_LABEL[n.calendarProvider]}
                                >
                                  {CALENDAR_LABEL[n.calendarProvider]}
                                </span>
                              )}
                            </div>
                            {n.body && (
                              <div className="text-xs text-slate-500 truncate mt-0.5">
                                <MentionText text={n.body} users={users} />
                              </div>
                            )}
                            {/* 关联引用：FollowGrant 状态 */}
                            {n.refFollowGrantId && (
                              <FollowMini
                                followId={n.refFollowGrantId}
                                follows={follows}
                              />
                            )}
                          </div>
                          <div className="shrink-0 text-[11px] text-slate-400 whitespace-nowrap">
                            {formatTime(n.createdAt)}
                            {!n.readAt && (
                              <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-rose-500" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function FollowMini({
  followId,
  follows,
}: {
  followId: string;
  follows: ReturnType<typeof useStore>["follows"];
}) {
  const f = follows.find((g) => g.id === followId);
  if (!f) return null;
  if (f.state === "pending") return null;
  const stateColor =
    f.state === "granted"
      ? "text-emerald-600"
      : f.state === "denied"
        ? "text-rose-600"
        : "text-slate-400";
  return (
    <div className={cn("text-[11px] mt-0.5", stateColor)}>
      关注状态：
      {f.state === "granted"
        ? "已通过"
        : f.state === "denied"
          ? "已拒绝"
          : f.state === "expired"
            ? "已过期"
            : f.state === "revoked"
              ? "已撤回"
              : "进行中"}
      {f.decidedReason && ` · ${f.decidedReason}`}
    </div>
  );
}

// ---------- 工具 ----------

function groupByDay(list: AppNotification[]): Array<[string, AppNotification[]]> {
  const map = new Map<string, AppNotification[]>();
  for (const n of list) {
    const key = labelDay(n.createdAt);
    const arr = map.get(key) ?? [];
    arr.push(n);
    map.set(key, arr);
  }
  return Array.from(map.entries());
}

function labelDay(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor(
    (startOfDay(now).getTime() - startOfDay(d).getTime()) / 86400000,
  );
  if (diffDays === 0) return "今天";
  if (diffDays === 1) return "昨天";
  if (diffDays < 7) return `${diffDays} 天前`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
