import { useEffect, useMemo, useState } from "react";
import { LayoutGrid } from "lucide-react";
import {
  MINDMAP_TEMPLATE_CATALOG,
  type MindMapTemplateId,
  suggestedTitleForMindmapTemplate,
} from "@/lib/mindmapFactory";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (templateId: MindMapTemplateId, title: string) => void;
}

export default function NewMindMapDialog({
  open,
  onOpenChange,
  onCreate,
}: Props) {
  const year = useMemo(() => new Date().getFullYear(), []);
  const [templateId, setTemplateId] = useState<MindMapTemplateId>("annual");
  const [title, setTitle] = useState(() =>
    suggestedTitleForMindmapTemplate("annual", year),
  );

  useEffect(() => {
    if (!open) return;
    setTemplateId("annual");
    setTitle(suggestedTitleForMindmapTemplate("annual", year));
  }, [open, year]);

  const pickTemplate = (id: MindMapTemplateId) => {
    setTemplateId(id);
    setTitle(suggestedTitleForMindmapTemplate(id, year));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>新建导图</DialogTitle>
          <DialogDescription>
            选择模板（参考 XMind
            模板库分类）。新建后的导图与现有导图功能一致，可随时切换结构与主题。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="text-sm font-medium text-foreground">导图名称</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：2026 个人计划"
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium text-foreground flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-muted-foreground" />
            选择模板
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {MINDMAP_TEMPLATE_CATALOG.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => pickTemplate(t.id)}
                className={cn(
                  "rounded-lg border p-3 text-left text-sm transition-colors",
                  "hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  templateId === t.id
                    ? "border-brand-orange bg-orange-50/80 ring-1 ring-brand-orange/40"
                    : "border-border bg-white",
                )}
              >
                <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                  {t.category}
                </div>
                <div className="font-medium text-foreground">{t.label}</div>
                <div className="text-xs text-muted-foreground mt-1 leading-snug">
                  {t.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            type="button"
            onClick={() => {
              const trimmed = title.trim();
              if (!trimmed) return;
              onCreate(templateId, trimmed);
            }}
            disabled={!title.trim()}
          >
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
