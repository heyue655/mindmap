import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RefreshCcw,
  Keyboard,
} from "lucide-react";
import type {
  MindMapStructure,
  MindMapTheme,
  Node,
  NodeId,
  Relationship,
  UserId,
} from "@/types";
import { groupByParent } from "@/lib/skeleton";
import { layoutByStructure } from "./layout";
import MindMapNode, {
  type CommitIntent,
  type NodeLevel,
} from "./MindMapNode";
import MindMapEdges from "./MindMapEdges";
import NodeContextMenu, {
  type ContextMenuActions,
  type ContextMenuPosition,
} from "./NodeContextMenu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getTheme } from "./theme";
import {
  resolveDropTarget,
  type DropHint,
} from "@/lib/mindmapDrag";

interface Props {
  rootNodeId: NodeId;
  nodes: Node[];
  currentUserId: UserId;
  selectedNodeId?: NodeId | null;
  editingNodeId?: NodeId | null;
  // XMind 风格：结构 + 主题
  structure?: MindMapStructure;
  theme?: MindMapTheme;
  useAnnualTemplate?: boolean;
  // XMind 联系线
  relationships?: Relationship[];
  // 联系线创建中（指针起点 = fromId 节点）
  relationshipDraftFromId?: NodeId | null;
  onSelectNode: (id: NodeId | null) => void;
  onStartEdit: (id: NodeId) => void;
  onCommitEdit: (id: NodeId, value: string, intent: CommitIntent) => void;
  onCancelEdit: () => void;
  onAddChild: (parentId: NodeId) => void;
  onAddSibling: (siblingId: NodeId) => void;
  onDeleteNode: (id: NodeId) => void;
  onAssignToNode?: (id: NodeId) => void;
  onShareNode?: (id: NodeId) => void;
  onRequestFollow?: (id: NodeId) => void;
  onOpenDetails?: (id: NodeId) => void;
  onOpenFormat?: (id: NodeId) => void;
  onAddMarker?: (id: NodeId) => void;
  onAddSummary?: (id: NodeId) => void;
  onAddBoundary?: (id: NodeId) => void;
  onStartRelationship?: (id: NodeId) => void;
  onFinishRelationship?: (toId: NodeId) => void;
  isNodeReadOnly?: (id: NodeId) => boolean;
  /** 拖动手柄松手后：调整同级顺序或跨级挂靠 */
  onMoveNode?: (
    draggedId: NodeId,
    targetId: NodeId,
    hint: DropHint,
  ) => void;
}

