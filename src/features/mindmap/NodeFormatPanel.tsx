import { useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  Mic,
  LayoutGrid,
  RotateCcw,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { MindMapStructure, Node, NodeTopicFormat } from "@/types";

const FONT_OPTIONS: { value: string; label: string }[] = [
  { value: "__default", label: "默认（继承主题）" },
  { value: "Inter, ui-sans-serif, system-ui, sans-serif", label: "Inter" },
  { value: '"Audiowide", ui-sans-serif, system-ui, sans-serif', label: "Audiowide" },
  { value: "Georgia, ui-serif, serif", label: "Georgia 衬线" },
  { value: "ui-monospace, SFMono-Regular, monospace", label: "等宽" },
];

const BORDER_PRESET_TO_PX: Record<string, number | undefined> = {
  __inherit: undefined,
  none: 0,
  thin: 1,
  medium: 2,
  thick: 3,
};

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 px-3 py-2 text-left text-xs font-semibold text-slate-700 bg-slate-50/80 hover:bg-slate-100/90"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        )}
        {title}
      </button>
      {open && <div className="px-3 pb-3 pt-1 space-y-3">{children}</div>}
    </div>
  );
}

function structureLabel(s: MindMapStructure | undefined): string {
  if (s === "mindmap") return "思维导图（中心放射）";
  if (s === "org-chart") return "组织架构图";
  return "向右逻辑图";
}

interface Props {
  node: Node;
  mindmapStructure?: MindMapStructure;
  writable: boolean;
  onPatch: (patch: Partial<NodeTopicFormat>) => void;
  onClearFormat: () => void;
}

