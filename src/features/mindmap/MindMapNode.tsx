import { useEffect, useRef, useState } from "react";
import {
  Lock,
  ChevronRight,
  ChevronDown,
  StickyNote,
  Link as LinkIcon,
  Move,
} from "lucide-react";
import type { Node } from "@/types";
import type { DropHint } from "@/lib/mindmapDrag";
import { cn } from "@/lib/utils";
import {
  skeletonPalette,
  STATUS_COLOR,
  PRIORITY_COLOR,
} from "./nodeStyle";
import { MarkerIcon } from "@/features/markers/markers";
import type { ThemeDef } from "./theme";
import { useStore } from "@/store/StoreProvider";
import { detectActiveMention } from "@/lib/mention";
import MentionPicker, {
  type MentionPickerHandle,
} from "@/features/mention/MentionPicker";
import MentionText from "@/features/mention/MentionText";

export type CommitIntent = "none" | "child" | "sibling";

// 决定节点的"层级语义"：根 / 一级分支 / 叶子
export type NodeLevel = "root" | "branch" | "leaf";

interface Props {
  node: Node;
  width: number;
  height: number;
  selected: boolean;
  editing: boolean;
  collapsed: boolean;
  hasChildren: boolean;
  readOnly: boolean;
  level: NodeLevel;
  theme: ThemeDef;
  onClick: () => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onToggleCollapse: () => void;
  onCommitEdit: (value: string, intent: CommitIntent) => void;
  onCancelEdit: () => void;
  /** 作为放置目标时的高亮提示 */
  dropHighlight?: DropHint | null;
  /** 拖动进行中（XMind：半透明主题） */
  dragging?: boolean;
}

