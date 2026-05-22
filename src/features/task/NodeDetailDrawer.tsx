import { useEffect, useMemo, useState } from "react";
import {
  X,
  Clock,
  User as UserIcon,
  CalendarDays,
  Send,
  Eye,
  Share2,
  Trash2,
  Sparkles,
  Tags,
  Info,
  MousePointerClick,
  Inbox as InboxIcon,
  CheckCircle2,
  RefreshCw,
  Palette,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { useStore } from "@/store/StoreProvider";
import type {
  AppNotification,
  Assignment,
  CalendarProvider,
  MindMapStructure,
  Node,
  NodeId,
  NodeTopicFormat,
  Priority,
  TaskFields,
  TaskLog,
  TaskStatus,
  User,
} from "@/types";
import NodeFormatPanel from "@/features/mindmap/NodeFormatPanel";
import { newId } from "@/lib/id";
import { canRead, canWrite, ownerOfNode } from "@/lib/permission";
import { cn } from "@/lib/utils";
import { STATUS_COLOR } from "@/features/mindmap/nodeStyle";
import { MarkerIcon, getMarker } from "@/features/markers/markers";
import MarkerPicker from "@/features/markers/MarkerPicker";
import { collectTaskUpdateRecipients } from "@/lib/notify";
import {
  ALL_CALENDAR_PROVIDERS,
  CALENDAR_EMOJI,
  CALENDAR_LABEL,
  buildCalendarSyncedNotification,
  reconcileNodeCalendarSyncs,
  simulateCalendarCompletion,
} from "@/lib/calendarSync";
import { uniqueMentionUserIds } from "@/lib/mention";
import MentionText from "@/features/mention/MentionText";
import MentionTextarea from "@/features/mention/MentionTextarea";
import { buildMentionsForSubmit } from "@/lib/mentionEffects";
import { syncExecutorProgressToPeer } from "@/lib/taskPeer";
import {
  getApiToken,
  pushDingTalkCalendarApi,
  useRemoteWorkspaceApi,
} from "@/lib/api/workspaceApi";

export type RightDockTab = "details" | "markers" | "style" | "assigned-out";

interface Props {
  open: boolean;
  nodeId: NodeId | null;
  tab: RightDockTab;
  onTabChange: (t: RightDockTab) => void;
  onClose: () => void;
  onAssign?: (nodeId: NodeId) => void;
  onShare?: (nodeId: NodeId) => void;
  onRequestFollow?: (nodeId: NodeId) => void;
  onDelete?: (nodeId: NodeId) => void;
  onSelectNode?: (id: NodeId) => void; // 用于"派出"tab 列表跳到具体任务详情
  // dock: 作为 flex 兄弟内嵌显示（如思维导图页右侧）
  // modal: 作为浮层显示，带半透明背景（如团队页弹出查看）
  variant?: "dock" | "modal";
  // 是否显示"派出"tab（仅在自己的导图页且我是 manager 时打开）
  showAssignedOut?: boolean;
  /** 当前导图结构（样式面板「结构」区只读展示） */
  mindmapStructure?: MindMapStructure;
}

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "not_started", label: "未开始" },
  { value: "in_progress", label: "进行中" },
  { value: "done", label: "已完成" },
  { value: "blocked", label: "阻塞" },
];

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: "P0", label: "P0 · 最高" },
  { value: "P1", label: "P1 · 高" },
  { value: "P2", label: "P2 · 中" },
  { value: "P3", label: "P3 · 低" },
];

