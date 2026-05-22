import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { User } from "@/types";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface Props {
  users: User[];
  /** 当前正在输入的查询串（@ 后面的部分，不含 @）*/
  query: string;
  /** 浮层的位置（屏幕坐标，左上）。如果不传则相对父容器铺开 */
  position?: { left: number; top: number };
  /** 用户从浮层中确认选中（点击 / Enter / Tab）*/
  onPick: (user: User) => void;
  /** 用户取消（Esc）*/
  onCancel: () => void;
}

export interface MentionPickerHandle {
  /** 返回 true 表示该按键已被消费 */
  handleKey: (e: React.KeyboardEvent) => boolean;
}

/**
 * 浮层 mention 选择器：
 * - 自动按 query 过滤候选（按 name / employeeNo 模糊）
 * - 支持上下键、Enter / Tab 选中、Esc 取消
 * - 浮层本体不抢焦点，键盘事件由调用方在 input/textarea 上转发
 */
const MentionPicker = forwardRef<MentionPickerHandle, Props>(function MentionPicker(
  { users, query, position, onPick, onCancel },
  ref,
) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const arr = users.filter((u) => u.status === "active");
    if (!q) return arr.slice(0, 8);
    return arr
      .filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.employeeNo.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [users, query]);

  const [active, setActive] = useState(0);

  useEffect(() => {
    setActive(0);
  }, [query]);

  // 把 active clamp 到合法范围
  useEffect(() => {
    if (active >= filtered.length) setActive(Math.max(0, filtered.length - 1));
  }, [filtered, active]);

  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useImperativeHandle(
    ref,
    () => ({
      handleKey(e: React.KeyboardEvent): boolean {
        if (filtered.length === 0) {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
            return true;
          }
          return false;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setActive((p) => (p + 1) % filtered.length);
          return true;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setActive((p) => (p - 1 + filtered.length) % filtered.length);
          return true;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          const u = filtered[active];
          if (u) onPick(u);
          return true;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
          return true;
        }
        return false;
      },
    }),
    [filtered, active, onPick, onCancel],
  );

  if (filtered.length === 0) {
    return (
      <div
        className="absolute z-[60] bg-white border border-border rounded-md shadow-lg px-3 py-2 text-xs text-slate-500"
        style={position ? { left: position.left, top: position.top } : undefined}
        onMouseDown={(e) => e.preventDefault()}
      >
        没有匹配的人
      </div>
    );
  }

  return (
    <div
      className="absolute z-[60] bg-white border border-border rounded-md shadow-lg py-1 min-w-[220px] max-h-64 overflow-y-auto"
      style={position ? { left: position.left, top: position.top } : undefined}
      onMouseDown={(e) => e.preventDefault()}
      data-canvas-overlay="1"
    >
      <div className="px-2.5 py-1 text-[10px] uppercase tracking-wide text-slate-400">
        @ 提及 · {filtered.length} 人
      </div>
      {filtered.map((u, i) => (
        <button
          key={u.id}
          ref={(el) => {
            itemRefs.current[i] = el;
          }}
          type="button"
          onMouseEnter={() => setActive(i)}
          onClick={() => onPick(u)}
          className={cn(
            "w-full text-left px-2 py-1.5 flex items-center gap-2 text-sm hover:bg-slate-50",
            i === active && "bg-purple-50",
          )}
        >
          <Avatar size="sm" className="h-7 w-7 text-base">
            {u.avatar ?? u.name[0]}
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-brand-ink truncate">
              {u.name}
            </div>
            <div className="text-[10px] text-slate-500 truncate">
              {u.jobTitle}
            </div>
          </div>
          {u.dingtalkBound && (
            <span
              className="text-[9px] px-1 py-0.5 rounded bg-blue-50 text-blue-700"
              title="已绑定钉钉，消息会推送过去"
            >
              钉
            </span>
          )}
        </button>
      ))}
    </div>
  );
});

export default MentionPicker;
