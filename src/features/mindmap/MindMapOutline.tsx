import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import type { MindMapTheme, Node, NodeId, User } from "@/types";
import { groupByParent } from "@/lib/skeleton";
import { getTheme, type ThemeDef } from "./theme";
import { MarkerIcon } from "@/features/markers/markers";
import { cn } from "@/lib/utils";
import { useStore } from "@/store/StoreProvider";
import MentionText from "@/features/mention/MentionText";

interface Props {
  rootId: NodeId;
  nodes: Node[];
  selectedNodeId?: NodeId | null;
  onSelect: (id: NodeId) => void;
  onDoubleClick?: (id: NodeId) => void;
  themeId?: MindMapTheme | null;
}

export default function MindMapOutline({
  rootId,
  nodes,
  selectedNodeId,
  onSelect,
  onDoubleClick,
  themeId,
}: Props) {
  const { users } = useStore();
  const theme = useMemo(() => getTheme(themeId), [themeId]);
  const byParent = useMemo(() => groupByParent(nodes), [nodes]);
  const root = useMemo(() => nodes.find((n) => n.id === rootId), [nodes, rootId]);

  if (!root)
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
        没有数据
      </div>
    );

  return (
    <div className="flex-1 overflow-y-auto bg-white">
      <div className="max-w-3xl mx-auto px-6 py-6">
        <Row
          node={root}
          depth={0}
          byParent={byParent}
          selectedNodeId={selectedNodeId}
          onSelect={onSelect}
          onDoubleClick={onDoubleClick}
          users={users}
          theme={theme}
        />
      </div>
    </div>
  );
}

function Row({
  node,
  depth,
  byParent,
  selectedNodeId,
  onSelect,
  onDoubleClick,
  users,
  theme,
}: {
  node: Node;
  depth: number;
  byParent: Map<NodeId | "ROOT", Node[]>;
  selectedNodeId?: NodeId | null;
  onSelect: (id: NodeId) => void;
  onDoubleClick?: (id: NodeId) => void;
  users: User[];
  theme: ThemeDef;
}) {
  const children = (byParent.get(node.id) ?? []).filter((n) => !n.isDeleted);
  const isSelected = selectedNodeId === node.id;
  const dotColor =
    depth === 0
      ? theme.rootBg
      : depth === 1
        ? theme.branchBorder
        : theme.leafBorder;

  return (
    <div>
      <button
        onClick={() => onSelect(node.id)}
        onDoubleClick={() => onDoubleClick?.(node.id)}
        className={cn(
          "w-full flex items-start gap-1.5 py-1 pr-2 rounded text-left",
          isSelected ? "" : "hover:bg-slate-50",
        )}
        style={{
          paddingLeft: depth * 18 + 4,
          backgroundColor: isSelected ? theme.outlineSelectedBg : undefined,
        }}
      >
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 mt-1 text-slate-300 shrink-0",
            children.length === 0 && "opacity-0",
          )}
        />
        <span
          className="h-1.5 w-1.5 rounded-full mt-2 shrink-0"
          style={{ backgroundColor: dotColor }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {node.markers && node.markers.length > 0 && (
              <span className="inline-flex items-center gap-0.5">
                {node.markers.map((mid) => (
                  <MarkerIcon key={mid} id={mid} size={12} />
                ))}
              </span>
            )}
            <span
              className={cn(
                "font-medium text-slate-800",
                depth === 0 ? "text-base" : "text-sm",
              )}
              style={{
                color: isSelected ? theme.accentRing : undefined,
              }}
            >
              {node.title ? (
                <MentionText text={node.title} users={users} />
              ) : (
                <span className="text-slate-400 italic">未命名</span>
              )}
            </span>
            {node.task && (
              <span className="text-[10px] px-1 py-0.5 rounded bg-slate-100 text-slate-600">
                {node.task.priority} · {node.task.progressPct}%
              </span>
            )}
            {node.labels?.map((l) => (
              <span
                key={l}
                className="text-[10px] px-1 py-0.5 rounded bg-purple-50 text-purple-700"
              >
                {l}
              </span>
            ))}
            {node.summaryRange && (
              <span className="text-[10px] px-1 py-0.5 rounded bg-orange-100 text-orange-700">
                概要
              </span>
            )}
            {node.boundaryRange && (
              <span className="text-[10px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-700">
                边界
              </span>
            )}
            {node.isFloating && (
              <span className="text-[10px] px-1 py-0.5 rounded bg-purple-100 text-purple-700">
                浮动
              </span>
            )}
          </div>
          {node.description && (
            <div className="text-xs text-slate-500 mt-0.5 truncate">
              <MentionText text={node.description} users={users} />
            </div>
          )}
        </div>
      </button>
      {children.map((c) => (
        <Row
          key={c.id}
          node={c}
          depth={depth + 1}
          byParent={byParent}
          selectedNodeId={selectedNodeId}
          onSelect={onSelect}
          onDoubleClick={onDoubleClick}
          users={users}
          theme={theme}
        />
      ))}
    </div>
  );
}