export default function NodeDetailDrawer({
  open,
  nodeId,
  tab,
  onTabChange,
  onClose,
  onAssign,
  onShare,
  onRequestFollow,
  onDelete,
  onSelectNode,
  variant = "dock",
  showAssignedOut = false,
  mindmapStructure,
}: Props) {
  const {
    currentUser,
    currentUserId,
    nodes,
    setNodes,
    logs,
    setLogs,
    mindmaps,
    relations,
    assignments,
    follows,
    shares,
    setShares,
    users,
    setNotifications,
    calendarSyncs,
    setCalendarSyncs,
    mentions,
    setMentions,
  } = useStore();

  const node = useMemo(
    () => (nodeId ? nodes.find((n) => n.id === nodeId) ?? null : null),
    [nodeId, nodes],
  );

  // 「派出」tab 数据：我作为 assigner 的所有任务
  const myAssignedOut = useMemo(() => {
    if (!currentUserId) return [];
    return assignments
      .filter((a) => a.assignerId === currentUserId)
      .map((a) => {
        const result = a.resultNodeId
          ? nodes.find((n) => n.id === a.resultNodeId) ?? null
          : null;
        const skeleton = nodes.find((n) => n.id === a.targetSkeletonNodeId);
        const assignee = users.find((u) => u.id === a.assigneeId);
        const lastLog = result
          ? logs
              .filter((l) => l.nodeId === result.id)
              .sort(
                (x, y) =>
                  new Date(y.createdAt).getTime() -
                  new Date(x.createdAt).getTime(),
              )[0]
          : undefined;
        return { assignment: a, result, skeleton, assignee, lastLog };
      })
      .sort((a, b) => {
        // 1. pending / negotiating 排最前
        const stateRank = (s: string) =>
          s === "pending"
            ? 0
            : s === "negotiating"
              ? 1
              : s === "accepted"
                ? 2
                : 3;
        const sa = stateRank(a.assignment.state);
        const sb = stateRank(b.assignment.state);
        if (sa !== sb) return sa - sb;
        // 2. accepted 内部按最近活动 desc
        const ta = a.lastLog?.createdAt ?? a.assignment.createdAt;
        const tb = b.lastLog?.createdAt ?? b.assignment.createdAt;
        return new Date(tb).getTime() - new Date(ta).getTime();
      });
  }, [currentUserId, assignments, nodes, users, logs]);

  const assignedOutBadgeCount = myAssignedOut.filter(
    (x) =>
      x.assignment.state === "pending" || x.assignment.state === "negotiating",
  ).length;

  const writable = useMemo(() => {
    if (!node || !currentUserId) return false;
    return canWrite(currentUserId, node, {
      mindmaps,
      nodes,
      relations,
      assignments,
      follows,
      shares,
    });
  }, [node, currentUserId, mindmaps, nodes, relations, assignments, follows, shares]);

  const readable = useMemo(() => {
    if (!node || !currentUserId) return false;
    return canRead(currentUserId, node, {
      mindmaps,
      nodes,
      relations,
      assignments,
      follows,
      shares,
    });
  }, [node, currentUserId, mindmaps, nodes, relations, assignments, follows, shares]);

  const [logDraft, setLogDraft] = useState("");
  /** 执行方写日志时：是否把本条同步到上级关联副本（默认随「同步进度」开关） */
  const [syncLogToPeer, setSyncLogToPeer] = useState(true);

  useEffect(() => {
    setLogDraft("");
  }, [nodeId]);

  useEffect(() => {
    if (node?.taskPeer?.iAmExecutor)
      setSyncLogToPeer(node.taskPeer.syncProgressToPeer !== false);
    else setSyncLogToPeer(false);
  }, [nodeId, node?.taskPeer?.iAmExecutor, node?.taskPeer?.syncProgressToPeer]);

  if (!open || !currentUser) return null;

  const isSkeleton = node?.nodeType === "skeleton";
  const canEditTitle = writable && !isSkeleton;
  const canEditTask = writable && !isSkeleton;
  const isMyNode = node
    ? canWrite(currentUserId!, node, {
        mindmaps,
        nodes,
        relations,
        assignments,
        follows,
        shares,
      })
    : false;

  const owner = users.find((u) => u.id === node?.task?.ownerId);
  const nodeLogs = node
    ? logs
        .filter((l) => l.nodeId === node.id)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
    : [];

  const updateNode = (patch: Partial<Node>) => {
    if (!node) return;
    setNodes((prev) =>
      prev.map((n) =>
        n.id === node.id
          ? { ...n, ...patch, updatedAt: new Date().toISOString() }
          : n,
      ),
    );
  };

  const patchTopicFormat = (patch: Partial<NodeTopicFormat>) => {
    if (!node) return;
    const merged: NodeTopicFormat = { ...(node.topicFormat ?? {}), ...patch };
    (Object.keys(merged) as (keyof NodeTopicFormat)[]).forEach((k) => {
      if (merged[k] === undefined) delete merged[k];
    });
    const keys = Object.keys(merged);
    updateNode({
      topicFormat: keys.length > 0 ? merged : undefined,
    });
  };

  /** 任务字段变更后，把这个节点的 calendarSyncs 同步重算 */
  const syncCalendars = (nextNode: Node) => {
    const owner = users.find((u) => u.id === ownerOfNode(nextNode, mindmaps));
    if (!owner || !nextNode.task) return;
    const nowISO = new Date().toISOString();
    const { next, added, updated } = reconcileNodeCalendarSyncs({
      node: nextNode,
      owner,
      prev: calendarSyncs,
      nowISO,
    });
    if (added.length === 0 && updated.length === 0) return;
    setCalendarSyncs(next);
    // 仅在 added（首次同步）时给 owner 发一条提示
    if (added.length > 0) {
      const notif = buildCalendarSyncedNotification({
        node: nextNode,
        owner,
        added,
        updated,
        nowISO,
      });
      if (notif) setNotifications((prev) => [notif, ...prev]);
    }
  };

  const updateTask = (patch: Partial<TaskFields>) => {
    if (!node) return;
    const nowISO = new Date().toISOString();
    if (!node.task) {
      const newTask: TaskFields = {
        status: "not_started",
        progressPct: 0,
        priority: "P2",
        ownerId: currentUser.id,
        openedAt: nowISO,
        ...patch,
      };
      const nextNode: Node = { ...node, task: newTask, updatedAt: nowISO };
      setNodes((prev) => {
        const next = prev.map((n) =>
          n.id === node.id ? nextNode : n,
        );
        return syncExecutorProgressToPeer(next, node.id);
      });
      addLog("status_change", `任务被创建`, { newStatus: newTask.status });
      syncCalendars(nextNode);
      return;
    }
    const next: TaskFields = { ...node.task, ...patch };
    const nextNode: Node = { ...node, task: next, updatedAt: nowISO };
    setNodes((prev) => {
      const mapped = prev.map((n) => (n.id === node.id ? nextNode : n));
      return syncExecutorProgressToPeer(mapped, node.id);
    });
    syncCalendars(nextNode);
  };

  const notifyTaskUpdate = (
    kind: "task_status_changed" | "task_progress_updated" | "task_blocked",
    title: string,
    body: string,
  ) => {
    if (!node) return;
    const recipients = collectTaskUpdateRecipients({
      node,
      actorId: currentUser.id,
      mindmaps,
      nodes,
      assignments,
      follows,
      shares,
      relations,
    });
    if (recipients.length === 0) return;
    const nowISO = new Date().toISOString();
    const notifs: AppNotification[] = recipients.map((rid) => ({
      id: newId("n"),
      recipientId: rid,
      actorId: currentUser.id,
      kind,
      title,
      body,
      refNodeId: node.id,
      createdAt: nowISO,
    }));
    setNotifications((prev) => [...notifs, ...prev]);
  };

  const setStatus = (status: TaskStatus) => {
    if (!node || !node.task) return;
    if (status === node.task.status) return;
    const old = node.task.status;
    const patch: Partial<TaskFields> = { status };
    if (status === "done") {
      patch.progressPct = 100;
      patch.closedAt = new Date().toISOString();
    } else if (old === "done") {
      patch.closedAt = undefined;
    }
    updateTask(patch);
    addLog("status_change", `状态：${labelOf(old)} → ${labelOf(status)}`, {
      from: old,
      to: status,
    });
    notifyTaskUpdate(
      status === "blocked" ? "task_blocked" : "task_status_changed",
      `${currentUser.name} 更新任务状态`,
      `${node.title}：${labelOf(old)} → ${labelOf(status)}`,
    );
  };

  const setProgress = (v: number) => {
    if (!node || !node.task) return;
    if (v === node.task.progressPct) return;
    const old = node.task.progressPct;
    const patch: Partial<TaskFields> = { progressPct: v };
    if (v === 100 && node.task.status !== "done") {
      patch.status = "done";
      patch.closedAt = new Date().toISOString();
    } else if (v < 100 && node.task.status === "done") {
      patch.status = "in_progress";
      patch.closedAt = undefined;
    }
    updateTask(patch);
    addLog("progress_change", `进度：${old}% → ${v}%`, { from: old, to: v });
    notifyTaskUpdate(
      "task_progress_updated",
      `${currentUser.name} 更新任务进度`,
      `${node.title}：${old}% → ${v}%`,
    );
  };

  const setMarkers = (next: string[]) => {
    updateNode({ markers: next });
  };

  const addLog = (
    type: TaskLog["logType"],
    text: string,
    meta?: Record<string, unknown>,
    opts?: { syncToPeer?: boolean },
  ) => {
    if (!node) return;
    const nowISO = new Date().toISOString();
    const log: TaskLog = {
      id: newId("log"),
      nodeId: node.id,
      authorId: currentUser.id,
      logType: type,
      contentText: text,
      contentMeta: meta,
      createdAt: nowISO,
    };
    const dupDefault =
      !!node.taskPeer?.iAmExecutor &&
      node.taskPeer.syncProgressToPeer !== false;
    const wantDup =
      dupDefault &&
      (opts?.syncToPeer ?? true) &&
      type !== "attachment_added" &&
      node.taskPeer;
    if (wantDup && node.taskPeer) {
      const peerLog: TaskLog = {
        id: newId("log"),
        nodeId: node.taskPeer.peerNodeId,
        authorId: currentUser.id,
        logType: type,
        contentText: `[同步] ${text}`,
        contentMeta: {
          ...meta,
          mirroredFromNodeId: node.id,
          mirroredFromName: currentUser.name,
        },
        createdAt: nowISO,
      };
      setLogs((prev) => [log, peerLog, ...prev]);
      return;
    }
    setLogs((prev) => [log, ...prev]);
  };

  const pushMentions = (kind: "assign" | "discuss", text: string) => {
    if (!node) return;
    const ids = uniqueMentionUserIds(text, users);
    if (ids.length === 0) return;
    const nowISO = new Date().toISOString();
    const { mentionEvents, notifications, newShares } = buildMentionsForSubmit({
      node,
      byUser: currentUser,
      kind,
      text,
      users,
      prevMentions: mentions,
      prevShares: shares,
      mentionedUserIds: ids,
      nowISO,
    });
    if (mentionEvents.length > 0) {
      setMentions((prev) => [...mentionEvents, ...prev]);
    }
    if (notifications.length > 0) {
      setNotifications((prev) => [...notifications, ...prev]);
    }
    if (newShares.length > 0) {
      setShares((prev) => [...prev, ...newShares]);
    }
  };

  const submitLog = () => {
    if (!logDraft.trim()) return;
    const text = logDraft.trim();
    addLog("comment", text, undefined, { syncToPeer: syncLogToPeer });
    pushMentions("discuss", text);
    setLogDraft("");
  };

  // 该节点对当前用户的可见来源
  const visibilityHints = (() => {
    if (!node) return [] as string[];
    if (isMyNode) {
      const mine: string[] = ["你是节点所有者"];
      if (node.taskPeer?.iAmExecutor) {
        mine.push("关联任务：上级导图中有对应副本，可控制是否同步进度");
      } else if (node.taskPeer && !node.taskPeer.iAmExecutor) {
        const nm = users.find((u) => u.id === node.taskPeer!.peerUserId)?.name;
        mine.push(`关联副本（执行方：${nm ?? "对方"}，进度由其同步）`);
      }
      return mine;
    }
    const list: string[] = [];
    for (const a of assignments) {
      if (a.resultNodeId === node.id && a.assignerId === currentUserId) {
        list.push("派任务可见（你派给了下级）");
        break;
      }
    }
    for (const s of shares) {
      if (
        !s.revokedAt &&
        s.audienceId === currentUserId &&
        s.nodeId === node.id
      ) {
        list.push("下级主动分享");
        break;
      }
    }
    for (const f of follows) {
      if (f.granteeId === currentUserId && f.state === "granted") {
        list.push("通过关注获得可见");
        break;
      }
    }
    if (node.taskPeer?.iAmExecutor) {
      list.push("关联任务：上级导图中有对应副本，可控制是否同步进度");
    } else if (node.taskPeer && !node.taskPeer.iAmExecutor) {
      const nm = users.find((u) => u.id === node.taskPeer!.peerUserId)?.name;
      list.push(`关联副本（执行方：${nm ?? "对方"}，进度由其同步）`);
    }
    if (list.length === 0 && readable) list.push("中间层透传");
    if (list.length === 0) list.push("不可见（演示状态保护）");
    return list;
  })();

  const taskFieldsAvailable = !!node && !isSkeleton;

  const asideClass =
    variant === "modal"
      ? "absolute right-0 top-0 bottom-0 w-full max-w-[460px] bg-white shadow-xl flex flex-col pointer-events-auto min-h-0"
      : "w-[380px] shrink-0 bg-white border-l border-border flex flex-col h-full min-h-0 max-h-full overflow-hidden";

  const inner = (
    <aside
      data-canvas-overlay="1"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      className={asideClass}
    >
      {/* Tabs 顶栏（可横向滚动，避免小屏顶出布局） */}
      <div className="border-b border-border flex items-center bg-slate-50/60 shrink-0 overflow-x-auto">
        <TabButton
          active={tab === "details"}
          icon={<Info className="h-3.5 w-3.5" />}
          label="任务详情"
          onClick={() => onTabChange("details")}
        />
        <TabButton
          active={tab === "markers"}
          icon={<Tags className="h-3.5 w-3.5" />}
          label="标记"
          onClick={() => onTabChange("markers")}
        />
        <TabButton
          active={tab === "style"}
          icon={<Palette className="h-3.5 w-3.5" />}
          label="样式"
          onClick={() => onTabChange("style")}
        />
        {showAssignedOut && (
          <TabButton
            active={tab === "assigned-out"}
            icon={<InboxIcon className="h-3.5 w-3.5" />}
            label="派出"
            onClick={() => onTabChange("assigned-out")}
            badge={assignedOutBadgeCount}
          />
        )}
        <div className="flex-1" />
        <button
          className="p-2 mr-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100"
          onClick={onClose}
          title="关闭面板"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* "派出"tab：独立列表，不依赖选中节点 */}
      {tab === "assigned-out" && (
        <AssignedOutList
          items={myAssignedOut}
          currentUserId={currentUserId!}
          onSelectNode={(id) => {
            onSelectNode?.(id);
            onTabChange("details");
          }}
        />
      )}

      {/* 详情/标记 共用：当前选中节点的概览 */}
      {tab !== "assigned-out" &&
        (node ? (
          <NodeSummary
            node={node}
            writable={writable}
            ownerName={
              !isMyNode
                ? users.find((u) => u.id === ownerOfNode(node, mindmaps))?.name
                : undefined
            }
          />
        ) : (
          <div className="px-4 py-8 text-center text-sm text-slate-500 flex-1 min-h-0 overflow-y-auto">
            <MousePointerClick className="h-8 w-8 mx-auto mb-2 text-slate-300" />
            <div className="font-medium text-slate-600 mb-1">请先选中一个任务</div>
            <div className="text-xs">
              在画布上点击任意节点，右侧可查看
              {tab === "markers"
                ? "标记"
                : tab === "style"
                  ? "样式"
                  : "详情"}
            </div>
          </div>
        ))}

      {/* tab 内容 */}
      {node && tab === "style" && (
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <NodeFormatPanel
            node={node}
            mindmapStructure={mindmapStructure}
            writable={writable}
            onPatch={patchTopicFormat}
            onClearFormat={() => updateNode({ topicFormat: undefined })}
          />
        </div>
      )}

      {node && tab === "details" && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {node.taskPeer && (
            <div className="px-4 py-3 border-b border-border bg-slate-50/90 text-xs text-slate-600 space-y-2">
              {node.taskPeer.iAmExecutor ? (
                <>
                  <div className="font-semibold text-slate-800">关联任务</div>
                  <p>
                    你在自己的导图维护<strong>主任务</strong>；系统在上级导图里放了一份副本，便于对方用
                    @ 追问。标题、描述、笔记等仍可各自编辑。
                  </p>
                  <label className="flex items-start gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="mt-0.5 rounded border-slate-300"
                      checked={node.taskPeer.syncProgressToPeer !== false}
                      disabled={!canEditTask}
                      onChange={(e) =>
                        updateNode({
                          taskPeer: {
                            ...node.taskPeer!,
                            syncProgressToPeer: e.target.checked,
                          },
                        })
                      }
                    />
                    <span>
                      将<strong>进度、状态、截止日期</strong>同步到上级的关联副本；日志可在下方选择是否同步本条。
                    </span>
                  </label>
                </>
              ) : (
                <>
                  <div className="font-semibold text-slate-800">关联副本</div>
                  <p>
                    这是自动生成的副本，便于你在自己导图里 @
                    {users.find((u) => u.id === node.taskPeer!.peerUserId)
                      ?.name ?? "对方"}
                    追问。进度以对方主任务为准；你可单独改标题/笔记做备忘。
                  </p>
                </>
              )}
            </div>
          )}
          {/* 描述 */}
          {(canEditTitle || node.description) && (
            <div className="px-4 py-3 border-b border-border">
              <Label className="text-xs text-muted-foreground mb-1 block">
                描述
                <span className="ml-1 text-[10px] text-purple-600">
                  · 输入 @ 可以提及他人
                </span>
              </Label>
              {canEditTitle ? (
                <MentionTextarea
                  placeholder="补充任务背景、验收标准等... 输入 @ 提到团队成员（默认作为讨论邀请）"
                  value={node.description ?? ""}
                  onChange={(v) => updateNode({ description: v })}
                  onBlur={() =>
                    pushMentions("discuss", node.description ?? "")
                  }
                  rows={3}
                />
              ) : (
                <p className="text-sm text-slate-600 whitespace-pre-wrap">
                  <MentionText
                    text={node.description ?? ""}
                    users={users}
                  />
                </p>
              )}
            </div>
          )}

          {/* 笔记（XMind 长文本） */}
          {(canEditTitle || node.notes) && (
            <div className="px-4 py-3 border-b border-border">
              <Label className="text-xs text-muted-foreground mb-1 block">
                笔记
              </Label>
              {canEditTitle ? (
                <MentionTextarea
                  placeholder="为这个主题写一段笔记（XMind 风格）..."
                  value={node.notes ?? ""}
                  onChange={(v) => updateNode({ notes: v })}
                  onBlur={() => pushMentions("discuss", node.notes ?? "")}
                  rows={4}
                />
              ) : (
                <div className="text-sm text-amber-700 whitespace-pre-wrap bg-amber-50 px-2 py-1.5 rounded">
                  <MentionText
                    text={node.notes ?? ""}
                    users={users}
                    tone="amber"
                  />
                </div>
              )}
            </div>
          )}

          {/* 标签 chips（XMind labels） */}
          {(canEditTitle || (node.labels?.length ?? 0) > 0) && (
            <div className="px-4 py-3 border-b border-border">
              <Label className="text-xs text-muted-foreground mb-1.5 block">
                标签
              </Label>
              <div className="flex flex-wrap items-center gap-1.5">
                {(node.labels ?? []).map((lb) => (
                  <span
                    key={lb}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-purple-50 text-purple-700 border border-purple-200"
                  >
                    {lb}
                    {canEditTitle && (
                      <button
                        className="text-purple-500 hover:text-purple-800"
                        onClick={() =>
                          updateNode({
                            labels: (node.labels ?? []).filter(
                              (x) => x !== lb,
                            ),
                          })
                        }
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
                {canEditTitle && (
                  <Input
                    className="h-7 w-32 text-xs"
                    placeholder="+ 添加标签 ↵"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const v = e.currentTarget.value.trim();
                        if (v && !(node.labels ?? []).includes(v)) {
                          updateNode({ labels: [...(node.labels ?? []), v] });
                        }
                        e.currentTarget.value = "";
                      }
                    }}
                  />
                )}
              </div>
            </div>
          )}

          {/* 超链接 */}
          {(canEditTitle || node.hyperlink) && (
            <div className="px-4 py-3 border-b border-border">
              <Label className="text-xs text-muted-foreground mb-1 block">
                超链接
              </Label>
              {canEditTitle ? (
                <Input
                  placeholder="https://"
                  value={node.hyperlink ?? ""}
                  onChange={(e) => updateNode({ hyperlink: e.target.value })}
                />
              ) : (
                <a
                  href={node.hyperlink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-sky-600 hover:underline break-all"
                >
                  {node.hyperlink}
                </a>
              )}
            </div>
          )}

          {/* 当前已添加的标记（只读快照） */}
          {!isSkeleton && (node.markers?.length ?? 0) > 0 && (
            <div className="px-4 py-3 border-b border-border">
              <Label className="text-xs text-muted-foreground mb-1.5 block">
                <Tags className="inline h-3 w-3 mr-1" />
                标记
              </Label>
              <div className="flex flex-wrap items-center gap-1.5">
                {(node.markers ?? []).map((mid) => {
                  const def = getMarker(mid);
                  return (
                    <span
                      key={mid}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-50 text-[11px] text-slate-600"
                      title={def?.label ?? mid}
                    >
                      <MarkerIcon id={mid} size={14} />
                      <span>{def?.label ?? mid}</span>
                    </span>
                  );
                })}
              </div>
              <button
                className="mt-1.5 text-[11px] text-brand-orange hover:underline"
                onClick={() => onTabChange("markers")}
              >
                打开标记面板编辑 →
              </button>
            </div>
          )}

          {/* 任务字段 */}
          {taskFieldsAvailable && (
            <div className="px-4 py-3 border-b border-border space-y-3">
              {!node.task ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canEditTask}
                  onClick={() => updateTask({})}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  标记为任务
                </Button>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">
                        状态
                      </Label>
                      <Select
                        value={node.task.status}
                        onValueChange={(v) => setStatus(v as TaskStatus)}
                        disabled={!canEditTask}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">
                        优先级
                      </Label>
                      <Select
                        value={node.task.priority}
                        onValueChange={(v) =>
                          updateTask({ priority: v as Priority })
                        }
                        disabled={!canEditTask}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PRIORITY_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <Label className="text-xs text-muted-foreground">
                        进度
                      </Label>
                      <span className="text-sm font-semibold text-brand-ink tabular-nums">
                        {node.task.progressPct}%
                      </span>
                    </div>
                    <Slider
                      value={[node.task.progressPct]}
                      min={0}
                      max={100}
                      step={5}
                      onValueChange={(v) => setProgress(v[0]!)}
                      disabled={!canEditTask}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">
                        <CalendarDays className="inline h-3 w-3 mr-1" />
                        截止日期
                      </Label>
                      <Input
                        type="date"
                        value={node.task.deadline?.split("T")[0] ?? ""}
                        onChange={(e) =>
                          updateTask({ deadline: e.target.value || undefined })
                        }
                        disabled={!canEditTask}
                        className="h-9"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">
                        <UserIcon className="inline h-3 w-3 mr-1" />
                        负责人
                      </Label>
                      <div className="flex items-center gap-1.5 h-9 px-2 rounded-md bg-slate-50 text-sm">
                        <Avatar size="sm">{owner?.avatar}</Avatar>
                        <span className="truncate">{owner?.name}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 日历同步（XMind→Mac/钉钉/Google 日历） */}
          {node.task && (
            <CalendarSyncSection
              nodeId={node.id}
              nodeTitle={node.title}
              nodeStatus={node.task.status}
            />
          )}

          {/* 该节点上的所有 @ 提及（XMind 风格 · "讨论") */}
          {!isSkeleton && (
            <NodeMentionsSection nodeId={node.id} />
          )}

          {/* 日志时间轴 */}
          <div className="px-4 py-3 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              日志时间轴
            </div>
            {nodeLogs.length === 0 ? (
              <div className="text-xs text-slate-400 py-2">暂无更新记录</div>
            ) : (
              <div className="space-y-2 relative pl-4 before:absolute before:left-1 before:top-1.5 before:bottom-2 before:w-px before:bg-slate-200">
                {nodeLogs.map((log) => {
                  const author = users.find((u) => u.id === log.authorId);
                  return (
                    <div key={log.id} className="relative">
                      <div className="absolute -left-[15px] top-1.5 h-2 w-2 rounded-full bg-brand-orange ring-2 ring-white" />
                      <div className="flex items-center gap-2 mb-0.5">
                        <Avatar size="sm" className="h-5 w-5 text-[10px]">
                          {author?.avatar}
                        </Avatar>
                        <span className="text-xs font-medium text-brand-ink">
                          {author?.name}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {formatTime(log.createdAt)}
                        </span>
                      </div>
                      <div
                        className={cn(
                          "text-xs px-2 py-1.5 rounded-md",
                          log.logType === "comment"
                            ? "bg-slate-50 text-slate-700"
                            : log.logType === "status_change"
                              ? "bg-blue-50 text-blue-700"
                              : log.logType === "progress_change"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-orange-50 text-orange-700",
                        )}
                      >
                        <MentionText
                          text={log.contentText}
                          users={users}
                          tone={
                            log.logType === "comment" ? "purple" : "blue"
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {node && tab === "markers" && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {writable && !isSkeleton ? (
            <MarkerPicker
              value={node.markers ?? []}
              onChange={setMarkers}
              variant="panel"
            />
          ) : (
            <div className="px-4 py-6 text-xs text-slate-500">
              {isSkeleton
                ? "骨架节点（年/季/月）不需要打标记。请选择一条具体的任务。"
                : "你对此节点没有写权限，无法编辑标记。"}
            </div>
          )}
        </div>
      )}

      {/* 添加日志（详情页底部） */}
      {node && tab === "details" && canEditTask && node.task && (
        <div className="border-t border-border p-3 shrink-0">
          <MentionTextarea
            value={logDraft}
            onChange={setLogDraft}
            placeholder="记一笔进展... 输入 @ 提及他人 · (Cmd/Ctrl+Enter 提交)"
            rows={2}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                submitLog();
              }
            }}
          />
          {node.taskPeer?.iAmExecutor && (
            <label className="mt-2 flex items-start gap-2 text-[11px] text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                className="mt-0.5 rounded border-slate-300"
                checked={syncLogToPeer}
                disabled={node.taskPeer.syncProgressToPeer === false}
                onChange={(e) => setSyncLogToPeer(e.target.checked)}
              />
              <span>
                本条日志同步到上级的关联副本
                {node.taskPeer.syncProgressToPeer === false && (
                  <span className="text-slate-400">（已关闭进度同步）</span>
                )}
              </span>
            </label>
          )}
          <div className="flex justify-end mt-2">
            <Button size="sm" onClick={submitLog} disabled={!logDraft.trim()}>
              添加日志
            </Button>
          </div>
        </div>
      )}

      {/* 底部操作 */}
      {node && tab === "details" && (
        <div className="border-t border-border px-4 py-2 flex flex-wrap gap-1.5 shrink-0">
          {writable && !isSkeleton && (
            <>
              {onShare && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onShare(node.id)}
                >
                  <Share2 className="h-3.5 w-3.5" />
                  分享给上级
                </Button>
              )}
              {onRequestFollow && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRequestFollow(node.id)}
                >
                  <Eye className="h-3.5 w-3.5" />
                  申请关注
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 ml-auto"
                  onClick={() => onDelete(node.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  删除
                </Button>
              )}
            </>
          )}
          {!writable && isSkeleton && onAssign && (
            <Button size="sm" onClick={() => onAssign(node.id)}>
              <Send className="h-3.5 w-3.5" />
              派任务到这里
            </Button>
          )}
          {!writable && (
            <div className="text-[11px] text-slate-400 ml-auto self-center">
              {visibilityHints.join(" · ")}
            </div>
          )}
        </div>
      )}
    </aside>
  );

  if (variant === "modal") {
    return (
      <div className="fixed inset-0 z-40 pointer-events-none">
        <div
          className="absolute inset-0 bg-black/20 pointer-events-auto"
          onClick={onClose}
        />
        {inner}
      </div>
    );
  }

  return inner;
}

function TabButton({
  active,
  icon,
  label,
  onClick,
  badge,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-4 py-2.5 text-xs font-medium flex items-center gap-1.5 border-b-2 -mb-px transition-colors",
        active
          ? "border-brand-orange text-brand-ink bg-white"
          : "border-transparent text-slate-500 hover:text-slate-700",
      )}
    >
      {icon}
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] leading-none">
          {badge}
        </span>
      )}
    </button>
  );
}

