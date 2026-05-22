import { Flag, Star, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type MarkerCategory =
  | "label"
  | "priority"
  | "task"
  | "flag"
  | "star"
  | "people"
  | "symbol";

export interface MarkerDef {
  id: string;
  category: MarkerCategory;
  label: string;
}

export interface MarkerCategoryDef {
  id: MarkerCategory;
  label: string;
  // 同一分类是否互斥（true = 同分类只能存在一个）
  exclusive: boolean;
}

export const MARKER_CATEGORIES: MarkerCategoryDef[] = [
  { id: "label", label: "标签", exclusive: true },
  { id: "priority", label: "优先级", exclusive: true },
  { id: "task", label: "任务进度", exclusive: true },
  { id: "flag", label: "旗帜", exclusive: true },
  { id: "star", label: "星星", exclusive: true },
  { id: "people", label: "人像", exclusive: true },
  { id: "symbol", label: "符号", exclusive: false },
];

// 类似 XMind 7 色：红 / 橙 / 黄 / 绿 / 蓝 / 紫 / 灰
const COLOR_KEYS = [
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "gray",
] as const;
type ColorKey = (typeof COLOR_KEYS)[number];

// 颜色的纯背景色（用于色点 / 优先级数字 / 旗帜 / 星星 / 人像）
const COLOR_BG: Record<ColorKey, string> = {
  red: "#ef4444",
  orange: "#f97316",
  yellow: "#eab308",
  green: "#22c55e",
  blue: "#3b82f6",
  purple: "#a855f7",
  gray: "#94a3b8",
};

const COLOR_LABEL: Record<ColorKey, string> = {
  red: "红",
  orange: "橙",
  yellow: "黄",
  green: "绿",
  blue: "蓝",
  purple: "紫",
  gray: "灰",
};

// 任务进度图标（饼图占比）
const TASK_PROGRESS = [
  { id: "task-0", pct: 0, label: "未开始" },
  { id: "task-25", pct: 25, label: "已完成 25%" },
  { id: "task-50", pct: 50, label: "已完成 50%" },
  { id: "task-75", pct: 75, label: "已完成 75%" },
  { id: "task-90", pct: 90, label: "接近完成" },
  { id: "task-100", pct: 100, label: "已完成" },
];

const SYMBOLS: Array<{ id: string; label: string; emoji: string }> = [
  { id: "symbol-heart", label: "喜欢", emoji: "❤️" },
  { id: "symbol-thumbs-up", label: "赞", emoji: "👍" },
  { id: "symbol-thumbs-down", label: "踩", emoji: "👎" },
  { id: "symbol-pin", label: "钉住", emoji: "📌" },
  { id: "symbol-idea", label: "灵感", emoji: "💡" },
  { id: "symbol-fire", label: "重要", emoji: "🔥" },
  { id: "symbol-bolt", label: "紧急", emoji: "⚡" },
  { id: "symbol-clock", label: "等待", emoji: "⏳" },
  { id: "symbol-warning", label: "警告", emoji: "⚠️" },
  { id: "symbol-question", label: "疑问", emoji: "❓" },
  { id: "symbol-100", label: "满分", emoji: "💯" },
  { id: "symbol-tools", label: "施工", emoji: "🛠️" },
  { id: "symbol-music", label: "音乐", emoji: "🎵" },
  { id: "symbol-game", label: "游戏", emoji: "🎮" },
  { id: "symbol-plane", label: "出差", emoji: "✈️" },
  { id: "symbol-runner", label: "进行", emoji: "🏃" },
  { id: "symbol-trophy", label: "里程碑", emoji: "🏆" },
  { id: "symbol-bell", label: "提醒", emoji: "🔔" },
];

// 完整标记列表
export const MARKERS: MarkerDef[] = [
  // 标签：7 个色点
  ...COLOR_KEYS.map<MarkerDef>((c) => ({
    id: `label-${c}`,
    category: "label",
    label: `${COLOR_LABEL[c]}标签`,
  })),
  // 优先级：1-7 数字 + 颜色
  ...COLOR_KEYS.map<MarkerDef>((_, i) => ({
    id: `priority-${i + 1}`,
    category: "priority",
    label: `优先级 ${i + 1}`,
  })),
  // 任务进度
  ...TASK_PROGRESS.map<MarkerDef>((t) => ({
    id: t.id,
    category: "task",
    label: t.label,
  })),
  // 旗帜
  ...COLOR_KEYS.map<MarkerDef>((c) => ({
    id: `flag-${c}`,
    category: "flag",
    label: `${COLOR_LABEL[c]}旗`,
  })),
  // 星星
  ...COLOR_KEYS.map<MarkerDef>((c) => ({
    id: `star-${c}`,
    category: "star",
    label: `${COLOR_LABEL[c]}星`,
  })),
  // 人像
  ...COLOR_KEYS.map<MarkerDef>((c) => ({
    id: `people-${c}`,
    category: "people",
    label: `${COLOR_LABEL[c]}人像`,
  })),
  // 符号
  ...SYMBOLS.map<MarkerDef>((s) => ({
    id: s.id,
    category: "symbol",
    label: s.label,
  })),
];

const MARKER_BY_ID = new Map(MARKERS.map((m) => [m.id, m]));

export function getMarker(id: string): MarkerDef | undefined {
  return MARKER_BY_ID.get(id);
}

export function getCategory(id: string): MarkerCategory | undefined {
  return MARKER_BY_ID.get(id)?.category;
}

// 同分类互斥：用 newId 替换掉同类已有的；如果点击的就是已有的同 id，则移除它
export function toggleMarker(
  current: string[] | undefined,
  newId: string,
): string[] {
  const list = current ?? [];
  const def = MARKER_BY_ID.get(newId);
  if (!def) return list;

  // 已有同 id → 移除
  if (list.includes(newId)) {
    return list.filter((x) => x !== newId);
  }

  const cat = MARKER_CATEGORIES.find((c) => c.id === def.category);
  if (!cat || !cat.exclusive) {
    // 不互斥（比如 symbol）：直接 append
    return [...list, newId];
  }
  // 互斥：移除同 category 的已有，再 append 新的
  const others = list.filter((id) => MARKER_BY_ID.get(id)?.category !== def.category);
  return [...others, newId];
}

// 渲染单个 marker 的小图标（用于节点上展示 / 选择器格子里展示）
export function MarkerIcon({
  id,
  size = 14,
  className,
}: {
  id: string;
  size?: number;
  className?: string;
}) {
  const def = MARKER_BY_ID.get(id);
  if (!def) return null;

  // 标签：纯色点
  if (def.category === "label") {
    const color = id.replace("label-", "") as ColorKey;
    return (
      <span
        className={cn("inline-block rounded-full shrink-0", className)}
        style={{
          width: size,
          height: size,
          backgroundColor: COLOR_BG[color] ?? "#94a3b8",
        }}
      />
    );
  }

  // 优先级：彩色圆 + 数字
  if (def.category === "priority") {
    const num = parseInt(id.replace("priority-", "")) || 1;
    const color = COLOR_KEYS[num - 1] ?? "gray";
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full text-white font-semibold shrink-0",
          className,
        )}
        style={{
          width: size,
          height: size,
          backgroundColor: COLOR_BG[color],
          fontSize: Math.round(size * 0.65),
          lineHeight: 1,
        }}
      >
        {num}
      </span>
    );
  }

  // 任务进度：饼图
  if (def.category === "task") {
    const pct = TASK_PROGRESS.find((t) => t.id === id)?.pct ?? 0;
    return <TaskPieIcon pct={pct} size={size} className={className} />;
  }

  // 旗帜
  if (def.category === "flag") {
    const color = id.replace("flag-", "") as ColorKey;
    return (
      <Flag
        className={cn("shrink-0", className)}
        style={{ width: size, height: size, color: COLOR_BG[color] }}
        fill={COLOR_BG[color]}
        strokeWidth={1.5}
      />
    );
  }

  // 星星
  if (def.category === "star") {
    const color = id.replace("star-", "") as ColorKey;
    return (
      <Star
        className={cn("shrink-0", className)}
        style={{ width: size, height: size, color: COLOR_BG[color] }}
        fill={COLOR_BG[color]}
        strokeWidth={1.5}
      />
    );
  }

  // 人像
  if (def.category === "people") {
    const color = id.replace("people-", "") as ColorKey;
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full text-white shrink-0",
          className,
        )}
        style={{
          width: size,
          height: size,
          backgroundColor: COLOR_BG[color],
        }}
      >
        <UserIcon
          style={{ width: size * 0.6, height: size * 0.6 }}
          strokeWidth={2.4}
        />
      </span>
    );
  }

  // 符号：emoji 渲染
  if (def.category === "symbol") {
    const sym = SYMBOLS.find((s) => s.id === id);
    if (!sym) return null;
    return (
      <span
        className={cn("inline-flex shrink-0 leading-none", className)}
        style={{ fontSize: size }}
      >
        {sym.emoji}
      </span>
    );
  }

  return null;
}

