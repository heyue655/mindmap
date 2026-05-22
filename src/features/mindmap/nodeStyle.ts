import type { Node, TaskStatus } from "@/types";
import type { ThemeDef } from "./theme";

/** 年度模板骨架节点：配色跟随当前导图主题（雪笔 / 商务 / 极简） */
export function skeletonPalette(
  node: Node,
  theme: ThemeDef,
): {
  backgroundColor: string;
  color: string;
  borderColor: string;
} {
  if (node.timeBucketKind === "year") {
    return {
      backgroundColor: theme.rootBg,
      color: theme.rootText,
      borderColor: theme.rootBorder,
    };
  }
  if (node.timeBucketKind === "quarter") {
    return {
      backgroundColor: theme.leafBg,
      color: theme.branchText,
      borderColor: theme.branchBorder,
    };
  }
  if (node.timeBucketKind === "month") {
    const m = parseInt(node.timeBucketValue?.split("-")[1] ?? "1", 10);
    const inQ = ((m - 1) % 3) + 1;
    if (inQ === 1) {
      return {
        backgroundColor: theme.rootBg,
        color: theme.rootText,
        borderColor: theme.rootBorder,
      };
    }
    if (inQ === 2) {
      return {
        backgroundColor: theme.rootBorder,
        color: theme.rootText,
        borderColor: theme.rootBorder,
      };
    }
    return {
      backgroundColor: theme.branchBg,
      color: theme.branchText,
      borderColor: theme.branchBorder,
    };
  }
  return {
    backgroundColor: theme.leafBg,
    color: theme.leafText,
    borderColor: theme.leafBorder,
  };
}

// 骨架节点配色（仅兼容未传 theme 的旧用法；新代码请用 skeletonPalette + ThemeDef）
// year = 主色实心, quarter = 浅底描边, month = 三色循环, week = 浅灰
export function skeletonStyle(node: Node): {
  bg: string;
  text: string;
  border: string;
} {
  if (node.timeBucketKind === "year") {
    return {
      bg: "bg-brand-yellow",
      text: "text-brand-ink",
      border: "border-brand-yellow",
    };
  }
  if (node.timeBucketKind === "quarter") {
    return {
      bg: "bg-white",
      text: "text-brand-orange",
      border: "border-brand-orange",
    };
  }
  if (node.timeBucketKind === "month") {
    // 同一季度内三个月用 红/蓝/黄 循环
    const m = parseInt(node.timeBucketValue?.split("-")[1] ?? "1", 10);
    const inQ = ((m - 1) % 3) + 1;
    if (inQ === 1)
      return {
        bg: "bg-brand-orange",
        text: "text-white",
        border: "border-brand-orange",
      };
    if (inQ === 2)
      return {
        bg: "bg-brand-ink",
        text: "text-white",
        border: "border-brand-ink",
      };
    return {
      bg: "bg-brand-yellow",
      text: "text-brand-ink",
      border: "border-brand-yellow",
    };
  }
  // week or default
  return {
    bg: "bg-slate-100",
    text: "text-slate-700",
    border: "border-slate-300",
  };
}

export const STATUS_COLOR: Record<
  TaskStatus,
  { ring: string; chip: string; chipText: string; label: string }
> = {
  not_started: {
    ring: "border-slate-300",
    chip: "bg-slate-100",
    chipText: "text-slate-600",
    label: "未开始",
  },
  in_progress: {
    ring: "border-blue-400",
    chip: "bg-blue-100",
    chipText: "text-blue-700",
    label: "进行中",
  },
  done: {
    ring: "border-emerald-400",
    chip: "bg-emerald-100",
    chipText: "text-emerald-700",
    label: "已完成",
  },
  blocked: {
    ring: "border-rose-400",
    chip: "bg-rose-100",
    chipText: "text-rose-700",
    label: "阻塞",
  },
};

export const PRIORITY_COLOR: Record<
  "P0" | "P1" | "P2" | "P3",
  { chip: string; text: string }
> = {
  P0: { chip: "bg-rose-100", text: "text-rose-700" },
  P1: { chip: "bg-orange-100", text: "text-orange-700" },
  P2: { chip: "bg-blue-100", text: "text-blue-700" },
  P3: { chip: "bg-slate-100", text: "text-slate-600" },
};