function NodeSummary({
  node,
  writable,
  ownerName,
}: {
  node: Node;
  writable: boolean;
  ownerName?: string;
}) {
  const { setNodes } = useStore();
  const isSkeleton = node.nodeType === "skeleton";
  const canEditTitle = writable && !isSkeleton;

  const updateTitle = (title: string) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === node.id
          ? { ...n, title, updatedAt: new Date().toISOString() }
          : n,
      ),
    );
  };

  return (
    <div className="border-b border-border p-4 shrink-0">
      <div className="flex items-center gap-2 mb-1">
        {isSkeleton ? (
          <Badge variant="secondary" className="text-[10px]">
            {node.timeBucketKind === "year"
              ? "年度"
              : node.timeBucketKind === "quarter"
                ? "季度"
                : node.timeBucketKind === "month"
                  ? "月份"
                  : "周"}
          </Badge>
        ) : node.task ? (
          <Badge variant="secondary" className="text-[10px]">
            任务
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px]">
            主题
          </Badge>
        )}
        {!writable && (
          <Badge variant="outline" className="text-[10px]">
            只读
          </Badge>
        )}
        {ownerName && (
          <Badge
            variant="outline"
            className="text-[10px] bg-orange-50 text-orange-700 border-orange-200"
          >
            <UserIcon className="h-2.5 w-2.5 mr-0.5" />
            归属：{ownerName}
          </Badge>
        )}
      </div>
      {canEditTitle ? (
        <Input
          value={node.title}
          onChange={(e) => updateTitle(e.target.value)}
          className="text-base font-semibold border-0 px-0 focus-visible:ring-0 shadow-none h-auto"
        />
      ) : (
        <h2 className="text-base font-semibold text-brand-ink">{node.title}</h2>
      )}
    </div>
  );
}