function TaskPieIcon({
  pct,
  size = 14,
  className,
}: {
  pct: number;
  size?: number;
  className?: string;
}) {
  const c = 8;
  const r = 6;
  const stroke = "#22c55e";
  // 完整状态：实心圆 + 对勾
  if (pct >= 100) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" className={cn("shrink-0", className)}>
        <circle cx={c} cy={c} r={r + 1} fill={stroke} />
        <path
          d="M5.2 8.3 L7.2 10.3 L11 6.5"
          stroke="white"
          strokeWidth={1.6}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  // 0% / 部分扇形：先画外圈空心，再用 path 填扇形
  const fillSector = (() => {
    if (pct <= 0) return null;
    const angle = (pct / 100) * 2 * Math.PI;
    const x = c + r * Math.sin(angle);
    const y = c - r * Math.cos(angle);
    const largeArc = pct > 50 ? 1 : 0;
    return (
      <path
        d={`M ${c} ${c} L ${c} ${c - r} A ${r} ${r} 0 ${largeArc} 1 ${x} ${y} Z`}
        fill={stroke}
      />
    );
  })();
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={cn("shrink-0", className)}>
      <circle cx={c} cy={c} r={r + 1} fill="none" stroke={stroke} strokeWidth={1.4} />
      {fillSector}
    </svg>
  );
}

export function markersOfCategory(cat: MarkerCategory): MarkerDef[] {
  return MARKERS.filter((m) => m.category === cat);
}