export default function MindMapCanvas({
  rootNodeId,
  nodes,
  selectedNodeId,
  editingNodeId,
  structure = "right-logic",
  theme: themeId = "snowbrush",
  useAnnualTemplate = false,
  relationships = [],
  relationshipDraftFromId = null,
  onSelectNode,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onAddChild,
  onAddSibling,
  onDeleteNode,
  onAssignToNode,
  onShareNode,
  onRequestFollow,
  onOpenDetails,
  onOpenFormat,
  onAddMarker,
  onAddSummary,
  onAddBoundary,
  onStartRelationship,
  onFinishRelationship,
  isNodeReadOnly,
  onMoveNode,
}: Props) {
  const theme = useMemo(() => getTheme(themeId), [themeId]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 40, y: 40 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ x: number; y: number; tx: number; ty: number }>({
    x: 0,
    y: 0,
    tx: 0,
    ty: 0,
  });
  const [collapsed, setCollapsed] = useState<Set<NodeId>>(new Set());
  const [menu, setMenu] = useState<{
    nodeId: NodeId;
    position: ContextMenuPosition;
  } | null>(null);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [dragSession, setDragSession] = useState<null | { nodeId: NodeId }>(
    null,
  );
  const [dragOver, setDragOver] = useState<{
    targetId: NodeId;
    hint: DropHint;
  } | null>(null);

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const translateRef = useRef(translate);
  translateRef.current = translate;
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const dragSessionRef = useRef<null | { nodeId: NodeId }>(null);
  dragSessionRef.current = dragSession;
  const pendingDragRef = useRef<null | {
    nodeId: NodeId;
    sx: number;
    sy: number;
  }>(null);
  const suppressClickNodeIdRef = useRef<NodeId | null>(null);
  const onMoveNodeRef = useRef(onMoveNode);
  onMoveNodeRef.current = onMoveNode;
  const removeGlobalDragListenersRef = useRef<null | (() => void)>(null);

  const DRAG_THRESHOLD_PX = 6;

  const layout = useMemo(
    () =>
      layoutByStructure({
        rootId: rootNodeId,
        allNodes: nodes,
        collapsed,
        structure,
        useAnnualTemplate,
      }),
    [rootNodeId, nodes, collapsed, structure, useAnnualTemplate],
  );

  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const clientToCanvas = (clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: (clientX - rect.left - translateRef.current.x) / scaleRef.current,
      y: (clientY - rect.top - translateRef.current.y) / scaleRef.current,
    };
  };

  const clearGlobalTopicDragListeners = () => {
    removeGlobalDragListenersRef.current?.();
    removeGlobalDragListenersRef.current = null;
  };

  const attachGlobalTopicDragListeners = () => {
    if (removeGlobalDragListenersRef.current) return;

    const onMove = (ev: PointerEvent) => {
      const pending = pendingDragRef.current;
      if (pending && !dragSessionRef.current) {
        if (
          Math.hypot(ev.clientX - pending.sx, ev.clientY - pending.sy) >=
          DRAG_THRESHOLD_PX
        ) {
          pendingDragRef.current = null;
          suppressClickNodeIdRef.current = pending.nodeId;
          const id = pending.nodeId;
          dragSessionRef.current = { nodeId: id };
          setDragSession({ nodeId: id });
        }
      }
      const sess = dragSessionRef.current;
      if (sess) {
        const { x, y } = clientToCanvas(ev.clientX, ev.clientY);
        const r = resolveDropTarget({
          draggedId: sess.nodeId,
          canvasX: x,
          canvasY: y,
          positioned: layoutRef.current.positioned,
          nodes: nodesRef.current,
          nearestMaxPx: 140,
        });
        setDragOver(r);
      }
    };

    const onUp = (ev: PointerEvent) => {
      pendingDragRef.current = null;
      const sess = dragSessionRef.current;
      clearGlobalTopicDragListeners();
      if (sess) {
        const { x, y } = clientToCanvas(ev.clientX, ev.clientY);
        const r = resolveDropTarget({
          draggedId: sess.nodeId,
          canvasX: x,
          canvasY: y,
          positioned: layoutRef.current.positioned,
          nodes: nodesRef.current,
          nearestMaxPx: 140,
        });
        if (r) onMoveNodeRef.current?.(sess.nodeId, r.targetId, r.hint);
      }
      dragSessionRef.current = null;
      setDragSession(null);
      setDragOver(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    removeGlobalDragListenersRef.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  };

  // 该图过滤后的联系线（只画两端都已布局的）
  const visibleRelationships = useMemo(
    () =>
      relationships.filter(
        (rel) => layout.byId.has(rel.fromId) && layout.byId.has(rel.toId),
      ),
    [relationships, layout.byId],
  );

  const childrenMap = useMemo(() => groupByParent(nodes), [nodes]);

  // 初次加载自适应
  const [hasAutoFit, setHasAutoFit] = useState(false);
  useEffect(() => {
    setHasAutoFit(false);
  }, [rootNodeId]);
  useEffect(() => {
    if (hasAutoFit) return;
    if (!containerRef.current) return;
    if (layout.width === 0 || layout.height === 0) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    if (cw === 0 || ch === 0) return;
    const padding = 60;
    const sx = (cw - padding * 2) / layout.width;
    const sy = (ch - padding * 2) / layout.height;
    const s = Math.min(1, Math.min(sx, sy));
    setScale(s);
    setTranslate({ x: padding, y: padding });
    setHasAutoFit(true);
  }, [layout, hasAutoFit]);

  // 滚轮缩放
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = -e.deltaY * 0.002;
        setScale((s) => Math.min(2, Math.max(0.4, s + delta)));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
        if (dragSession) return;
        if ((e.target as HTMLElement).closest("[data-node]")) return;
        setIsPanning(true);
    panStart.current = {
      x: e.clientX,
      y: e.clientY,
      tx: translate.x,
      ty: translate.y,
    };
  };
  const onMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!isPanning) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    setTranslate({
      x: panStart.current.tx + dx,
      y: panStart.current.ty + dy,
    });
  };
  const onMouseUp = () => setIsPanning(false);

  const resetView = () => {
    setScale(1);
    setTranslate({ x: 40, y: 40 });
  };

  const fitToScreen = () => {
    if (!containerRef.current) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const padding = 80;
    const sx = (cw - padding * 2) / Math.max(layout.width, 1);
    const sy = (ch - padding * 2) / Math.max(layout.height, 1);
    const s = Math.min(1, Math.min(sx, sy));
    setScale(s);
    setTranslate({ x: padding, y: padding });
  };

  const toggleCollapse = (id: NodeId) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleContextMenu = (
    nodeId: NodeId,
    e: ReactMouseEvent,
  ) => {
    setMenu({ nodeId, position: { x: e.clientX, y: e.clientY } });
  };

  const menuActions: ContextMenuActions = useMemo(() => {
    if (!menu) return {};
    const node = nodes.find((n) => n.id === menu.nodeId);
    if (!node) return {};
    const readOnly = isNodeReadOnly?.(node.id) ?? false;
    const isSkeleton = node.nodeType === "skeleton";
    return {
      onAddChild: !readOnly ? () => onAddChild(node.id) : undefined,
      onRename:
        !readOnly && !isSkeleton ? () => onStartEdit(node.id) : undefined,
      onDelete:
        !readOnly && !isSkeleton ? () => onDeleteNode(node.id) : undefined,
      onAssign:
        readOnly && isSkeleton ? () => onAssignToNode?.(node.id) : undefined,
      onShare:
        !readOnly && !isSkeleton ? () => onShareNode?.(node.id) : undefined,
      onRequestFollow:
        !readOnly && !isSkeleton ? () => onRequestFollow?.(node.id) : undefined,
      onAddMarker:
        !readOnly && !isSkeleton ? () => onAddMarker?.(node.id) : undefined,
      onAddSummary:
        !readOnly && !isSkeleton && onAddSummary
          ? () => onAddSummary(node.id)
          : undefined,
      onAddBoundary:
        !readOnly && !isSkeleton && onAddBoundary
          ? () => onAddBoundary(node.id)
          : undefined,
      onStartRelationship:
        !readOnly && !isSkeleton && onStartRelationship
          ? () => onStartRelationship(node.id)
          : undefined,
      onOpenDetails: () => onOpenDetails?.(node.id),
      onOpenFormat:
        !readOnly && !isSkeleton && onOpenFormat
          ? () => onOpenFormat(node.id)
          : undefined,
    };
  }, [
    menu,
    nodes,
    isNodeReadOnly,
    onAddChild,
    onStartEdit,
    onDeleteNode,
    onAssignToNode,
    onShareNode,
    onRequestFollow,
    onAddMarker,
    onAddSummary,
    onAddBoundary,
    onStartRelationship,
    onOpenDetails,
    onOpenFormat,
  ]);

  // 键盘导航/快捷键
  useEffect(() => {
    if (!selectedNodeId) return;
    if (editingNodeId) return; // 编辑时让 input 处理

    const handler = (e: KeyboardEvent) => {
      // 跳过表单元素的键盘（除非来自我们的节点 input — 那里我们已 stopPropagation）
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const node = nodes.find((n) => n.id === selectedNodeId);
      if (!node) return;
      const readOnly = isNodeReadOnly?.(node.id) ?? false;
      const isSkeleton = node.nodeType === "skeleton";

      const key = e.key;
      if (key === "Tab") {
        e.preventDefault();
        if (!readOnly) onAddChild(node.id);
      } else if (key === "Enter") {
        e.preventDefault();
        if (readOnly) return;
        // 根/骨架节点没法加同级（要么因为没有父节点，要么因为骨架结构固定），改为加子
        if (!node.parentId || isSkeleton) onAddChild(node.id);
        else onAddSibling(node.id);
      } else if (key === "F2") {
        e.preventDefault();
        if (!readOnly && !isSkeleton) onStartEdit(node.id);
      } else if (key === "Backspace" || key === "Delete") {
        e.preventDefault();
        if (!readOnly && !isSkeleton) onDeleteNode(node.id);
      } else if (key === "Escape") {
        e.preventDefault();
        onSelectNode(null);
      } else if (key === " ") {
        e.preventDefault();
        onOpenDetails?.(node.id);
      } else if (
        key === "ArrowUp" ||
        key === "ArrowDown" ||
        key === "ArrowLeft" ||
        key === "ArrowRight"
      ) {
        e.preventDefault();
        const next = navigate(node, key, nodes, childrenMap);
        if (next) onSelectNode(next);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    selectedNodeId,
    editingNodeId,
    nodes,
    childrenMap,
    isNodeReadOnly,
    onAddChild,
    onAddSibling,
    onDeleteNode,
    onSelectNode,
    onStartEdit,
    onOpenDetails,
  ]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex-1 min-h-0 overflow-hidden",
        theme.canvasBg,
        dragSession ? "cursor-grabbing" : isPanning ? "cursor-grabbing" : "cursor-grab",
      )}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onClick={(e) => {
        // 只响应"真正点在画布空白处"的事件；从节点 / 菜单 / 按钮冒泡上来的不算
        if (e.target !== e.currentTarget) {
          // 网格层（pointer-events-none）的兄弟元素的 click 不会到这里，但保险起见再判一层
          const t = e.target as HTMLElement;
          if (t.closest("[data-node]")) return;
          if (t.closest("[data-canvas-overlay]")) return;
        }
        if (!editingNodeId) onSelectNode(null);
      }}
    >
      {/* 网格背景 */}
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          backgroundImage: `radial-gradient(circle, ${theme.gridDot} 1px, transparent 1px)`,
          backgroundSize: "24px 24px",
        }}
      />

      {/* 内容层 */}
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{
          transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
          width: layout.width,
          height: layout.height,
        }}
      >
        <MindMapEdges
          positioned={layout.positioned}
          byId={layout.byId}
          width={layout.width}
          height={layout.height}
          brackets={layout.brackets}
          boundaries={layout.boundaries}
          hiddenEdgesToChild={layout.hiddenEdgesToChild}
          theme={theme}
          relationships={visibleRelationships}
        />

        {layout.positioned.map((p) => {
          const isRoot = p.node.id === rootNodeId;
          const isFirstLevel = p.node.parentId === rootNodeId;
          const level: NodeLevel = isRoot
            ? "root"
            : isFirstLevel
              ? "branch"
              : "leaf";
          const canTopicDrag =
            !!onMoveNode &&
            p.node.nodeType !== "skeleton" &&
            !(isNodeReadOnly?.(p.node.id) ?? false);

          return (
            <div
              key={p.node.id}
              data-node="1"
              className={cn(
                canTopicDrag && "cursor-grab active:cursor-grabbing touch-none",
              )}
              style={{
                position: "absolute",
                left: p.x,
                top: p.y,
                width: p.width,
              }}
              onPointerDownCapture={(e) => {
                if (e.button !== 0) return;
                if (relationshipDraftFromId) return;
                if (!onMoveNode) return;
                if (p.node.nodeType === "skeleton") return;
                if (isNodeReadOnly?.(p.node.id)) return;
                if (editingNodeId === p.node.id) return;
                const el = e.target as HTMLElement;
                if (
                  el.closest(
                    "input, textarea, button, a[href], [data-no-topic-drag]",
                  )
                ) {
                  return;
                }
                pendingDragRef.current = {
                  nodeId: p.node.id,
                  sx: e.clientX,
                  sy: e.clientY,
                };
                attachGlobalTopicDragListeners();
              }}
            >
              <MindMapNode
                node={p.node}
                width={p.width}
                height={p.height}
                selected={selectedNodeId === p.node.id}
                editing={editingNodeId === p.node.id}
                collapsed={collapsed.has(p.node.id)}
                hasChildren={(childrenMap.get(p.node.id)?.length ?? 0) > 0}
                readOnly={isNodeReadOnly?.(p.node.id) ?? false}
                level={level}
                theme={theme}
                dragging={dragSession?.nodeId === p.node.id}
                dropHighlight={
                  dragOver?.targetId === p.node.id ? dragOver.hint : null
                }
                onClick={() => {
                  if (suppressClickNodeIdRef.current === p.node.id) {
                    suppressClickNodeIdRef.current = null;
                    return;
                  }
                  // 联系线模式：第二次点击 = 终点
                  if (
                    relationshipDraftFromId &&
                    onFinishRelationship &&
                    relationshipDraftFromId !== p.node.id
                  ) {
                    onFinishRelationship(p.node.id);
                    return;
                  }
                  onSelectNode(p.node.id);
                }}
                onDoubleClick={() => {
                  const ro = isNodeReadOnly?.(p.node.id) ?? false;
                  if (!ro && p.node.nodeType !== "skeleton") {
                    onStartEdit(p.node.id);
                  }
                }}
                onContextMenu={(e) => handleContextMenu(p.node.id, e)}
                onToggleCollapse={() => toggleCollapse(p.node.id)}
                onCommitEdit={(value, intent) =>
                  onCommitEdit(p.node.id, value, intent)
                }
                onCancelEdit={onCancelEdit}
              />
            </div>
          );
        })}
      </div>

      {/* 工具栏 */}
      <div
        data-canvas-overlay="1"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute bottom-4 right-4 flex items-center gap-1 bg-white border border-border rounded-md shadow-sm p-1"
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={(e) => {
            e.stopPropagation();
            setScale((s) => Math.max(0.4, s - 0.1));
          }}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="text-xs text-slate-500 tabular-nums w-10 text-center">
          {Math.round(scale * 100)}%
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={(e) => {
            e.stopPropagation();
            setScale((s) => Math.min(2, s + 0.1));
          }}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <div className="w-px h-5 bg-border mx-1" />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={(e) => {
            e.stopPropagation();
            fitToScreen();
          }}
          title="自适应"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={(e) => {
            e.stopPropagation();
            resetView();
          }}
          title="重置视图"
        >
          <RefreshCcw className="h-4 w-4" />
        </Button>
        <div className="w-px h-5 bg-border mx-1" />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={(e) => {
            e.stopPropagation();
            setShowShortcutHelp((v) => !v);
          }}
          title="快捷键"
        >
          <Keyboard className="h-4 w-4" />
        </Button>
      </div>

      {/* 操作提示 */}
      <div
        data-canvas-overlay="1"
        className="absolute bottom-4 left-4 text-xs text-slate-500 bg-white/80 px-2 py-1 rounded pointer-events-none"
      >
        按住主题拖动：移一点距离后生效 · 偏左/上下=同级顺序 · 偏右=子主题 · Tab/Enter · Space
      </div>

      {/* 联系线创建中提示 */}
      {relationshipDraftFromId && (
        <div
          data-canvas-overlay="1"
          className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-purple-600 text-white text-xs font-medium shadow-lg"
        >
          点击目标节点完成联系线创建（按 Esc 取消）
        </div>
      )}

      {/* 快捷键帮助卡片 */}
      {showShortcutHelp && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-16 right-4 w-72 bg-white border border-border rounded-lg shadow-lg p-3 text-xs"
        >
          <div className="font-semibold mb-2 text-brand-ink">键盘快捷键</div>
          <div className="space-y-1 text-slate-600">
            <Row k="Tab" v="添加子节点" />
            <Row k="Enter" v="添加同级节点" />
            <Row k="Shift + Enter" v="结束编辑（不新增）" />
            <Row k="F2 / 双击" v="编辑当前节点" />
            <Row k="Esc" v="取消编辑 / 取消选中" />
            <Row k="Backspace / Del" v="删除节点" />
            <Row k="Space" v="打开详情抽屉" />
            <Row k="↑ ↓" v="切换同级" />
            <Row k="← →" v="切换父/子级" />
            <Row k="按住主题拖" v="同级排序 / 跨级（先移动 ~6px）" />
            <Row k="拖拽空白" v="平移画布" />
            <Row k="⌘/Ctrl + 滚轮" v="缩放" />
          </div>
        </div>
      )}

      {/* 右键菜单 */}
      {menu && (
        <NodeContextMenu
          position={menu.position}
          onClose={() => setMenu(null)}
          {...menuActions}
        />
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <span>{v}</span>
      <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-mono">
        {k}
      </kbd>
    </div>
  );
}

