import { useState, type CSSProperties } from "react";
import {
  ChevronDown,
  GanttChartSquare,
  GitBranch,
  Layout,
  List,
  Network,
  Palette,
  Undo2,
  Redo2,
  Workflow,
  GitFork,
} from "lucide-react";
import type {
  MindMap,
  MindMapId,
  MindMapStructure,
  MindMapTheme,
} from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { THEMES } from "./theme";

export type ViewMode = "map" | "outline" | "gantt";

interface MindMapItem {
  id: MindMapId;
  label: string;
  badge?: string; // 可加 "演示" 之类的小标签
}

interface Props {
  // 当前图
  mindmap: MindMap;
  onChangeStructure: (s: MindMapStructure) => void;
  onChangeTheme: (t: MindMapTheme) => void;
  // 多图切换（可选）
  mindmapList?: MindMapItem[];
  onSwitchMindmap?: (id: MindMapId) => void;
  onRequestNewMindmap?: () => void;
  // 大纲切换
  viewMode: ViewMode;
  onChangeView: (m: ViewMode) => void;
  // 占位（暂未实现）
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

const STRUCTURE_OPTIONS: Array<{
  id: MindMapStructure;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: "right-logic",
    label: "向右逻辑图",
    desc: "经典的「年/季度/月」模板就是这种",
    icon: Workflow,
  },
  {
    id: "mindmap",
    label: "思维导图",
    desc: "中心向左右两侧放射",
    icon: Network,
  },
  {
    id: "org-chart",
    label: "组织架构图",
    desc: "自上而下的层级树",
    icon: GitFork,
  },
];

