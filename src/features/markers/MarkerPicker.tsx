import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  MARKER_CATEGORIES,
  markersOfCategory,
  MarkerIcon,
  toggleMarker,
} from "./markers";
import type { MarkerCategory } from "./markers";

interface Props {
  value: string[]; // 当前节点已有的 marker ids
  onChange: (next: string[]) => void;
  // 渲染形态：
  // - "panel" 直接平铺整张面板（嵌入在抽屉里）
  // - "popover" 浮层形态（带边框/阴影/最大高度），需要外部包一层定位容器
  variant?: "panel" | "popover";
  // popover 时点击外部关闭
  onClose?: () => void;
}

export default function MarkerPicker({
  value,
  onChange,
  variant = "panel",
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (variant !== "popover" || !onClose) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Element)) {
        onClose?.();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [variant, onClose]);

  const handleClick = (id: string) => {
    onChange(toggleMarker(value, id));
  };

  const handleClearAll = () => {
    onChange([]);
  };

  return (
    <div
      ref={ref}
      className={cn(
        "bg-white",
        variant === "popover" &&
          "rounded-lg border border-border shadow-lg w-72 max-h-[480px] overflow-y-auto",
      )}
    >
      <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
        <span className="text-xs font-semibold text-brand-ink">标记</span>
        {value.length > 0 && (
          <button
            type="button"
            className="text-[11px] text-rose-600 hover:text-rose-700"
            onClick={handleClearAll}
          >
            清空 ({value.length})
          </button>
        )}
      </div>

      <div className="px-3 py-2 space-y-3">
        {MARKER_CATEGORIES.map((cat) => (
          <Section
            key={cat.id}
            categoryId={cat.id}
            label={cat.label}
            value={value}
            onPick={handleClick}
          />
        ))}
      </div>
    </div>
  );
}

function Section({
  categoryId,
  label,
  value,
  onPick,
}: {
  categoryId: MarkerCategory;
  label: string;
  value: string[];
  onPick: (id: string) => void;
}) {
  const items = markersOfCategory(categoryId);
  return (
    <div>
      <div className="text-[11px] font-medium text-slate-500 mb-1.5 flex items-center gap-1">
        <span className="text-slate-400">▼</span>
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((m) => {
          const active = value.includes(m.id);
          return (
            <button
              key={m.id}
              type="button"
              title={m.label}
              onClick={() => onPick(m.id)}
              className={cn(
                "h-7 w-7 rounded flex items-center justify-center transition-colors",
                "hover:bg-slate-100",
                active && "bg-brand-orange/15 ring-2 ring-brand-orange/60",
              )}
            >
              <MarkerIcon id={m.id} size={18} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