function labelOf(s: TaskStatus): string {
  return STATUS_COLOR[s].label;
}

interface AssignedOutItem {
  assignment: Assignment;
  result: Node | null;
  skeleton: Node | undefined;
  assignee: User | undefined;
  lastLog: TaskLog | undefined;
}

function AssignedOutList({
  items,
  currentUserId,
  onSelectNode,
}: {
  items: AssignedOutItem[];
  currentUserId: string;
  onSelectNode: (id: NodeId) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-slate-500 flex-1 min-h-0 overflow-y-auto">
        <Send className="h-8 w-8 mx-auto mb-2 text-slate-300" />
        <div className="font-medium text-slate-600 mb-1">还没有派出去的任务</div>
        <div className="text-xs">
          点顶部「派任务」把目标拆解给下属，他们的进度会同步显示在这里。
        </div>
      </div>
    );
  }

  // 分组：待处理 / 进行中 / 已完成
  const pending = items.filter((x) => x.assignment.state === "pending");
  const negotiating = items.filter(
    (x) => x.assignment.state === "negotiating",
  );
  const accepted = items.filter((x) => x.assignment.state === "accepted");
  const finished = items.filter(
    (x) => x.result?.task?.status === "done",
  );
  const acceptedActive = accepted.filter(
    (x) => x.result?.task?.status !== "done",
  );
  const others = items.filter(
    (x) =>
      x.assignment.state !== "pending" &&
      x.assignment.state !== "negotiating" &&
      x.assignment.state !== "accepted",
  );

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      {pending.length > 0 && (
        <Section title="待对方接受" tone="orange" count={pending.length}>
          {pending.map((it) => (
            <AssignedRow
              key={it.assignment.id}
              it={it}
              currentUserId={currentUserId}
              onSelectNode={onSelectNode}
            />
          ))}
        </Section>
      )}
      {negotiating.length > 0 && (
        <Section title="对方申请调整" tone="amber" count={negotiating.length}>
          {negotiating.map((it) => (
            <AssignedRow
              key={it.assignment.id}
              it={it}
              currentUserId={currentUserId}
              onSelectNode={onSelectNode}
            />
          ))}
        </Section>
      )}
      {acceptedActive.length > 0 && (
        <Section
          title="进行中"
          tone="blue"
          count={acceptedActive.length}
        >
          {acceptedActive.map((it) => (
            <AssignedRow
              key={it.assignment.id}
              it={it}
              currentUserId={currentUserId}
              onSelectNode={onSelectNode}
            />
          ))}
        </Section>
      )}
      {finished.length > 0 && (
        <Section title="已完成" tone="emerald" count={finished.length}>
          {finished.map((it) => (
            <AssignedRow
              key={it.assignment.id}
              it={it}
              currentUserId={currentUserId}
              onSelectNode={onSelectNode}
            />
          ))}
        </Section>
      )}
      {others.length > 0 && (
        <Section title="其他" tone="slate" count={others.length}>
          {others.map((it) => (
            <AssignedRow
              key={it.assignment.id}
              it={it}
              currentUserId={currentUserId}
              onSelectNode={onSelectNode}
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  tone,
  count,
  children,
}: {
  title: string;
  tone: "orange" | "amber" | "blue" | "emerald" | "slate";
  count: number;
  children: React.ReactNode;
}) {
  const dotCls: Record<typeof tone, string> = {
    orange: "bg-orange-500",
    amber: "bg-amber-500",
    blue: "bg-blue-500",
    emerald: "bg-emerald-500",
    slate: "bg-slate-400",
  };
  return (
    <div>
      <div className="px-4 pt-3 pb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 sticky top-0 bg-white/95 backdrop-blur z-10 border-b border-border/40">
        <span className={cn("w-1.5 h-1.5 rounded-full", dotCls[tone])} />
        {title}
        <span className="text-slate-400 normal-case font-normal">· {count}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}

function AssignedRow({
  it,
  currentUserId,
  onSelectNode,
}: {
  it: AssignedOutItem;
  currentUserId: string;
  onSelectNode: (id: NodeId) => void;
}) {
  const { assignment, result, skeleton, assignee, lastLog } = it;
  const task = result?.task;
  const status = task?.status;
  const statusStyle = status ? STATUS_COLOR[status] : null;
  const progress = task?.progressPct ?? 0;
  const title = result?.title ?? assignment.proposedTitle;
  const bucket = skeleton?.title ?? "—";
  const stateBadge = (() => {
    switch (assignment.state) {
      case "pending":
        return { label: "待接受", cls: "bg-orange-100 text-orange-800" };
      case "negotiating":
        return { label: "调整中", cls: "bg-amber-100 text-amber-800" };
      case "accepted":
        return null;
      case "adjusted":
        return { label: "已调整", cls: "bg-blue-100 text-blue-800" };
      case "rejected_by_system":
        return { label: "系统拒绝", cls: "bg-rose-100 text-rose-700" };
      default:
        return null;
    }
  })();

  const openNodeId =
    assignment.assignerMirrorNodeId &&
    currentUserId === assignment.assignerId
      ? assignment.assignerMirrorNodeId
      : result?.id;
  const clickable = !!openNodeId;

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => openNodeId && onSelectNode(openNodeId)}
      className={cn(
        "w-full text-left px-4 py-3 border-b border-border/60 transition-colors",
        clickable
          ? "hover:bg-slate-50 cursor-pointer"
          : "cursor-default opacity-90",
      )}
      title={clickable ? "点击查看任务详情" : "对方尚未接受，无任务节点"}
    >
      <div className="flex items-center gap-2 mb-1">
        <Avatar size="sm" className="h-5 w-5 text-[10px]">
          {assignee?.avatar ?? "?"}
        </Avatar>
        <span className="text-xs font-medium text-brand-ink truncate">
          {assignee?.name ?? "未知"}
        </span>
        <span className="text-[10px] text-slate-400">→</span>
        <span className="text-[10px] text-slate-500 truncate">{bucket}</span>
        <div className="flex-1" />
        {statusStyle && (
          <span
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded",
              statusStyle.chip,
              statusStyle.chipText,
            )}
          >
            {statusStyle.label}
          </span>
        )}
        {stateBadge && (
          <span className={cn("text-[10px] px-1.5 py-0.5 rounded", stateBadge.cls)}>
            {stateBadge.label}
          </span>
        )}
      </div>
      <div className="text-sm font-semibold text-brand-ink truncate mb-1.5">
        {title}
      </div>
      {task && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-slate-100 rounded overflow-hidden">
            <div
              className={cn(
                "h-full rounded transition-all",
                progress >= 100
                  ? "bg-emerald-500"
                  : progress >= 50
                    ? "bg-blue-500"
                    : "bg-orange-400",
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[11px] text-slate-500 tabular-nums w-10 text-right">
            {progress}%
          </span>
        </div>
      )}
      {lastLog ? (
        <div className="mt-1.5 text-[11px] text-slate-500 truncate">
          <Clock className="inline h-3 w-3 mr-0.5 -mt-0.5" />
          {formatTime(lastLog.createdAt)} · {lastLog.contentText}
        </div>
      ) : (
        <div className="mt-1.5 text-[11px] text-slate-400">
          暂无更新记录
        </div>
      )}
    </button>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (sameDay) return `今天 ${hh}:${mm}`;
  const M = d.getMonth() + 1;
  const D = d.getDate();
  return `${M}/${D} ${hh}:${mm}`;
}

// ----- 日历同步 -----

function CalendarSyncSection({
  nodeId,
  nodeStatus,
}: {
  nodeId: NodeId;
  nodeTitle: string;
  nodeStatus: TaskStatus;
}) {
  const {
    nodes,
    setNodes,
    users,
    mindmaps,
    calendarSyncs,
    setCalendarSyncs,
    setNotifications,
    setLogs,
    currentUser,
  } = useStore();

  const node = nodes.find((n) => n.id === nodeId);
  const owner = node ? users.find((u) => u.id === ownerOfNode(node, mindmaps)) : null;
  const ownerProviders: CalendarProvider[] = owner?.connectedCalendars ?? [];
  const isOwner = owner?.id === currentUser?.id;

  const syncsForNode = useMemo(
    () => calendarSyncs.filter((cs) => cs.nodeId === nodeId),
    [calendarSyncs, nodeId],
  );

  const map = new Map<CalendarProvider, (typeof syncsForNode)[number]>();
  for (const cs of syncsForNode) map.set(cs.provider, cs);

  const handleResync = () => {
    if (!node || !owner) return;
    const nowISO = new Date().toISOString();
    const { next, added, updated } = reconcileNodeCalendarSyncs({
      node,
      owner,
      prev: calendarSyncs,
      nowISO,
    });
    if (added.length === 0 && updated.length === 0) return;
    setCalendarSyncs(next);
    if (added.length > 0) {
      const notif = buildCalendarSyncedNotification({
        node,
        owner,
        added,
        updated,
        nowISO,
      });
      if (notif) setNotifications((prev) => [notif, ...prev]);
    }

    if (
      owner.connectedCalendars?.includes("dingtalk") &&
      useRemoteWorkspaceApi() &&
      isOwner
    ) {
      const token = getApiToken();
      if (token) {
        void (async () => {
          try {
            const r = await pushDingTalkCalendarApi(token, {
              nodeId: node.id,
              summary: node.title,
              description: node.description ?? "",
              deadline: node.task?.deadline ?? null,
              ownerAppUserId: owner.id,
            });
            const syncAt = new Date().toISOString();
            setCalendarSyncs((prev) =>
              prev.map((cs) =>
                cs.nodeId === node.id && cs.provider === "dingtalk"
                  ? {
                      ...cs,
                      externalEventId: r.externalEventId,
                      syncedTitle: node.title,
                      syncedDeadline: node.task?.deadline,
                      syncedStatus: node.task?.status,
                      status: "synced",
                      syncedAt: syncAt,
                      lastError: undefined,
                    }
                  : cs,
              ),
            );
          } catch (e) {
            console.error(e);
            const syncAt = new Date().toISOString();
            const msg = e instanceof Error ? e.message : String(e);
            setCalendarSyncs((prev) =>
              prev.map((cs) =>
                cs.nodeId === node.id && cs.provider === "dingtalk"
                  ? {
                      ...cs,
                      status: "failed",
                      lastError: msg,
                      syncedAt: syncAt,
                    }
                  : cs,
              ),
            );
          }
        })();
      }
    }
  };

  const handleExternalComplete = (syncId: string) => {
    if (!node || !owner) return;
    const nowISO = new Date().toISOString();
    const result = simulateCalendarCompletion({
      syncId,
      prev: calendarSyncs,
      node,
      owner,
      nowISO,
    });
    setCalendarSyncs(result.next);
    if (result.notification)
      setNotifications((prev) => [result.notification!, ...prev]);
    if (result.shouldMarkTaskDone && node.task) {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === node.id
            ? {
                ...n,
                task: n.task
                  ? {
                      ...n.task,
                      status: "done",
                      progressPct: 100,
                      closedAt: nowISO,
                    }
                  : n.task,
                updatedAt: nowISO,
              }
            : n,
        ),
      );
      setLogs((prev) => [
        {
          id: newId("log"),
          nodeId: node.id,
          authorId: owner.id,
          logType: "status_change",
          contentText: `日历回写：在外部日历中勾选完成 → 状态置为已完成`,
          contentMeta: { source: "calendar" },
          createdAt: nowISO,
        },
        ...prev,
      ]);
    }
  };

  if (ownerProviders.length === 0 && syncsForNode.length === 0) {
    return (
      <div className="px-4 py-3 border-b border-border">
        <Label className="text-xs text-muted-foreground mb-1 block">
          <CalendarDays className="inline h-3 w-3 mr-1" />
          日历同步
        </Label>
        <div className="text-xs text-slate-500">
          {owner?.name ?? "—"} 还没有连接任何外部日历。
          {isOwner && (
            <span className="text-slate-400">
              {" "}（在「设置」里连接 Mac / 钉钉 / Google 日历）
            </span>
          )}
        </div>
      </div>
    );
  }

  // owner 没有连接对应 provider 时也展示但置灰
  const allProvidersToShow = Array.from(
    new Set([...ownerProviders, ...syncsForNode.map((s) => s.provider)]),
  ) as CalendarProvider[];

  return (
    <div className="px-4 py-3 border-b border-border">
      <div className="flex items-center justify-between mb-1.5">
        <Label className="text-xs text-muted-foreground">
          <CalendarDays className="inline h-3 w-3 mr-1" />
          日历同步
        </Label>
        <button
          className="text-[11px] text-brand-orange hover:underline inline-flex items-center gap-1"
          onClick={handleResync}
          title="重新同步：把当前任务的标题/截止/状态推到所有连接的日历"
        >
          <RefreshCw className="h-3 w-3" />
          重新同步
        </button>
      </div>
      <div className="space-y-1.5">
        {allProvidersToShow.map((p) => {
          const cs = map.get(p);
          const connected = ownerProviders.includes(p);
          return (
            <div
              key={p}
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded border text-xs",
                cs?.externalCompleted
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : connected
                    ? "bg-slate-50 border-slate-200"
                    : "bg-amber-50 border-amber-200 text-amber-800",
              )}
            >
              <span className="text-base leading-none">
                {CALENDAR_EMOJI[p]}
              </span>
              <span className="font-medium">{CALENDAR_LABEL[p]}</span>
              <div className="flex-1" />
              {cs ? (
                <>
                  <span className="text-[10px] text-slate-500">
                    {formatTime(cs.syncedAt)} 已同步
                  </span>
                  {cs.externalCompleted && (
                    <span className="text-[10px] inline-flex items-center gap-0.5 px-1 rounded bg-emerald-200 text-emerald-900">
                      <CheckCircle2 className="h-3 w-3" />
                      外部已完成
                    </span>
                  )}
                </>
              ) : connected ? (
                <span className="text-[10px] text-slate-400">尚未同步</span>
              ) : (
                <span className="text-[10px] text-amber-700">未连接</span>
              )}
            </div>
          );
        })}
      </div>

      {/* 模拟"外部日历勾选完成 → 应用同步" */}
      {nodeStatus !== "done" && syncsForNode.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border">
          <div className="text-[10px] text-slate-500 mb-1">
            模拟外部日历操作（演示双向同步）：
          </div>
          <div className="flex flex-wrap gap-1.5">
            {syncsForNode
              .filter((cs) => !cs.externalCompleted)
              .map((cs) => (
                <button
                  key={cs.id}
                  onClick={() => handleExternalComplete(cs.id)}
                  className="text-[11px] px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 inline-flex items-center gap-1"
                  title={`在 ${CALENDAR_LABEL[cs.provider]} 中勾选完成（演示外部 → 应用回写）`}
                >
                  {CALENDAR_EMOJI[cs.provider]} 在 {CALENDAR_LABEL[cs.provider]}{" "}
                  勾完成
                </button>
              ))}
          </div>
        </div>
      )}

      {/* 实用提示 */}
      <div className="mt-2 text-[10px] text-slate-400">
        改标题 / 截止 / 状态 → 自动同步到 {ALL_CALENDAR_PROVIDERS.length} 家日历
      </div>
    </div>
  );
}