export default function MindMapToolbar({
  mindmap,
  onChangeStructure,
  onChangeTheme,
  mindmapList,
  onSwitchMindmap,
  onRequestNewMindmap,
  viewMode,
  onChangeView,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}: Props) {
  const [structureOpen, setStructureOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [mapsOpen, setMapsOpen] = useState(false);

  const currentStructure = mindmap.structure ?? "right-logic";
  const currentTheme = mindmap.theme ?? "snowbrush";
  const activeThemeDef = THEMES[currentTheme];
  const currentStructureDef = STRUCTURE_OPTIONS.find(
    (o) => o.id === currentStructure,
  );

  const closeAll = () => {
    setStructureOpen(false);
    setThemeOpen(false);
    setMapsOpen(false);
  };

  return (
    <div className="border-b border-border bg-white px-3 py-1.5 flex items-center gap-2 text-sm">
      {/* 多图切换 + 新建 */}
      {mindmapList && mindmapList.length > 0 && (
        <DropdownButton
          open={mapsOpen}
          onOpenChange={(v) => {
            closeAll();
            setMapsOpen(v);
          }}
          label={
            mindmapList.find((m) => m.id === mindmap.id)?.label ??
            "当前导图"
          }
          icon={<Layout className="h-3.5 w-3.5" />}
          panel={
            <div className="min-w-[240px]">
              {mindmapList.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    onSwitchMindmap?.(m.id);
                    setMapsOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-1.5 text-sm hover:bg-slate-50",
                    m.id === mindmap.id && "bg-slate-50 font-medium",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Layout className="h-3.5 w-3.5 text-slate-400" />
                    {m.label}
                  </span>
                  {m.badge && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                      {m.badge}
                    </span>
                  )}
                </button>
              ))}
              {onRequestNewMindmap && (
                <>
                  <div className="my-1 border-t border-border" />
                  <button
                    type="button"
                    onClick={() => {
                      onRequestNewMindmap();
                      setMapsOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm font-medium text-brand-orange hover:bg-orange-50/80"
                  >
                    + 新建导图…
                  </button>
                </>
              )}
            </div>
          }
        />
      )}

      <div className="w-px h-5 bg-border mx-1" />

      {/* 结构 */}
      <DropdownButton
        open={structureOpen}
        onOpenChange={(v) => {
          closeAll();
          setStructureOpen(v);
        }}
        label={currentStructureDef?.label ?? "结构"}
        icon={
          currentStructureDef ? (
            <currentStructureDef.icon className="h-3.5 w-3.5" />
          ) : (
            <Workflow className="h-3.5 w-3.5" />
          )
        }
        panel={
          <div className="min-w-[260px]">
            {STRUCTURE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => {
                  onChangeStructure(opt.id);
                  setStructureOpen(false);
                }}
                className={cn(
                  "w-full flex items-start gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50",
                  opt.id === currentStructure && "bg-slate-50",
                )}
              >
                <opt.icon className="h-4 w-4 mt-0.5 text-slate-500" />
                <div className="flex-1">
                  <div
                    className="font-medium"
                    style={
                      opt.id === currentStructure
                        ? { color: activeThemeDef.accentRing }
                        : undefined
                    }
                  >
                    {opt.label}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {opt.desc}
                  </div>
                </div>
              </button>
            ))}
            <div className="border-t border-border mt-1 px-3 py-2 text-[11px] text-slate-500 leading-relaxed">
              其它结构（树状图 / 时间轴 / 鱼骨图 / 矩阵）后续接入
            </div>
          </div>
        }
      />

      {/* 主题 */}
      <DropdownButton
        open={themeOpen}
        onOpenChange={(v) => {
          closeAll();
          setThemeOpen(v);
        }}
        label={THEMES[currentTheme].label}
        icon={
          <Palette
            className="h-3.5 w-3.5"
            style={{ color: activeThemeDef.rootText }}
          />
        }
        triggerStyle={{
          backgroundColor: activeThemeDef.rootBg,
          color: activeThemeDef.rootText,
          borderColor: activeThemeDef.rootBorder,
        }}
        panel={
          <div className="min-w-[220px]">
            {Object.values(THEMES).map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  onChangeTheme(t.id);
                  setThemeOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50",
                  t.id === currentTheme && "bg-slate-50 font-medium",
                )}
              >
                <span
                  className="h-5 w-5 rounded-full border"
                  style={{
                    backgroundColor: t.rootBg,
                    borderColor: t.rootBorder,
                  }}
                />
                <span
                  className="flex-1 text-left"
                  style={
                    t.id === currentTheme
                      ? { color: activeThemeDef.accentRing }
                      : undefined
                  }
                >
                  {t.label}
                </span>
                <span className="flex items-center gap-0.5">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: t.branchBg }}
                  />
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: t.edgeColor }}
                  />
                </span>
              </button>
            ))}
          </div>
        }
      />

      <div className="w-px h-5 bg-border mx-1" />

      {/* 大纲 / 思维导图 切换 */}
      <Button
        size="sm"
        variant={viewMode === "map" ? "default" : "outline"}
        onClick={() => onChangeView("map")}
      >
        <GitBranch className="h-3.5 w-3.5" />
        思维导图
      </Button>
      <Button
        size="sm"
        variant={viewMode === "outline" ? "default" : "outline"}
        onClick={() => onChangeView("outline")}
      >
        <List className="h-3.5 w-3.5" />
        大纲
      </Button>
      <Button
        size="sm"
        variant={viewMode === "gantt" ? "default" : "outline"}
        onClick={() => onChangeView("gantt")}
      >
        <GanttChartSquare className="h-3.5 w-3.5" />
        甘特图
      </Button>

      <div className="w-px h-5 bg-border mx-1" />

      {/* 撤销 / 重做 */}
      <Button
        size="sm"
        variant="outline"
        disabled={!canUndo}
        onClick={onUndo}
        title="撤销 (Ctrl/Cmd+Z)"
      >
        <Undo2 className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={!canRedo}
        onClick={onRedo}
        title="重做 (Ctrl/Cmd+Shift+Z)"
      >
        <Redo2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function DropdownButton({
  open,
  onOpenChange,
  label,
  icon,
  panel,
  triggerStyle,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  label: string;
  icon: React.ReactNode;
  panel: React.ReactNode;
  triggerStyle?: CSSProperties;
}) {
  const variant =
    triggerStyle != null ? "outline" : open ? "default" : "outline";
  return (
    <div className="relative">
      <Button
        size="sm"
        variant={variant}
        onClick={() => onOpenChange(!open)}
        className={cn("gap-1", triggerStyle && "border-2")}
        style={triggerStyle}
      >
        {icon}
        <span className="text-xs">{label}</span>
        <ChevronDown className="h-3 w-3" />
      </Button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => onOpenChange(false)}
          />
          <div className="absolute z-40 mt-1 left-0 bg-white border border-border rounded-md shadow-lg overflow-hidden py-1">
            {panel}
          </div>
        </>
      )}
    </div>
  );
}
