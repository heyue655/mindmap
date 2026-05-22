import type { MindMapTheme } from "@/types";

export interface ThemeDef {
  id: MindMapTheme;
  label: string;
  // 画布背景
  canvasBg: string; // tailwind class
  canvasBgRgb: string; // rgb 值，用作网格点颜色 base
  /** 点阵网格颜色（radial-gradient 圆点） */
  gridDot: string;
  /** 节点选中描边（与主题主色一致） */
  accentRing: string;
  /** 大纲视图选中行背景 */
  outlineSelectedBg: string;
  // 节点级别颜色（root / level1 / level2+）
  // 用 inline style，是为了在不同分支上轻松切换 color tone
  rootBg: string;
  rootText: string;
  rootBorder: string;
  branchBg: string; // level 1（分支主题）
  branchText: string;
  branchBorder: string;
  leafBg: string; // level 2+（子节点）
  leafText: string;
  leafBorder: string;
  // 连线颜色（XMind 里每个分支同一色系；MVP 阶段用一个 base 色，分支自动派生 hue）
  edgeColor: string;
  // 联系线颜色
  relationshipColor: string;
  // 概要 / 边界框颜色
  summaryColor: string;
  boundaryColor: string;
}

export const THEMES: Record<MindMapTheme, ThemeDef> = {
  snowbrush: {
    id: "snowbrush",
    label: "雪笔（默认）",
    canvasBg: "bg-[#fffaf3]",
    canvasBgRgb: "255 250 243",
    gridDot: "rgba(249, 115, 22, 0.22)",
    accentRing: "#ea580c",
    outlineSelectedBg: "#fff7ed",
    rootBg: "#f97316", // orange-500
    rootText: "#ffffff",
    rootBorder: "#ea580c",
    branchBg: "#fff7ed", // orange-50
    branchText: "#9a3412",
    branchBorder: "#fb923c",
    leafBg: "#ffffff",
    leafText: "#1f2937",
    leafBorder: "#fed7aa",
    edgeColor: "#fb923c",
    relationshipColor: "#9333ea",
    summaryColor: "#f97316",
    boundaryColor: "#fb923c",
  },
  business: {
    id: "business",
    label: "商务深蓝",
    canvasBg: "bg-[#f1f5fb]",
    canvasBgRgb: "241 245 251",
    gridDot: "rgba(30, 58, 138, 0.18)",
    accentRing: "#2563eb",
    outlineSelectedBg: "#e0e7ff",
    rootBg: "#1e3a8a",
    rootText: "#ffffff",
    rootBorder: "#1e40af",
    branchBg: "#e0e7ff",
    branchText: "#1e3a8a",
    branchBorder: "#3b82f6",
    leafBg: "#ffffff",
    leafText: "#1e293b",
    leafBorder: "#bfdbfe",
    edgeColor: "#3b82f6",
    relationshipColor: "#0891b2",
    summaryColor: "#1e3a8a",
    boundaryColor: "#3b82f6",
  },
  mono: {
    id: "mono",
    label: "极简黑白",
    canvasBg: "bg-white",
    canvasBgRgb: "255 255 255",
    gridDot: "rgba(15, 23, 42, 0.12)",
    accentRing: "#0f172a",
    outlineSelectedBg: "#f1f5f9",
    rootBg: "#0f172a",
    rootText: "#ffffff",
    rootBorder: "#0f172a",
    branchBg: "#f8fafc",
    branchText: "#0f172a",
    branchBorder: "#cbd5e1",
    leafBg: "#ffffff",
    leafText: "#334155",
    leafBorder: "#e2e8f0",
    edgeColor: "#94a3b8",
    relationshipColor: "#64748b",
    summaryColor: "#475569",
    boundaryColor: "#94a3b8",
  },
};

export function getTheme(id?: MindMapTheme | null): ThemeDef {
  return THEMES[id ?? "snowbrush"];
}
