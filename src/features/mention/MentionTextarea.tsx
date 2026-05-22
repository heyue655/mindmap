import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useStore } from "@/store/StoreProvider";
import { detectActiveMention } from "@/lib/mention";
import MentionPicker, {
  type MentionPickerHandle,
} from "./MentionPicker";

interface Props {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  disabled?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
  /** 选中某人后回调（用于上层立即派生 mention 通知/事件等）*/
  onMention?: (userId: string) => void;
  inputRef?: React.RefObject<HTMLTextAreaElement>;
}

/**
 * 一个支持 @ 提及的 textarea：
 * - 输入 @ 时弹出 MentionPicker，可用 ↑↓ 键 + Enter/Tab 选中
 * - 选中后插入 "@姓名 "
 *
 * 注意：picker 的 Enter 会拦截掉常规 Enter，调用方如果还想监听 Enter（比如提交日志），
 * 需要在 onKeyDown 里自己判断 picker 是否打开（picker 打开时不要响应）。
 *
 * 通过 `useMentionPickerOpen` ref 暴露状态，但本组件已自带处理，调用方一般不需要关心。
 */
export default function MentionTextarea({
  value,
  onChange,
  placeholder,
  rows,
  className,
  disabled,
  onKeyDown,
  onBlur,
  onMention,
  inputRef,
}: Props) {
  const { users } = useStore();
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const taRef = inputRef ?? internalRef;

  const [active, setActive] = useState<{
    query: string;
    atIndex: number;
    pos: { left: number; top: number };
  } | null>(null);
  const pickerRef = useRef<MentionPickerHandle>(null);

  const refreshPicker = (next: string, caret: number) => {
    const m = detectActiveMention(next, caret);
    if (!m) {
      setActive(null);
      return;
    }
    const ta = taRef.current;
    let pos = { left: 0, top: 0 };
    if (ta) {
      // 简化：把 picker 浮在 textarea 下方左侧；不做精确光标定位
      pos = { left: 8, top: ta.offsetHeight + 4 };
    }
    setActive({ query: m.query, atIndex: m.atIndex, pos });
  };

  const insertMention = (name: string) => {
    if (!active) return;
    const ta = taRef.current;
    const caret = ta?.selectionStart ?? value.length;
    const before = value.slice(0, active.atIndex);
    const after = value.slice(caret);
    const insertion = `@${name} `;
    const next = before + insertion + after;
    onChange(next);
    setActive(null);
    requestAnimationFrame(() => {
      const t = taRef.current;
      if (!t) return;
      const newCaret = before.length + insertion.length;
      t.focus();
      t.setSelectionRange(newCaret, newCaret);
    });
  };

  // 失焦后过一会儿关闭 picker（让点击 picker 来得及）
  useEffect(() => {
    return () => setActive(null);
  }, []);

  return (
    <div className="relative">
      <Textarea
        ref={taRef}
        value={value}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className={cn("resize-none", className)}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v);
          const caret = e.target.selectionStart ?? v.length;
          refreshPicker(v, caret);
        }}
        onSelect={(e) => {
          const t = e.target as HTMLTextAreaElement;
          refreshPicker(t.value, t.selectionStart ?? 0);
        }}
        onClick={(e) => {
          const t = e.target as HTMLTextAreaElement;
          refreshPicker(t.value, t.selectionStart ?? 0);
        }}
        onKeyDown={(e) => {
          if (active && pickerRef.current?.handleKey(e)) {
            return;
          }
          onKeyDown?.(e);
        }}
        onBlur={(e) => {
          // 延迟关闭，让 onMouseDown 拦截能先生效
          setTimeout(() => setActive(null), 150);
          onBlur?.(e);
        }}
      />
      {active && (
        <MentionPicker
          ref={pickerRef}
          users={users}
          query={active.query}
          position={active.pos}
          onPick={(u) => {
            insertMention(u.name);
            onMention?.(u.id);
          }}
          onCancel={() => setActive(null)}
        />
      )}
    </div>
  );
}
