import { useEffect, useRef } from "react";
import {
  Plus,
  Trash2,
  Send,
  Eye,
  Share2,
  PenLine,
  Info,
  Tags,
  Sigma,
  Square as SquareIcon,
  GitBranch,
  Palette,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ContextMenuActions {
  onAddChild?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  onAssign?: () => void;
  onShare?: () => void;
  onRequestFollow?: () => void;
  onOpenDetails?: () => void;
  onOpenFormat?: () => void;
  onAddMarker?: () => void;
  onAddSummary?: () => void;
  onAddBoundary?: () => void;
  onStartRelationship?: () => void;
}

export interface ContextMenuPosition {
  x: number;
  y: number;
}

interface Props extends ContextMenuActions {
  position: ContextMenuPosition;
  onClose: () => void;
}

export default function NodeContextMenu({
  position,
  onClose,
  onAddChild,
  onRename,
  onDelete,
  onAssign,
  onShare,
  onRequestFollow,
  onOpenDetails,
  onOpenFormat,
  onAddMarker,
  onAddSummary,
  onAddBoundary,
  onStartRelationship,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as globalThis.Node)) {
        onClose();
      }
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", handle);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("mousedown", handle);
      window.removeEventListener("keydown", escape);
    };
  }, [onClose]);

  const items: Array<{
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    onClick?: () => void;
    danger?: boolean;
    shortcut?: string;
  }> = [
    onOpenDetails && {
      label: "查看详情",
      icon: Info,
      onClick: onOpenDetails,
      shortcut: "Space",
    },
    onOpenFormat && {
      label: "样式与格式",
      icon: Palette,
      onClick: onOpenFormat,
    },
    onAddChild && {
      label: "添加子节点",
      icon: Plus,
      onClick: onAddChild,
      shortcut: "Tab",
    },
    onRename && {
      label: "重命名",
      icon: PenLine,
      onClick: onRename,
      shortcut: "F2",
    },
    onAddMarker && {
      label: "添加标记",
      icon: Tags,
      onClick: onAddMarker,
    },
    onAddSummary && {
      label: "添加概要",
      icon: Sigma,
      onClick: onAddSummary,
    },
    onAddBoundary && {
      label: "添加边界",
      icon: SquareIcon,
      onClick: onAddBoundary,
    },
    onStartRelationship && {
      label: "新建联系线",
      icon: GitBranch,
      onClick: onStartRelationship,
    },
    onAssign && { label: "派任务到这里", icon: Send, onClick: onAssign },
    onShare && { label: "分享给上级", icon: Share2, onClick: onShare },
    onRequestFollow && {
      label: "申请上级关注",
      icon: Eye,
      onClick: onRequestFollow,
    },
    onDelete && {
      label: "删除节点",
      icon: Trash2,
      onClick: onDelete,
      danger: true,
      shortcut: "Del",
    },
  ].filter(Boolean) as Array<{
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    onClick?: () => void;
    danger?: boolean;
    shortcut?: string;
  }>;

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[200px] bg-white rounded-md border border-border shadow-lg py-1"
      style={{ left: position.x, top: position.y }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it) => (
        <button
          key={it.label}
          onClick={(e) => {
            e.stopPropagation();
            it.onClick?.();
            onClose();
          }}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50 text-left",
            it.danger && "text-rose-600 hover:bg-rose-50",
          )}
        >
          <it.icon className="h-4 w-4" />
          <span className="flex-1">{it.label}</span>
          {it.shortcut && (
            <kbd className="text-[10px] text-slate-400 font-mono">
              {it.shortcut}
            </kbd>
          )}
        </button>
      ))}
    </div>
  );
}
