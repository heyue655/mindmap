"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Send, Tags, Inbox as InboxIcon, Palette, GitBranch } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useStore } from "@/store/StoreProvider";
import MindMapCanvas from "@/features/mindmap/MindMapCanvas";
import MindMapToolbar, {
  type ViewMode,
} from "@/features/mindmap/MindMapToolbar";
import MindMapOutline from "@/features/mindmap/MindMapOutline";
import MindMapGantt from "@/features/mindmap/MindMapGantt";
import NodeDetailDrawer, {
  type RightDockTab,
} from "@/features/task/NodeDetailDrawer";
import AssignDialog from "@/features/assignment/AssignDialog";
import ShareDialog from "@/features/sharing/ShareDialog";
import RequestFollowDialog from "@/features/sharing/RequestFollowDialog";
import { newId } from "@/lib/id";
import type {
  MindMap,
  MindMapId,
  MindMapStructure,
  MindMapTheme,
  Node,
  NodeId,
  Relationship,
  TaskFields,
} from "@/types";
import type { CommitIntent } from "@/features/mindmap/MindMapNode";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { toast } from "@/store/toast";
import { isManager } from "@/lib/org";
import { uniqueMentionUserIds } from "@/lib/mention";
import { buildMentionsForSubmit } from "@/lib/mentionEffects";
import {
  applyMindmapDrop,
  type DropHint,
} from "@/lib/mindmapDrag";
import { createMindmapFromTemplate, type MindMapTemplateId } from "@/lib/mindmapFactory";
import { mindmapDisplayLabel } from "@/lib/mindmapResolve";
import NewMindMapDialog from "@/features/mindmap/NewMindMapDialog";
import { syncExecutorProgressToPeer } from "@/lib/taskPeer";