export default function MindMapNode({
  node,
  width,
  height,
  selected,
  editing,
  collapsed,
  hasChildren,
  readOnly,
  level,
  theme,
  onClick,
  onDoubleClick,
  onContextMenu,
  onToggleCollapse,
  onCommitEdit,
  onCancelEdit,
  dropHighlight = null,
  dragging = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { users } = useStore();
  const isSkeleton = node.nodeType === "skeleton";
  const status = node.task?.status;
  const statusStyle = status ? STATUS_COLOR[status] : null;

  // 行内编辑：把 input 转成 controlled，方便插入 @姓名
  const [editValue, setEditValue] = useState(node.title);
  const [mentionState, setMentionState] = useState<{
    query: string;
    atIndex: number;
  } | null>(null);
  const pickerRef = useRef<MentionPickerHandle>(null);

  useEffect(() => {
    if (editing) {
      setEditValue(node.title);
      setMentionState(null);
    }
  }, [editing, node.title]);

  const refreshMention = (next: string, caret: number) => {
    const m = detectActiveMention(next, caret);
    setMentionState(m ? { query: m.query, atIndex: m.atIndex } : null);
  };

  const insertMention = (name: string) => {
    if (!mentionState) return;
    const t = inputRef.current;
    const caret = t?.selectionStart ?? editValue.length;
    const before = editValue.slice(0, mentionState.atIndex);
    const after = editValue.slice(caret);
    const insertion = `@${name} `;
    const next = before + insertion + after;
    setEditValue(next);
    setMentionState(null);
    requestAnimationFrame(() => {
      const tt = inputRef.current;
      if (!tt) return;
      const newCaret = before.length + insertion.length;
      tt.focus();
      tt.setSelectionRange(newCaret, newCaret);
    });
  };

  // 主题色：普通节点按层级；骨架节点按年度模板语义 + 当前主题配色
  const themeStyle: React.CSSProperties = isSkeleton
    ? skeletonPalette(node, theme)
    : level === "root"
      ? {
          backgroundColor: theme.rootBg,
          color: theme.rootText,
          borderColor: theme.rootBorder,
        }
      : level === "branch"
        ? {
            backgroundColor: theme.branchBg,
            color: theme.branchText,
            borderColor: theme.branchBorder,
          }
        : {
            backgroundColor: theme.leafBg,
            color: theme.leafText,
            borderColor: theme.leafBorder,
          };

  const tf = node.topicFormat;
  const mergedStyle: React.CSSProperties = {
    width,
    minHeight: height,
    ...themeStyle,
  };
  if (tf?.shape === "rect") mergedStyle.borderRadius = 4;
  else if (tf?.shape === "pill") mergedStyle.borderRadius = 9999;
  else if (tf?.shape === "rounded") mergedStyle.borderRadius = 12;
  if (tf?.fillColor) mergedStyle.backgroundColor = tf.fillColor;
  if (tf?.borderColor) mergedStyle.borderColor = tf.borderColor;
  if (typeof tf?.borderWidthPx === "number")
    mergedStyle.borderWidth = tf.borderWidthPx;

  if (selected) {
    mergedStyle.boxShadow = `0 0 0 2px ${theme.accentRing}`;
  }

  const titleStyle: React.CSSProperties = {};
  if (tf?.fontSizePx) titleStyle.fontSize = tf.fontSizePx;
  if (tf?.fontFamily) titleStyle.fontFamily = tf.fontFamily;
  if (tf?.fontWeight)
    titleStyle.fontWeight = tf.fontWeight === "bold" ? 700 : 400;
  if (tf?.textColor) titleStyle.color = tf.textColor;
  if (tf?.italic) titleStyle.fontStyle = "italic";
  if (tf?.textAlign) titleStyle.textAlign = tf.textAlign;
  const deco = [
    tf?.underline && "underline",
    tf?.strikethrough && "line-through",
  ].filter(Boolean) as string[];
  if (deco.length) titleStyle.textDecoration = deco.join(" ");

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  return (
    <div
      style={mergedStyle}
      onClick={(e) => {
        e.stopPropagation();
        if (!editing) onClick();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (!editing) onDoubleClick();
      }}
      onContextMenu={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onContextMenu(e);
      }}
      className={cn(
        "group relative rounded-lg border-2 px-3 py-2 cursor-pointer select-none transition-all",
        "shadow-sm hover:shadow-md",
        !isSkeleton && statusStyle ? statusStyle.ring : "",
        dropHighlight === "child" && "ring-2 ring-violet-500 ring-offset-1",
        (dropHighlight === "before-sibling" ||
          dropHighlight === "after-sibling") &&
          "ring-2 ring-sky-500 ring-offset-1",
        dragging && "opacity-55 shadow-lg z-50 ring-2 ring-slate-400/50",
      )}
    >
      {dropHighlight === "before-sibling" && (
        <div className="absolute -top-1 left-2 right-2 h-0.5 bg-sky-500 rounded z-30 pointer-events-none" />
      )}
      {dropHighlight === "after-sibling" && (
        <div className="absolute -bottom-1 left-2 right-2 h-0.5 bg-sky-500 rounded z-30 pointer-events-none" />
      )}
      {/* 折叠按钮 */}
      {hasChildren && !editing && (
        <button
          type="button"
          data-no-topic-drag
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse();
          }}
          className={cn(
            "absolute -right-3 top-1/2 -translate-y-1/2 z-10",
            "h-6 w-6 rounded-full bg-white border border-slate-300",
            "flex items-center justify-center hover:bg-slate-50",
            "shadow-sm",
          )}
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-slate-600" />
          )}
        </button>
      )}

      {/* 标记图标（XMind 风格）— 显示在标题正前方 */}
      {!editing &&
        ((node.markers && node.markers.length > 0) ||
          (node.labels && node.labels.length > 0) ||
          node.isFloating) && (
          <div className="flex flex-wrap items-center gap-1 mb-1">
            {node.isFloating && (
              <span
                className="inline-flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded bg-purple-100 text-purple-700 font-medium"
                title="浮动主题（不挂在任何分支下）"
              >
                <Move className="h-2.5 w-2.5" />
                浮动
              </span>
            )}
            {node.markers?.map((mid) => (
              <MarkerIcon key={mid} id={mid} size={14} />
            ))}
            {node.labels?.map((lb) => (
              <span
                key={lb}
                className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200"
                style={
                  isSkeleton
                    ? {
                        backgroundColor: theme.branchBg,
                        color: theme.branchText,
                        borderColor: theme.branchBorder,
                      }
                    : {
                        backgroundColor: theme.leafBg,
                        color: theme.branchText,
                      }
                }
              >
                {lb}
              </span>
            ))}
          </div>
        )}

      {/* 标题 / 行内编辑 */}
      {editing ? (
        <div className="relative">
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => {
              const v = e.currentTarget.value;
              setEditValue(v);
              refreshMention(v, e.currentTarget.selectionStart ?? v.length);
            }}
            onSelect={(e) => {
              const t = e.currentTarget;
              refreshMention(t.value, t.selectionStart ?? 0);
            }}
            onBlur={() => {
              setTimeout(() => {
                if (mentionState) return;
                onCommitEdit(editValue.trim(), "none");
              }, 120);
            }}
            onKeyDown={(e) => {
              if (mentionState && pickerRef.current?.handleKey(e)) {
                return;
              }
              if (e.key === "Enter") {
                e.preventDefault();
                const v = editValue.trim();
                if (e.shiftKey) {
                  onCommitEdit(v, "none");
                } else {
                  onCommitEdit(v, "sibling");
                }
              } else if (e.key === "Tab") {
                e.preventDefault();
                onCommitEdit(editValue.trim(), "child");
              } else if (e.key === "Escape") {
                e.preventDefault();
                onCancelEdit();
              }
              e.stopPropagation();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "w-full bg-white/90 rounded px-1 py-0.5 outline-none border-2",
              "font-medium text-sm",
              isSkeleton && node.timeBucketKind === "year" && "text-base",
              "text-brand-ink",
            )}
            style={{ ...titleStyle, borderColor: theme.accentRing }}
          />
          {mentionState && (
            <MentionPicker
              ref={pickerRef}
              users={users}
              query={mentionState.query}
              position={{ left: 0, top: 28 }}
              onPick={(u) => insertMention(u.name)}
              onCancel={() => setMentionState(null)}
            />
          )}
        </div>
      ) : (
        <div
          className={cn(
            "font-medium leading-snug",
            isSkeleton && node.timeBucketKind === "year"
              ? "text-base"
              : "text-sm",
          )}
          style={titleStyle}
        >
          {node.title ? (
            <MentionText text={node.title} users={users} />
          ) : (
            <span className="text-slate-400 italic">未命名</span>
          )}
        </div>
      )}

      {/* 任务节点显示进度条 + 状态 chip（编辑时不显示，避免拥挤） */}
      {node.task && !editing && (
        <div className="mt-1.5">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-1">
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
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded font-medium",
                  PRIORITY_COLOR[node.task.priority].chip,
                  PRIORITY_COLOR[node.task.priority].text,
                )}
              >
                {node.task.priority}
              </span>
            </div>
            <span className="text-[10px] text-slate-500 tabular-nums">
              {node.task.progressPct}%
            </span>
          </div>
          <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full",
                status === "blocked" ? "bg-rose-400" : "bg-blue-400",
                status === "done" && "bg-emerald-400",
              )}
              style={{ width: `${node.task.progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* 只读图标 */}
      {readOnly && !editing && (
        <Lock className="absolute top-1 right-1 h-3 w-3 text-slate-400" />
      )}

      {/* 笔记 / 超链接 指示器 */}
      {!editing && (node.notes || node.hyperlink) && (
        <div className="absolute -bottom-2 -right-2 flex items-center gap-1">
          {node.notes && (
            <span
              className="h-5 w-5 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center"
              title="包含笔记"
            >
              <StickyNote className="h-3 w-3 text-amber-700" />
            </span>
          )}
          {node.hyperlink && (
            <a
              href={node.hyperlink}
              target="_blank"
              rel="noreferrer"
              data-no-topic-drag
              onClick={(e) => e.stopPropagation()}
              className="h-5 w-5 rounded-full bg-sky-100 border border-sky-200 flex items-center justify-center hover:bg-sky-200"
              title={node.hyperlink}
            >
              <LinkIcon className="h-3 w-3 text-sky-700" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
