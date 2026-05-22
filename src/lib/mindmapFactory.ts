import { newId } from "@/lib/id";
import { generateSkeleton } from "@/lib/skeleton";
import type { MindMap, MindMapStructure, MindMapTheme, Node, UserId } from "@/types";

export type MindMapTemplateId =
  | "annual"
  | "blank-logic"
  | "blank-radial"
  | "org-starter"
  | "project";

export interface MindMapTemplateMeta {
  id: MindMapTemplateId;
  label: string;
  description: string;
  /** 类似 XMind 模板库的归类 */
  category: string;
  structure: MindMapStructure;
  theme: MindMapTheme;
}

export const MINDMAP_TEMPLATE_CATALOG: MindMapTemplateMeta[] = [
  {
    id: "annual",
    label: "年度工作计划",
    description: "年 / 季 / 月骨架，适合按时间推进的目标与任务",
    category: "经典",
    structure: "right-logic",
    theme: "snowbrush",
  },
  {
    id: "blank-logic",
    label: "空白 · 向右逻辑图",
    description: "单中心主题，分支向右展开（与 XMind 逻辑图一致）",
    category: "基础",
    structure: "right-logic",
    theme: "snowbrush",
  },
  {
    id: "blank-radial",
    label: "空白 · 思维导图",
    description: "中心放射，适合头脑风暴与知识梳理",
    category: "基础",
    structure: "mindmap",
    theme: "snowbrush",
  },
  {
    id: "org-starter",
    label: "组织结构入门",
    description: "自上而下层级，示例：公司—部门—小组",
    category: "业务",
    structure: "org-chart",
    theme: "business",
  },
  {
    id: "project",
    label: "项目推进",
    description: "阶段式分支：需求 / 设计 / 开发 / 测试 / 上线",
    category: "业务",
    structure: "right-logic",
    theme: "business",
  },
];

function normalNode(opts: {
  mindmapId: MindMap["id"];
  ownerId: UserId;
  parentId?: Node["parentId"];
  sortOrder: number;
  title: string;
}): Node {
  const now = new Date().toISOString();
  return {
    id: newId("n"),
    mindmapId: opts.mindmapId,
    parentId: opts.parentId,
    sortOrder: opts.sortOrder,
    title: opts.title,
    nodeType: "normal",
    createdBy: opts.ownerId,
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
  };
}

export function createMindmapFromTemplate(opts: {
  templateId: MindMapTemplateId;
  /** 导图名称（列表展示）；部分模板会同步作为中心主题文案 */
  title: string;
  ownerId: UserId;
  year?: number;
}): { mindmap: MindMap; nodes: Node[] } {
  const { templateId, ownerId } = opts;
  const meta = MINDMAP_TEMPLATE_CATALOG.find((t) => t.id === templateId);
  if (!meta) throw new Error(`Unknown template: ${templateId}`);
  const year = opts.year ?? new Date().getFullYear();
  const mindmapId = newId("mm");
  const displayTitle = opts.title.trim() || defaultTitleForTemplate(templateId, year);

  const mindmap: MindMap = {
    id: mindmapId,
    ownerId,
    year,
    title: displayTitle,
    structure: meta.structure,
    theme: meta.theme,
    useAnnualTemplate: templateId === "annual",
  };

  let nodes: Node[];

  switch (templateId) {
    case "annual":
      nodes = generateSkeleton({
        mindmapId,
        ownerId,
        year,
        skeletonKey: mindmapId,
      }).map((n) =>
        n.timeBucketKind === "year" ? { ...n, title: displayTitle } : n,
      );
      break;
    case "blank-logic":
    case "blank-radial": {
      const root = normalNode({
        mindmapId,
        ownerId,
        sortOrder: 0,
        title: displayTitle,
      });
      nodes = [root];
      break;
    }
    case "org-starter": {
      const root = normalNode({
        mindmapId,
        ownerId,
        sortOrder: 0,
        title: displayTitle || "组织",
      });
      const depts = ["产品", "研发", "市场"];
      const children: Node[] = depts.map((name, i) =>
        normalNode({
          mindmapId,
          ownerId,
          parentId: root.id,
          sortOrder: i,
          title: name,
        }),
      );
      nodes = [root, ...children];
      break;
    }
    case "project": {
      const root = normalNode({
        mindmapId,
        ownerId,
        sortOrder: 0,
        title: displayTitle || "新项目",
      });
      const phases = ["需求", "设计", "开发", "测试", "上线"];
      const children: Node[] = phases.map((name, i) =>
        normalNode({
          mindmapId,
          ownerId,
          parentId: root.id,
          sortOrder: i,
          title: name,
        }),
      );
      nodes = [root, ...children];
      break;
    }
    default:
      nodes = [];
  }

  return { mindmap, nodes };
}

export function suggestedTitleForMindmapTemplate(
  templateId: MindMapTemplateId,
  year?: number,
): string {
  const y = year ?? new Date().getFullYear();
  return defaultTitleForTemplate(templateId, y);
}

function defaultTitleForTemplate(id: MindMapTemplateId, year: number): string {
  switch (id) {
    case "annual":
      return `${year} 工作计划`;
    case "org-starter":
      return "组织结构";
    case "project":
      return "项目推进";
    case "blank-logic":
    case "blank-radial":
    default:
      return "中心主题";
  }
}
