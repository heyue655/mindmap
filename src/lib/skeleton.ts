import type { MindMapId, Node, NodeId, UserId } from "@/types";

// 为指定用户的 MindMap 生成骨架：
//   年根
//     ├── 12 个月（直接挂在年根下，构成左侧主干）
//     └── 4 个季度（直接挂在年根下，渲染时由布局算法定位到月份右侧并用大括号包住对应 3 个月）
// 月份与季度互为兄弟，没有数据上的父子关系；季度与"它的 3 个月"由 timeBucketValue 推断。
export function generateSkeleton(opts: {
  mindmapId: MindMapId;
  ownerId: UserId;
  year: number;
  systemUserId?: UserId;
  /**
   * 骨架节点 id 前缀。默认用 ownerId（兼容旧数据）。
   * 新建第二张「同年」年度计划时必须传入唯一值（如 mindmapId），避免节点 id 冲突。
   */
  skeletonKey?: string;
}): Node[] {
  const { mindmapId, ownerId, year } = opts;
  const key = opts.skeletonKey ?? ownerId;
  const systemUser = opts.systemUserId ?? ownerId;
  const nowISO = new Date().toISOString();
  const nodes: Node[] = [];

  const yearId: NodeId = `sk-${key}-y${year}`;
  nodes.push({
    id: yearId,
    mindmapId,
    sortOrder: 0,
    title: `${year} 工作计划`,
    nodeType: "skeleton",
    timeBucketKind: "year",
    timeBucketValue: `${year}`,
    createdBy: systemUser,
    createdAt: nowISO,
    updatedAt: nowISO,
    isDeleted: false,
  });

  // 12 个月（sortOrder 0..11）
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, "0");
    const monthId: NodeId = `sk-${key}-y${year}m${mm}`;
    nodes.push({
      id: monthId,
      mindmapId,
      parentId: yearId,
      sortOrder: m - 1,
      title: `${m} 月`,
      nodeType: "skeleton",
      timeBucketKind: "month",
      timeBucketValue: `${year}-${mm}`,
      createdBy: systemUser,
      createdAt: nowISO,
      updatedAt: nowISO,
      isDeleted: false,
    });
  }

  // 4 个季度（sortOrder 100..103，远大于月份，避免 sibling 顺序混乱）
  for (let q = 1; q <= 4; q++) {
    const quarterId: NodeId = `sk-${key}-y${year}q${q}`;
    nodes.push({
      id: quarterId,
      mindmapId,
      parentId: yearId,
      sortOrder: 100 + q - 1,
      title: `Q${q} 主要工作`,
      nodeType: "skeleton",
      timeBucketKind: "quarter",
      timeBucketValue: `${year}Q${q}`,
      createdBy: systemUser,
      createdAt: nowISO,
      updatedAt: nowISO,
      isDeleted: false,
    });
  }

  return nodes;
}

// 给定季度的 timeBucketValue（如 "2026Q1"），返回它管的 3 个月的 timeBucketValue
export function monthsOfQuarter(quarterValue: string): string[] {
  const m = /^(\d{4})Q([1-4])$/.exec(quarterValue);
  if (!m) return [];
  const year = m[1];
  const q = parseInt(m[2]);
  const start = (q - 1) * 3 + 1;
  return [start, start + 1, start + 2].map(
    (n) => `${year}-${String(n).padStart(2, "0")}`,
  );
}

// 给定一组节点，返回它们按 parentId 组织的 children map
export function groupByParent(nodes: Node[]): Map<NodeId | "ROOT", Node[]> {
  const map = new Map<NodeId | "ROOT", Node[]>();
  for (const n of nodes) {
    if (n.isDeleted) continue;
    const key: NodeId | "ROOT" = n.parentId ?? "ROOT";
    const arr = map.get(key) ?? [];
    arr.push(n);
    map.set(key, arr);
  }
  // 排序
  for (const [k, arr] of map) {
    arr.sort((a, b) => a.sortOrder - b.sortOrder);
    map.set(k, arr);
  }
  return map;
}