export default function NodeFormatPanel({
  node,
  mindmapStructure,
  writable,
  onPatch,
  onClearFormat,
}: Props) {
  const tf = node.topicFormat ?? {};
  const [styleSubTab, setStyleSubTab] = useState<"look" | "present" | "canvas">(
    "look",
  );

  const topicKind = useMemo(() => {
    if (node.isFloating) return "自由主题";
    if (!node.parentId) return "中心主题";
    return "分支主题";
  }, [node]);

  const borderPreset = useMemo(() => {
    const w = tf.borderWidthPx;
    if (w === undefined) return "__inherit";
    if (w <= 0) return "none";
    if (w === 1) return "thin";
    if (w === 2) return "medium";
    return "thick";
  }, [tf.borderWidthPx]);

  if (!writable) {
    return (
      <div className="px-4 py-6 text-xs text-slate-500">
        你对此节点没有写权限，无法调整样式。
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex border-b border-border bg-white shrink-0 px-2 pt-2 gap-1">
        {(
          [
            ["look", "样式", null],
            ["present", "演说", Mic],
            ["canvas", "画布", LayoutGrid],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setStyleSubTab(key)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1 py-2 text-[11px] font-medium rounded-t-md border-b-2 -mb-px transition-colors",
              styleSubTab === key
                ? "border-brand-orange text-brand-ink bg-slate-50"
                : "border-transparent text-slate-500 hover:text-slate-700",
            )}
          >
            {Icon && <Icon className="h-3 w-3" />}
            {label}
          </button>
        ))}
      </div>

      {styleSubTab === "present" && (
        <div className="p-4 text-xs text-slate-600 space-y-2">
          <p className="font-medium text-slate-800">演说模式</p>
          <p>原型阶段暂不实现幻灯片步进；后续可在此配置节点演说顺序与备注。</p>
        </div>
      )}

      {styleSubTab === "canvas" && (
        <div className="p-4 text-xs text-slate-600 space-y-2">
          <p className="font-medium text-slate-800">画布</p>
          <p>
            缩放、平移、适应画布请使用导图左下角的视图工具；导图结构（向右 /
            放射 / 组织图）请在顶部工具栏切换。
          </p>
        </div>
      )}

      {styleSubTab === "look" && (
        <div className="space-y-0">
          <div className="px-3 py-2 border-b border-border bg-amber-50/60">
            <div className="h-9 px-3 flex items-center rounded-md text-xs font-medium bg-brand-yellow/90 border border-brand-yellow text-brand-ink shadow-sm">
              {topicKind}
              <ChevronDown className="h-4 w-4 ml-auto opacity-60 shrink-0" />
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              由节点在导图中的位置自动判定（演示）
            </p>
          </div>

          <Section title="形状">
            <div className="grid gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">外形</Label>
                <Select
                  value={tf.shape ?? "__default"}
                  onValueChange={(v) =>
                    onPatch({
                      shape:
                        v === "__default"
                          ? undefined
                          : (v as NodeTopicFormat["shape"]),
                    })
                  }
                >
                  <SelectTrigger className="h-8 text-xs mt-0.5">
                    <SelectValue placeholder="圆角矩形" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default">跟随默认（圆角）</SelectItem>
                    <SelectItem value="rounded">大圆角</SelectItem>
                    <SelectItem value="rect">矩形</SelectItem>
                    <SelectItem value="pill">胶囊</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">填充</Label>
                  <Input
                    type="color"
                    className="h-8 mt-0.5 p-0 border cursor-pointer"
                    value={tf.fillColor || "#fbbf24"}
                    onChange={(e) => onPatch({ fillColor: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">边框色</Label>
                  <Input
                    type="color"
                    className="h-8 mt-0.5 p-0 border cursor-pointer"
                    value={tf.borderColor || "#f59e0b"}
                    onChange={(e) => onPatch({ borderColor: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">边框粗细</Label>
                <Select
                  value={borderPreset}
                  onValueChange={(v) => {
                    const px = BORDER_PRESET_TO_PX[v];
                    onPatch({ borderWidthPx: px });
                  }}
                >
                  <SelectTrigger className="h-8 text-xs mt-0.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__inherit">跟随默认</SelectItem>
                    <SelectItem value="none">无</SelectItem>
                    <SelectItem value="thin">细</SelectItem>
                    <SelectItem value="medium">中等</SelectItem>
                    <SelectItem value="thick">粗</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Section>

          <Section title="宽度">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label className="text-[10px] text-muted-foreground">像素</Label>
                <Input
                  type="number"
                  min={120}
                  max={480}
                  className="h-8 text-xs mt-0.5"
                  value={tf.widthPx ?? ""}
                  placeholder="默认 ~200"
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") onPatch({ widthPx: undefined });
                    else {
                      const n = Number(v);
                      if (!Number.isNaN(n)) onPatch({ widthPx: n });
                    }
                  }}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 text-xs h-8"
                onClick={() => onPatch({ widthPx: undefined })}
              >
                适应
              </Button>
            </div>
          </Section>

          <Section title="文本">
            <div className="space-y-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">字体</Label>
                <Select
                  value={tf.fontFamily ? tf.fontFamily : "__default"}
                  onValueChange={(v) =>
                    onPatch({
                      fontFamily: v === "__default" ? undefined : v,
                    })
                  }
                >
                  <SelectTrigger className="h-8 text-xs mt-0.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FONT_OPTIONS.map((f) => (
                      <SelectItem key={f.value || "d"} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">字号</Label>
                  <Select
                    value={String(tf.fontSizePx ?? "__default")}
                    onValueChange={(v) =>
                      onPatch({
                        fontSizePx:
                          v === "__default" ? undefined : Number(v),
                      })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs mt-0.5">
                      <SelectValue placeholder="默认" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default">默认</SelectItem>
                      {[12, 14, 16, 18, 20, 24].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">字重</Label>
                  <Select
                    value={tf.fontWeight ?? "__default"}
                    onValueChange={(v) =>
                      onPatch({
                        fontWeight:
                          v === "__default"
                            ? undefined
                            : (v as NodeTopicFormat["fontWeight"]),
                      })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs mt-0.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default">默认</SelectItem>
                      <SelectItem value="normal">常规</SelectItem>
                      <SelectItem value="bold">粗体</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">文字色</Label>
                <Input
                  type="color"
                  className="h-8 mt-0.5 p-0 border cursor-pointer"
                  value={tf.textColor || "#1e293b"}
                  onChange={(e) => onPatch({ textColor: e.target.value })}
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    ["bold", "B", () => onPatch({ fontWeight: tf.fontWeight === "bold" ? undefined : "bold" })],
                    ["italic", "I", () => onPatch({ italic: !tf.italic })],
                    ["strike", "S", () => onPatch({ strikethrough: !tf.strikethrough })],
                    ["under", "U", () => onPatch({ underline: !tf.underline })],
                  ] as const
                ).map(([id, sym, fn]) => (
                  <Button
                    key={id}
                    type="button"
                    variant={
                      (id === "bold" && tf.fontWeight === "bold") ||
                      (id === "italic" && tf.italic) ||
                      (id === "strike" && tf.strikethrough) ||
                      (id === "under" && tf.underline)
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    className="h-7 w-7 p-0 text-xs font-bold"
                    onClick={fn}
                  >
                    {sym}
                  </Button>
                ))}
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">对齐</Label>
                <div className="flex gap-1 mt-0.5">
                  {(
                    [
                      ["left", "左"],
                      ["center", "中"],
                      ["right", "右"],
                    ] as const
                  ).map(([al, lab]) => {
                    const active =
                      tf.textAlign === al ||
                      (al === "left" && tf.textAlign === undefined);
                    return (
                      <Button
                        key={al}
                        type="button"
                        size="sm"
                        variant={active ? "default" : "outline"}
                        className="flex-1 text-xs h-7"
                        onClick={() =>
                          onPatch({
                            textAlign:
                              al === "left"
                                ? undefined
                                : (al as NodeTopicFormat["textAlign"]),
                          })
                        }
                      >
                        {lab}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
          </Section>

          <Section title="结构">
            <div className="text-xs text-slate-600 space-y-1">
              <p>
                <span className="text-muted-foreground">当前导图结构：</span>
                {structureLabel(mindmapStructure)}
              </p>
              <p className="text-[10px] text-slate-400">
                修改结构请使用画布上方工具栏中的「结构」下拉菜单。
              </p>
            </div>
          </Section>

          <Section title="分支">
            <div className="space-y-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">线条样式</Label>
                <Select
                  value={tf.branchDash === "6 4" ? "dashed" : "solid"}
                  onValueChange={(v) =>
                    onPatch({
                      branchDash: v === "dashed" ? "6 4" : undefined,
                    })
                  }
                >
                  <SelectTrigger className="h-8 text-xs mt-0.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="solid">实线</SelectItem>
                    <SelectItem value="dashed">虚线</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">线宽</Label>
                <Select
                  value={String(tf.branchWidthPx ?? "__default")}
                  onValueChange={(v) => {
                    if (v === "__default") onPatch({ branchWidthPx: undefined });
                    else onPatch({ branchWidthPx: Number(v) });
                  }}
                >
                  <SelectTrigger className="h-8 text-xs mt-0.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default">默认</SelectItem>
                    <SelectItem value="1">细 · 1</SelectItem>
                    <SelectItem value="1.6">中 · 1.6</SelectItem>
                    <SelectItem value="2.4">粗 · 2.4</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">分支颜色</Label>
                <Input
                  type="color"
                  className="h-8 mt-0.5 p-0 border cursor-pointer"
                  value={tf.branchColor || "#94a3b8"}
                  onChange={(e) => onPatch({ branchColor: e.target.value })}
                />
              </div>
            </div>
          </Section>

          <div className="p-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full text-xs gap-1"
              onClick={onClearFormat}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              清除本节点自定义样式
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
