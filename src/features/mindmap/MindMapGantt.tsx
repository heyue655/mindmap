import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
} from "date-fns";
import {
  ChevronDown,
  ChevronRight,
  GanttChartSquare,
  Link2,
  Minus,
  Plus,
  Printer,
  Upload,
} from "lucide-react";
import type { MindMapTheme, Node, NodeId, TaskFields, User } from "@/types";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { getTheme } from "./theme";
import {
  buildGanttRows,
  eachDay,
  ganttTimelineBounds,
  type GanttRow,
} from "@/lib/ganttFromMindmap";

const ROW_H = 40;

interface Props {
  mindmapId: string;
  rootNodeId: NodeId;
  nodes: Node[];
  users: User[];
  themeId?: MindMapTheme | null;
  selectedNodeId?: NodeId | null;
  onSelectNode?: (id: NodeId | null) => void;
  onUpdateTask: (nodeId: NodeId, patch: Partial<TaskFields>) => void;
}

export default function MindMapGantt({
  mindmapId,
  rootNodeId,
  nodes,
  users,
  themeId,
  selectedNodeId,
  onSelectNode,
  onUpdateTask,
}: Props) {
  const theme = useMemo(() => getTheme(themeId), [themeId]);
  const [collapsed, setCollapsed] = useState<Set<NodeId>>(() => new Set());
  const [pxPerDay, setPxPerDay] = useState(32);
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);
  const syncingX = useRef(false);

  const rows = useMemo(
    () => buildGanttRows(nodes, mindmapId, rootNodeId, collapsed),
    [nodes, mindmapId, rootNodeId, collapsed],
  );

  const bounds = useMemo(() => ganttTimelineBounds(rows), [rows]);
  const days = useMemo(
    () => eachDay(bounds.start, bounds.days),
    [bounds.start, bounds.days],
  );

  const monthSegments = useMemo(() => {
    const segs: { label: string; span: number }[] = [];
    let i = 0;
    while (i < days.length) {
      const d0 = days[i];
      const label = format(d0, "yyyy年M月");
      let span = 1;
      while (
        i + span < days.length &&
        format(days[i + span], "yyyy年M月") === label
      ) {
        span++;
      }
      segs.push({ label, span });
      i += span;
    }
    return segs;
  }, [days]);

  const timelineWidth = days.length * pxPerDay;

  const syncScroll = useCallback((fromLeft: boolean) => {
    const L = leftScrollRef.current;
    const R = rightScrollRef.current;
    if (!L || !R) return;
    syncing.current = true;
    if (fromLeft) R.scrollTop = L.scrollTop;
    else L.scrollTop = R.scrollTop;
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  }, []);

  const onLeftScroll = () => {
    if (syncing.current) return;
    syncScroll(true);
  };
  const onRightScroll = () => {
    if (syncing.current) return;
    syncScroll(false);
    if (syncingX.current) return;
    const R = rightScrollRef.current;
    const H = headerScrollRef.current;
    if (R && H && H.scrollLeft !== R.scrollLeft) {
      syncingX.current = true;
      H.scrollLeft = R.scrollLeft;
      requestAnimationFrame(() => {
        syncingX.current = false;
      });
    }
  };
  const onHeaderScroll = () => {
    if (syncingX.current) return;
    const R = rightScrollRef.current;
    const H = headerScrollRef.current;
    if (R && H && H.scrollLeft !== R.scrollLeft) {
      syncingX.current = true;
      R.scrollLeft = H.scrollLeft;
      requestAnimationFrame(() => {
        syncingX.current = false;
      });
    }
  };

  const toggleCollapse = (id: NodeId) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const barLeftWidth = (row: GanttRow) => {
    const offset = differenceInCalendarDays(
      parseISO(row.startStr),
      bounds.start,
    );
    const left = offset * pxPerDay;
    const width = row.durationDays * pxPerDay;
    return { left: Math.max(0, left), width: Math.max(4, width) };
  };

  const commitDates = (row: GanttRow, startStr: string, durationDays: number) => {
    if (durationDays < 1) return;
    const end = format(addDays(parseISO(startStr), durationDays - 1), "yyyy-MM-dd");
    onUpdateTask(row.nodeId, {
      ganttStart: startStr,
      ganttDurationDays: durationDays,
      deadline: end,
    });
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-white rounded-lg border border-border overflow-hidden">
      <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-slate-50/80">
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-ink">
          <GanttChartSquare className="h-4 w-4" style={{ color: theme.accentRing }} />
          甘特图
          <span className="text-xs font-normal text-slate-500">
            （导图内已设为任务的节点 · 共 {rows.length} 条）
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 text-slate-500">
            <Button size="icon" variant="ghost" className="h-8 w-8" disabled title="依赖关系（占位）">
              <Link2 className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" disabled title="导出（占位）">
              <Upload className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" disabled title="打印（占位）">
              <Printer className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex items-center gap-2 w-[140px]">
            <Minus className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <Slider
              value={[pxPerDay]}
              min={16}
              max={56}
              step={4}
              onValueChange={(v) => setPxPerDay(v[0] ?? 32)}
              className="flex-1"
            />
            <Plus className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-sm text-slate-500 gap-2 p-8">
          <p>当前导图下还没有「任务」节点。</p>
          <p className="text-xs text-slate-400">
            在思维导图中为节点开启任务后，将自动出现在此处。
          </p>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0">
          {/* 左侧表头 + 列 */}
          <div className="w-[min(100%,380px)] sm:w-[380px] shrink-0 flex flex-col border-r border-border min-w-0">
            <div className="grid grid-cols-[1fr_108px_52px] gap-0 border-b border-border bg-slate-100 text-[11px] font-semibold text-slate-600 shrink-0 h-16 items-end">
              <div className="px-2 pb-2 truncate">任务名称</div>
              <div className="px-1 pb-2 truncate">开始日期</div>
              <div className="px-1 pb-2 text-center truncate">时长</div>
            </div>
            <div
              ref={leftScrollRef}
              className="overflow-y-auto overflow-x-hidden flex-1 min-h-0"
              onScroll={onLeftScroll}
            >
              {rows.map((row) => (
                <GanttLeftRow
                  key={row.nodeId}
                  row={row}
                  editable={row.barKind !== "group"}
                  selected={selectedNodeId === row.nodeId}
                  collapsed={collapsed.has(row.nodeId)}
                  onToggleCollapse={() => toggleCollapse(row.nodeId)}
                  onSelect={() => onSelectNode?.(row.nodeId)}
                  onCommit={(start, dur) => commitDates(row, start, dur)}
                />
              ))}
            </div>
          </div>

          {/* 右侧时间轴 */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            <div
              ref={headerScrollRef}
              className="shrink-0 overflow-x-auto border-b border-border bg-slate-50"
              onScroll={onHeaderScroll}
            >
              <div style={{ width: timelineWidth, minWidth: "100%" }}>
                <div className="flex h-8 border-b border-slate-200/80">
                  {monthSegments.map((seg, i) => (
                    <div
                      key={`${seg.label}-${i}`}
                      className="text-center text-[11px] font-medium text-slate-700 flex items-center justify-center border-r border-slate-200/80 bg-slate-100/90"
                      style={{ width: seg.span * pxPerDay }}
                    >
                      {seg.label}
                    </div>
                  ))}
                </div>
                <div className="flex h-8">
                  {days.map((d) => (
                    <div
                      key={d.toISOString()}
                      className="shrink-0 text-center text-[10px] text-slate-600 border-r border-slate-200/60 flex items-center justify-center"
                      style={{ width: pxPerDay }}
                    >
                      {format(d, "d")}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div
              ref={rightScrollRef}
              className="flex-1 overflow-auto min-h-0"
              onScroll={onRightScroll}
            >
              <div
                className="relative"
                style={{
                  width: timelineWidth,
                  minHeight: rows.length * ROW_H,
                  minWidth: "100%",
                }}
              >
                {/* 竖线网格 */}
                <div className="absolute inset-0 flex pointer-events-none">
                  {days.map((d) => (
                    <div
                      key={`g-${d.toISOString()}`}
                      className="shrink-0 border-r border-slate-100 h-full"
                      style={{ width: pxPerDay }}
                    />
                  ))}
                </div>
                {/* 横条斑马纹 + 条 */}
                {rows.map((row, idx) => {
                  const { left, width } = barLeftWidth(row);
                  const owner = users.find((u) => u.id === row.ownerId);
                  const isGroup = row.barKind === "group";
                  return (
                    <div
                      key={row.nodeId}
                      className={cn(
                        "absolute left-0 right-0 border-b border-slate-100 flex items-center",
                        idx % 2 === 1 && "bg-slate-50/50",
                        selectedNodeId === row.nodeId && "bg-orange-50/40",
                      )}
                      style={{ top: idx * ROW_H, height: ROW_H }}
                      onClick={() => onSelectNode?.(row.nodeId)}
                      role="row"
                    >
                      <div
                        className={cn(
                          "absolute h-7 rounded-md flex items-center px-2 text-[11px] font-medium text-white shadow-sm cursor-pointer overflow-hidden whitespace-nowrap border",
                          isGroup
                            ? "border-violet-400/80"
                            : "border-black/10",
                        )}
                        style={{
                          left,
                          width,
                          backgroundColor: isGroup ? "#a78bfa" : theme.rootBg,
                          color: isGroup ? "#1e1b4b" : theme.rootText,
                        }}
                        title={`${row.title} · ${row.startStr} → ${row.endStr}`}
                      >
                        {!isGroup && owner && (
                          <span className="mr-1.5 shrink-0">
                            <Avatar size="sm" className="h-5 w-5 text-[10px]">
                              {owner.avatar ?? owner.name.slice(0, 1)}
                            </Avatar>
                          </span>
                        )}
                        <span className="truncate">{row.title}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GanttLeftRow({
  row,
  editable,
  selected,
  collapsed,
  onToggleCollapse,
  onSelect,
  onCommit,
}: {
  row: GanttRow;
  editable: boolean;
  selected: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelect: () => void;
  onCommit: (start: string, dur: number) => void;
}) {
  const [startDraft, setStartDraft] = useState(row.startStr);
  const [durDraft, setDurDraft] = useState(String(row.durationDays));

  useEffect(() => {
    setStartDraft(row.startStr);
    setDurDraft(String(row.durationDays));
  }, [row.startStr, row.durationDays, row.nodeId]);

  const startLabel = format(parseISO(row.startStr), "yyyy年M月d日");

  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_108px_52px] gap-0 items-center border-b border-slate-100 text-xs min-h-[40px]",
        row.depth % 2 === 1 && "bg-slate-50/40",
        selected && "bg-orange-50/50",
      )}
      onClick={onSelect}
    >
      <div
        className="flex items-center gap-0.5 min-w-0 pl-1 py-1"
        style={{ paddingLeft: 6 + row.depth * 14 }}
      >
        {row.canCollapse ? (
          <button
            type="button"
            className="p-0.5 rounded hover:bg-slate-200/80 shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse();
            }}
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
            )}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <span className="truncate font-medium text-slate-800">{row.title}</span>
      </div>
      <div className="px-1 py-1">
        {editable ? (
          <>
            <div className="text-[10px] text-slate-500 sm:hidden truncate">{startLabel}</div>
            <Input
              type="date"
              className="h-7 text-[10px] px-1"
              value={startDraft}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setStartDraft(e.target.value)}
              onBlur={() => {
                const d = parseInt(durDraft, 10);
                if (startDraft && !Number.isNaN(d) && d > 0) onCommit(startDraft, d);
              }}
            />
          </>
        ) : (
          <div className="h-7 flex items-center text-[10px] text-slate-600 px-0.5 truncate" title="汇总行：日期由子任务自动计算">
            {startLabel}
          </div>
        )}
      </div>
      <div className="px-1 py-1">
        {editable ? (
          <Input
            type="number"
            min={1}
            className="h-7 text-[10px] px-1 text-center"
            value={durDraft}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDurDraft(e.target.value)}
            onBlur={() => {
              const d = parseInt(durDraft, 10);
              if (startDraft && !Number.isNaN(d) && d > 0) onCommit(startDraft, d);
            }}
          />
        ) : (
          <div className="h-7 flex items-center justify-center text-[10px] text-slate-600">
            {row.durationDays}
          </div>
        )}
      </div>
    </div>
  );
}