// ----- 节点上的 @ 提及 -----

function NodeMentionsSection({ nodeId }: { nodeId: NodeId }) {
  const { mentions, users } = useStore();
  const list = useMemo(
    () =>
      mentions
        .filter((m) => m.nodeId === nodeId)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() -
            new Date(a.createdAt).getTime(),
        ),
    [mentions, nodeId],
  );
  if (list.length === 0) return null;
  return (
    <div className="px-4 py-3 border-b border-border">
      <Label className="text-xs text-muted-foreground mb-1.5 block">
        <UserIcon className="inline h-3 w-3 mr-1" />
        @ 提及 · {list.length}
      </Label>
      <div className="space-y-1.5">
        {list.slice(0, 5).map((m) => {
          const by = users.find((u) => u.id === m.byUserId);
          return (
            <div
              key={m.id}
              className="flex items-start gap-2 text-xs px-2 py-1.5 rounded bg-purple-50 border border-purple-100"
            >
              <Avatar size="sm" className="h-5 w-5 text-[10px] mt-0.5">
                {by?.avatar}
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 mb-0.5">
                  <span className="text-[11px] font-medium text-brand-ink">
                    {by?.name}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {formatTime(m.createdAt)}
                  </span>
                  {m.dingtalkPushedAt && (
                    <span
                      className="text-[10px] px-1 rounded bg-blue-100 text-blue-700"
                      title="已推送到钉钉"
                    >
                      已推钉
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-700 break-words">
                  <MentionText text={m.text} users={users} />
                </div>
              </div>
            </div>
          );
        })}
        {list.length > 5 && (
          <div className="text-[10px] text-slate-400 text-center">
            ... 还有 {list.length - 5} 条
          </div>
        )}
      </div>
    </div>
  );
}
