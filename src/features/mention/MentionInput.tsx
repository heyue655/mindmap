import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
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
  className?: string;
  disabled?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onMention?: (userId: string) => void;
  inputRef?: React.RefObject<HTMLInputElement>;
}

/**
 * 一个支持 @ 提及的单行输入框（input 版本）。逻辑与 MentionTextarea 相同。
 */
export default function MentionInput({
  value,
  onChange,
  placeholder,
  className,
  disabled,
  onKeyDown,
  onBlur,
  onMention,
  inputRef,
}: Props) {
  const { users } = useStore();
  const internalRef = useRef<HTMLInputElement>(null);
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
    if (ta) pos = { left: 4, top: ta.offsetHeight + 4 };
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

  useEffect(() => {
    return () => setActive(null);
  }, []);

  return (
    <div className="relative">
      <Input
        ref={taRef}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(className)}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v);
          const caret = e.target.selectionStart ?? v.length;
          refreshPicker(v, caret);
        }}
        onSelect={(e) => {
          const t = e.target as HTMLInputElement;
          refreshPicker(t.value, t.selectionStart ?? 0);
        }}
        onClick={(e) => {
          const t = e.target as HTMLInputElement;
          refreshPicker(t.value, t.selectionStart ?? 0);
        }}
        onKeyDown={(e) => {
          if (active && pickerRef.current?.handleKey(e)) return;
          onKeyDown?.(e);
        }}
        onBlur={(e) => {
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