// 键盘导航：根据方向键找下一个目标节点 id
function navigate(
  current: Node,
  key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight",
  _nodes: Node[],
  childrenMap: Map<string, Node[]>,
): NodeId | null {
  if (key === "ArrowRight") {
    const ch = (childrenMap.get(current.id) ?? []).filter((n) => !n.isDeleted);
    return ch[0]?.id ?? null;
  }
  if (key === "ArrowLeft") {
    return current.parentId ?? null;
  }
  if (!current.parentId) return null;
  let siblings = (childrenMap.get(current.parentId) ?? []).filter(
    (n) => !n.isDeleted,
  );
  // 当 current 是 month/quarter 骨架时，仅在同类骨架兄弟中上下导航
  if (
    current.nodeType === "skeleton" &&
    (current.timeBucketKind === "month" ||
      current.timeBucketKind === "quarter")
  ) {
    siblings = siblings.filter(
      (s) =>
        s.nodeType === "skeleton" &&
        s.timeBucketKind === current.timeBucketKind,
    );
  }
  const idx = siblings.findIndex((n) => n.id === current.id);
  if (idx === -1) return null;
  if (key === "ArrowUp") return siblings[idx - 1]?.id ?? null;
  if (key === "ArrowDown") return siblings[idx + 1]?.id ?? null;
  return null;
}