export default function MindMapPage() {
  const {
    currentUser,
    currentUserId,
    relations,
    mindmaps,
    setMindmaps,
    nodes,
    setNodes,
    assignments,
    relationships,
    setRelationships,
    users,
    mentions,
    setMentions,
    setNotifications,
    shares,
    setShares,
  } = useStore();
  const [selectedNodeId, setSelectedNodeId] = useState<NodeId | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<NodeId | null>(null);
  const [dockOpen, setDockOpen] = useState(false);
  const [dockTab, setDockTab] = useState<RightDockTab>("details");
  const [assignOpen, setAssignOpen] = useState(false);
  const [shareNodeId, setShareNodeId] = useState<NodeId | null>(null);
  const [followNodeId, setFollowNodeId] = useState<NodeId | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [activeMindmapId, setActiveMindmapId] = useState<MindMapId | null>(
    null,
  );
  const [newMindmapOpen, setNewMindmapOpen] = useState(false);
  // 删除节点确认弹窗状态
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: NodeId; childCount: number; title: string } | null>(null);
  // 联系线创建中：起点节点 id（点击下一个节点完成）
  const [relDraftFromId, setRelDraftFromId] = useState<NodeId | null>(null);

  const searchParams = useSearchParams();
  const router = useRouter();

  const myMindmaps = useMemo(
    () =>
      mindmaps.filter(
        (m) =>
          m.ownerId === currentUser?.id ||
          // 演示用 XMind 空白图：JOJO 名下，所有人都能切换看
          m.id === "mm-xmind-demo",
      ),
    [mindmaps, currentUser],
  );

  // 默认选中当前年份的年度导图；其次任意年度模板；最后选第一张
  // 注：如果当前 activeMindmapId 是别人的图（通知跳转过来时），允许保留，
  // 由 useEffect 在切回 myMindmaps 时再重置。
  useEffect(() => {
    if (!currentUser) return;
    if (
      activeMindmapId &&
      mindmaps.find((m) => m.id === activeMindmapId)
    )
      return;
    const currentYear = new Date().getFullYear();
    const own =
      mindmaps.find(
        (m) => m.ownerId === currentUser.id && m.useAnnualTemplate && m.year === currentYear,
      ) ??
      mindmaps.find(
        (m) => m.ownerId === currentUser.id && m.useAnnualTemplate,
      );
    setActiveMindmapId(own?.id ?? myMindmaps[0]?.id ?? null);
  }, [currentUser, mindmaps, myMindmaps, activeMindmapId]);

  const activeMindmap: MindMap | null = useMemo(
    () => mindmaps.find((m) => m.id === activeMindmapId) ?? null,
    [mindmaps, activeMindmapId],
  );

  const activeNodes = useMemo(
    () =>
      nodes.filter(
        (n) => n.mindmapId === activeMindmap?.id && !n.isDeleted,
      ),
    [nodes, activeMindmap],
  );

  // 当前图的根节点：年度模板图 = year skeleton；其它 = 没有 parent 且不是 floating 的第一个
  const rootNode = useMemo(() => {
    if (!activeMindmap) return null;
    if (activeMindmap.useAnnualTemplate) {
      return (
        activeNodes.find(
          (n) => n.nodeType === "skeleton" && n.timeBucketKind === "year",
        ) ?? null
      );
    }
    return (
      activeNodes.find((n) => !n.parentId && !n.isFloating) ??
      activeNodes[0] ??
      null
    );
  }, [activeMindmap, activeNodes]);

  // 当前图的联系线
  const activeRelationships = useMemo(
    () =>
      relationships.filter((r) => r.mindmapId === activeMindmap?.id),
    [relationships, activeMindmap],
  );

  const openDock = (tab: RightDockTab, nodeIdToSelect?: NodeId) => {
    if (nodeIdToSelect) setSelectedNodeId(nodeIdToSelect);
    setDockTab(tab);
    setDockOpen(true);
  };

  const openShare = (id: NodeId) => {
    const target = nodes.find((n) => n.id === id);
    if (!target || target.nodeType === "skeleton") {
      toast.error("骨架节点（年/季/月）不需要分享。请选择一条具体的任务或子主题。");
      return;
    }
    setShareNodeId(id);
  };

  const openFollow = (id: NodeId) => {
    const target = nodes.find((n) => n.id === id);
    if (!target || target.nodeType === "skeleton") {
      toast.error("骨架节点（年/季/月）不需要单独申请关注。请选择具体的任务节点。");
      return;
    }
    setFollowNodeId(id);
  };

  // 兜底：合并 OrgRelation + User.managerId 两个来源，防止历史数据 OrgRelation 缺失
  const userIsManager = currentUserId
    ? isManager(currentUserId, relations) ||
      users.some((u) => u.managerId === currentUserId)
    : false;

  const myPendingAssignedOut = useMemo(
    () =>
      currentUserId
        ? assignments.filter(
            (a) =>
              a.assignerId === currentUserId &&
              (a.state === "pending" || a.state === "negotiating"),
          ).length
        : 0,
    [assignments, currentUserId],
  );

  const myTotalAssignedOut = useMemo(
    () =>
      currentUserId
        ? assignments.filter((a) => a.assignerId === currentUserId).length
        : 0,
    [assignments, currentUserId],
  );

  // Esc 取消"创建联系线"模式
  useEffect(() => {
    if (!relDraftFromId) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRelDraftFromId(null);
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [relDraftFromId]);

  // 通知中心点击跳转过来：?node=<id>&tab=details|markers → 自动选中节点 + 打开右侧 dock
  useEffect(() => {
    if (!searchParams) return;
    const nodeIdFromUrl = searchParams.get("node");
    const tabFromUrl = searchParams.get("tab") as RightDockTab | null;
    if (!nodeIdFromUrl) return;
    const target = nodes.find((n) => n.id === nodeIdFromUrl && !n.isDeleted);
    if (!target) return;
    // 如果节点不在当前 mindmap，切到那张
    if (target.mindmapId !== activeMindmapId) {
      const targetMap = mindmaps.find((m) => m.id === target.mindmapId);
      if (targetMap) setActiveMindmapId(targetMap.id);
    }
    setSelectedNodeId(target.id);
    setDockTab(tabFromUrl ?? "details");
    setDockOpen(true);
    // 用完即清，刷新页面不重复选
    const next = new URLSearchParams(searchParams!.toString());
    next.delete("node");
    next.delete("tab");
    router.replace(`/mindmap?${next.toString()}`);
  }, [searchParams, nodes, mindmaps, activeMindmapId, router]);

  const handleCreateMindmap = (templateId: MindMapTemplateId, title: string) => {
    if (!currentUserId) return;
    const { mindmap, nodes: created } = createMindmapFromTemplate({
      templateId,
      title,
      ownerId: currentUserId,
    });
    setMindmaps((prev) => [...prev, mindmap]);
    setNodes((prev) => [...prev, ...created]);
    setActiveMindmapId(mindmap.id);
    setSelectedNodeId(null);
    setEditingNodeId(null);
    setRelDraftFromId(null);
    setDockOpen(false);
    setNewMindmapOpen(false);
  };

  if (!currentUser) return null;

  // 没有导图时展示新建引导界面
  if (!activeMindmap) {
    return (
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <PageHeader title="我的导图" description="暂无导图，新建一个开始吧" />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-500">
          <GitBranch className="w-12 h-12 text-slate-300" />
          <p className="text-sm">还没有导图</p>
          <Button onClick={() => setNewMindmapOpen(true)}>+ 新建导图</Button>
        </div>
        <NewMindMapDialog
          open={newMindmapOpen}
          onOpenChange={setNewMindmapOpen}
          onCreate={handleCreateMindmap}
        />
      </div>
    );
  }

  if (!rootNode) return null;

  const taskNodes = activeNodes.filter((n) => n.task);
  const stats = {
    total: taskNodes.length,
    inProgress: taskNodes.filter((n) => n.task!.status === "in_progress")
      .length,
    blocked: taskNodes.filter((n) => n.task!.status === "blocked").length,
    done: taskNodes.filter((n) => n.task!.status === "done").length,
  };

  const createChildOf = (
    parentId: NodeId,
    title = "",
    extra: Partial<Node> = {},
  ): NodeId => {
    const parent = nodes.find((n) => n.id === parentId);
    if (!parent) return parentId;
    const siblings = nodes.filter(
      (n) => n.parentId === parent.id && !n.isDeleted,
    );
    const nowISO = new Date().toISOString();
    const id = newId("n");
    const newNode: Node = {
      id,
      mindmapId: parent.mindmapId,
      parentId: parent.id,
      sortOrder: siblings.length,
      title,
      nodeType: "normal",
      createdBy: currentUser.id,
      createdAt: nowISO,
      updatedAt: nowISO,
      isDeleted: false,
      ...extra,
    };
    setNodes((prev) => [...prev, newNode]);
    return id;
  };

  const createSiblingOf = (siblingId: NodeId, title = ""): NodeId | null => {
    const sib = nodes.find((n) => n.id === siblingId);
    if (!sib || !sib.parentId) return null;
    return createChildOf(sib.parentId, title);
  };

  const handleAddChild = (parentId: NodeId) => {
    const id = createChildOf(parentId);
    setSelectedNodeId(id);
    setEditingNodeId(id);
  };

  const handleAddSibling = (siblingId: NodeId) => {
    const id = createSiblingOf(siblingId);
    if (!id) return;
    setSelectedNodeId(id);
    setEditingNodeId(id);
  };

  const handleStartEdit = (id: NodeId) => {
    setSelectedNodeId(id);
    setEditingNodeId(id);
  };

  const handleCommitEdit = (
    id: NodeId,
    rawValue: string,
    intent: CommitIntent,
  ) => {
    const value = rawValue.trim();
    const node = nodes.find((n) => n.id === id);
    if (!node) {
      setEditingNodeId(null);
      return;
    }
    const wasEmpty = !node.title;
    if (!value) {
      if (wasEmpty) {
        deleteNodeRaw(id);
        setEditingNodeId(null);
        setSelectedNodeId(null);
        return;
      }
    } else if (value !== node.title) {
      const nowISO = new Date().toISOString();
      setNodes((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, title: value, updatedAt: nowISO } : n,
        ),
      );
      // 标题里 @ 了别人 = 派任务给他（同时自动给对方一份分享，让 ta 在团队视图能读到）
      const ids = uniqueMentionUserIds(value, users);
      if (ids.length > 0) {
        const { mentionEvents, notifications, newShares } = buildMentionsForSubmit({
          node: { ...node, title: value },
          byUser: currentUser,
          kind: "assign",
          text: value,
          users,
          prevMentions: mentions,
          prevShares: shares,
          mentionedUserIds: ids,
          nowISO,
        });
        if (mentionEvents.length > 0)
          setMentions((prev) => [...mentionEvents, ...prev]);
        if (notifications.length > 0)
          setNotifications((prev) => [...notifications, ...prev]);
        if (newShares.length > 0) setShares((prev) => [...prev, ...newShares]);
      }
    }
    setEditingNodeId(null);

    if (intent === "child") {
      handleAddChild(id);
    } else if (intent === "sibling") {
      const target = nodes.find((n) => n.id === id);
      if (!target || !target.parentId) handleAddChild(id);
      else handleAddSibling(id);
    }
  };

  const handleCancelEdit = () => {
    if (editingNodeId) {
      const node = nodes.find((n) => n.id === editingNodeId);
      if (node && !node.title) {
        deleteNodeRaw(editingNodeId);
        setSelectedNodeId(null);
      }
    }
    setEditingNodeId(null);
  };

  const deleteNodeRaw = (id: NodeId) => {
    const toDelete = new Set<NodeId>([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of nodes) {
        if (n.parentId && toDelete.has(n.parentId) && !toDelete.has(n.id)) {
          toDelete.add(n.id);
          changed = true;
        }
      }
    }
    const nowISO = new Date().toISOString();
    setNodes((prev) =>
      prev.map((n) =>
        toDelete.has(n.id) ? { ...n, isDeleted: true, deletedAt: nowISO } : n,
      ),
    );
    // 同步删掉以这些节点为端点的联系线
    setRelationships((prev) =>
      prev.filter((r) => !toDelete.has(r.fromId) && !toDelete.has(r.toId)),
    );
  };

  const handleMoveNode = (
    draggedId: NodeId,
    targetId: NodeId,
    hint: DropHint,
  ) => {
    if (draggedId === targetId) return;
    const nowISO = new Date().toISOString();
    setNodes((prev) =>
      applyMindmapDrop({
        nodes: prev,
        draggedId,
        targetId,
        hint,
        nowISO,
      }),
    );
  };

  const handleDelete = (id: NodeId) => {
    const node = nodes.find((n) => n.id === id);
    if (!node || node.nodeType === "skeleton") return;
    const childCount = nodes.filter(
      (n) => n.parentId === id && !n.isDeleted,
    ).length;
    // 无论是否有子节点，都走确认框（叶子节点也需要二次确认，防止误操作）
    setDeleteConfirm({ id, childCount, title: node.title });
  };

  // ----- XMind 新功能：概要 / 边界 / 联系线 -----
  const handleAddSummary = (anchorId: NodeId) => {
    const anchor = nodes.find((n) => n.id === anchorId);
    if (!anchor || !anchor.parentId) {
      toast.error("请在某个分支下的节点上添加概要（根节点不支持）。");
      return;
    }
    // 选择当前节点 + 紧邻它前后的同级节点（模拟 XMind"概要"对当前选区生效）
    const siblings = nodes.filter(
      (n) => n.parentId === anchor.parentId && !n.isDeleted,
    );
    const idx = siblings.findIndex((n) => n.id === anchorId);
    const start = Math.max(0, idx - 1);
    const end = Math.min(siblings.length - 1, idx + 1);
    const range = siblings.slice(start, end + 1).map((n) => n.id);
    const id = createChildOf(anchor.parentId, "概要", {
      summaryRange: range,
    });
    setSelectedNodeId(id);
    setEditingNodeId(id);
  };

  const handleAddBoundary = (anchorId: NodeId) => {
    const anchor = nodes.find((n) => n.id === anchorId);
    if (!anchor || !anchor.parentId) {
      toast.error("请在某个分支下的节点上添加边界（根节点不支持）。");
      return;
    }
    const siblings = nodes.filter(
      (n) => n.parentId === anchor.parentId && !n.isDeleted,
    );
    const idx = siblings.findIndex((n) => n.id === anchorId);
    const start = Math.max(0, idx - 1);
    const end = Math.min(siblings.length - 1, idx + 1);
    const range = siblings.slice(start, end + 1).map((n) => n.id);
    const id = createChildOf(anchor.parentId, "边界", {
      boundaryRange: range,
    });
    setSelectedNodeId(id);
    setEditingNodeId(id);
  };

  const handleStartRelationship = (fromId: NodeId) => {
    setRelDraftFromId(fromId);
    setSelectedNodeId(fromId);
  };

  const handleFinishRelationship = (toId: NodeId) => {
    if (!relDraftFromId || relDraftFromId === toId || !activeMindmap) {
      setRelDraftFromId(null);
      return;
    }
    const newRel: Relationship = {
      id: newId("rel"),
      mindmapId: activeMindmap.id,
      fromId: relDraftFromId,
      toId,
      label: "",
      createdBy: currentUser.id,
      createdAt: new Date().toISOString(),
    };
    setRelationships((prev) => [...prev, newRel]);
    setRelDraftFromId(null);
  };

  const handleChangeStructure = (s: MindMapStructure) => {
    if (!activeMindmap) return;
    setMindmaps((prev) =>
      prev.map((m) =>
        m.id === activeMindmap.id ? { ...m, structure: s } : m,
      ),
    );
  };
  const handleChangeTheme = (t: MindMapTheme) => {
    if (!activeMindmap) return;
    setMindmaps((prev) =>
      prev.map((m) => (m.id === activeMindmap.id ? { ...m, theme: t } : m)),
    );
  };

  const handleGanttUpdateTask = (nodeId: NodeId, patch: Partial<TaskFields>) => {
    const node = nodes.find((n) => n.id === nodeId && !n.isDeleted);
    if (!node?.task) return;
    const nowISO = new Date().toISOString();
    const nextTask: TaskFields = { ...node.task, ...patch };
    const nextNode: Node = { ...node, task: nextTask, updatedAt: nowISO };
    setNodes((prev) =>
      syncExecutorProgressToPeer(
        prev.map((n) => (n.id === nodeId ? nextNode : n)),
        nodeId,
      ),
    );
  };

  const mindmapItems = myMindmaps.map((m) => ({
    id: m.id,
    label: mindmapDisplayLabel(m, currentUser.name),
    badge: m.id === "mm-xmind-demo" ? "演示" : undefined,
  }));

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <PageHeader
        title="我的导图"
        description={
          activeMindmap.id === "mm-xmind-demo"
            ? "XMind 风格演示图 · 中心放射 / 概要 / 边界 / 联系线"
            : mindmapDisplayLabel(activeMindmap, currentUser.name)
        }
        right={
          <div className="flex items-center gap-2">
            <Stat label="总任务" value={stats.total} />
            <Stat label="进行中" value={stats.inProgress} tone="blue" />
            <Stat label="阻塞" value={stats.blocked} tone="rose" />
            <Stat label="已完成" value={stats.done} tone="emerald" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleAddChild(rootNode.id)}
            >
              + 主题
            </Button>
            <Button
              variant={dockOpen && dockTab === "markers" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                if (dockOpen && dockTab === "markers") {
                  setDockOpen(false);
                } else {
                  setDockTab("markers");
                  setDockOpen(true);
                }
              }}
              title="打开标记面板（XMind 风格 · 选中任务后即可勾选）"
            >
              <Tags className="h-3.5 w-3.5" />
              标记
            </Button>
            <Button
              variant={dockOpen && dockTab === "style" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                if (dockOpen && dockTab === "style") {
                  setDockOpen(false);
                } else {
                  setDockTab("style");
                  setDockOpen(true);
                }
              }}
              title="节点样式：形状、颜色、文本与分支线"
            >
              <Palette className="h-3.5 w-3.5" />
              样式
            </Button>
            {userIsManager && (
              <Button
                variant={
                  dockOpen && dockTab === "assigned-out" ? "default" : "outline"
                }
                size="sm"
                onClick={() => {
                  if (dockOpen && dockTab === "assigned-out") {
                    setDockOpen(false);
                  } else {
                    setDockTab("assigned-out");
                    setDockOpen(true);
                  }
                }}
                title="查看你派给下属的所有任务（同步显示进度）"
                className="relative"
              >
                <InboxIcon className="h-3.5 w-3.5" />
                派出
                {myTotalAssignedOut > 0 && (
                  <span className="ml-1 text-[10px] text-slate-500">
                    {myTotalAssignedOut}
                  </span>
                )}
                {myPendingAssignedOut > 0 && (
                  <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] leading-none">
                    {myPendingAssignedOut}
                  </span>
                )}
              </Button>
            )}
            {userIsManager && (
              <Button size="sm" onClick={() => setAssignOpen(true)}>
                <Send className="h-3.5 w-3.5" />
                派任务
              </Button>
            )}
          </div>
        }
      />

      {/* XMind 编辑器工具栏 */}
      <MindMapToolbar
        mindmap={activeMindmap}
        onChangeStructure={handleChangeStructure}
        onChangeTheme={handleChangeTheme}
        mindmapList={mindmapItems}
        onSwitchMindmap={(id) => {
          setActiveMindmapId(id);
          setSelectedNodeId(null);
          setRelDraftFromId(null);
        }}
        onRequestNewMindmap={() => setNewMindmapOpen(true)}
        viewMode={viewMode}
        onChangeView={setViewMode}
      />

      <div className="flex-1 flex min-h-0">
        {viewMode === "map" ? (
          <MindMapCanvas
            rootNodeId={rootNode.id}
            nodes={activeNodes}
            currentUserId={currentUser.id}
            selectedNodeId={selectedNodeId}
            editingNodeId={editingNodeId}
            structure={activeMindmap.structure}
            theme={activeMindmap.theme}
            useAnnualTemplate={activeMindmap.useAnnualTemplate}
            relationships={activeRelationships}
            relationshipDraftFromId={relDraftFromId}
            onSelectNode={(id) => setSelectedNodeId(id)}
            onStartEdit={handleStartEdit}
            onCommitEdit={handleCommitEdit}
            onCancelEdit={handleCancelEdit}
            onAddChild={handleAddChild}
            onAddSibling={handleAddSibling}
            onDeleteNode={handleDelete}
            onAssignToNode={() => setAssignOpen(true)}
            onShareNode={(id) => openShare(id)}
            onRequestFollow={(id) => openFollow(id)}
            onOpenDetails={(id) => openDock("details", id)}
            onOpenFormat={(id) => openDock("style", id)}
            onAddMarker={(id) => openDock("markers", id)}
            onAddSummary={handleAddSummary}
            onAddBoundary={handleAddBoundary}
            onStartRelationship={handleStartRelationship}
            onFinishRelationship={handleFinishRelationship}
            isNodeReadOnly={() => false}
            onMoveNode={handleMoveNode}
          />
        ) : viewMode === "outline" ? (
          <MindMapOutline
            rootId={rootNode.id}
            nodes={activeNodes}
            selectedNodeId={selectedNodeId}
            onSelect={(id) => setSelectedNodeId(id)}
            onDoubleClick={(id) => handleStartEdit(id)}
            themeId={activeMindmap.theme}
          />
        ) : (
          <MindMapGantt
            mindmapId={activeMindmap.id}
            rootNodeId={rootNode.id}
            nodes={nodes}
            users={users}
            themeId={activeMindmap.theme}
            selectedNodeId={selectedNodeId}
            onSelectNode={(id) => setSelectedNodeId(id)}
            onUpdateTask={handleGanttUpdateTask}
          />
        )}
        <NodeDetailDrawer
          open={dockOpen}
          nodeId={selectedNodeId}
          tab={dockTab}
          onTabChange={setDockTab}
          onClose={() => setDockOpen(false)}
          onAssign={() => setAssignOpen(true)}
          onShare={(id) => openShare(id)}
          onRequestFollow={(id) => openFollow(id)}
          onDelete={(id) => handleDelete(id)}
          onSelectNode={(id) => setSelectedNodeId(id)}
          showAssignedOut={userIsManager}
          mindmapStructure={activeMindmap.structure}
        />
      </div>
      <AssignDialog
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        presetNode={selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : undefined}
      />
      <ShareDialog
        open={!!shareNodeId}
        nodeId={shareNodeId}
        onClose={() => setShareNodeId(null)}
      />
      <RequestFollowDialog
        open={!!followNodeId}
        nodeId={followNodeId}
        onClose={() => setFollowNodeId(null)}
      />
      <NewMindMapDialog
        open={newMindmapOpen}
        onOpenChange={setNewMindmapOpen}
        onCreate={handleCreateMindmap}
      />
      {deleteConfirm && (
      <ConfirmDialog
          open={!!deleteConfirm}
          title="确认删除节点"
          description={
            deleteConfirm.childCount > 0
              ? `「${deleteConfirm.title}」下还有 ${deleteConfirm.childCount} 个子节点，一并删除？此操作不可撤销。`
              : `确认删除节点「${deleteConfirm.title}」？此操作不可撤销。`
          }
          confirmLabel="确认删除"
          destructive
          onConfirm={() => {
            deleteNodeRaw(deleteConfirm.id);
            if (selectedNodeId === deleteConfirm.id) setSelectedNodeId(null);
            setDeleteConfirm(null);
          }}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "blue" | "rose" | "emerald";
}) {
  const toneCls =
    tone === "blue"
      ? "bg-blue-50 text-blue-700"
      : tone === "rose"
        ? "bg-rose-50 text-rose-700"
        : tone === "emerald"
          ? "bg-emerald-50 text-emerald-700"
          : "bg-slate-100 text-slate-700";
  return (
    <Badge variant="outline" className={`gap-1 px-2 py-1 ${toneCls}`}>
      <span className="text-[11px]">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </Badge>
  );
}
