import type { MindMap, Node, TimeBucketKind, UserId } from "@/types";

/**
 * 同一用户可有多张导图：派任务、镜像任务等需要落在「最合适的一张」上。
 * 优先：同年 + 启用年度计划骨架；否则同年第一张；否则该用户名下任意一张。
 */
export function primaryMindmapForOwner(
  mindmaps: MindMap[],
  ownerId: UserId,
  year?: number,
): MindMap | undefined {
  let list = mindmaps.filter((m) => m.ownerId === ownerId);
  if (list.length === 0) return undefined;
  if (year != null) {
    const ymatch = list.filter((m) => m.year === year);
    if (ymatch.length > 0) list = ymatch;
  }
  const annual = list.find((m) => m.useAnnualTemplate);
  return annual ?? list[0];
}

/** 派任务用：同年多张年度计划时，优先选「包含该时间桶骨架」的那张 */
export function mindmapForAssigneeBucket(
  mindmaps: MindMap[],
  assigneeId: UserId,
  sel: { kind: Extract<TimeBucketKind, "month" | "quarter">; value: string },
  nodes: Node[],
): MindMap | undefined {
  const bucketYear = parseInt(sel.value.slice(0, 4), 10);
  const candidates = mindmaps.filter(
    (m) =>
      m.ownerId === assigneeId &&
      m.useAnnualTemplate &&
      (Number.isNaN(bucketYear) || m.year === bucketYear),
  );
  for (const m of candidates) {
    const hit = nodes.some(
      (n) =>
        n.mindmapId === m.id &&
        !n.isDeleted &&
        n.nodeType === "skeleton" &&
        n.timeBucketKind === sel.kind &&
        n.timeBucketValue === sel.value,
    );
    if (hit) return m;
  }
  return primaryMindmapForOwner(
    mindmaps,
    assigneeId,
    Number.isNaN(bucketYear) ? undefined : bucketYear,
  );
}

export function mindmapDisplayLabel(
  m: MindMap,
  currentUserName: string,
): string {
  const t = m.title?.trim();
  if (t) return t;
  if (m.id === "mm-xmind-demo") return "XMind 演示图";
  if (m.useAnnualTemplate) return `${currentUserName} · ${m.year} 年度计划`;
  return `导图 · ${m.year}`;
}
