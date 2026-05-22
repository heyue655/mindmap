import type { Node } from "@/types";

export function skeletonLabel(node: Node): string {
  if (node.nodeType !== "skeleton") return node.title;
  const v = node.timeBucketValue ?? "";
  if (node.timeBucketKind === "year") return `${v} · 全年`;
  if (node.timeBucketKind === "quarter") {
    const year = v.slice(0, 4);
    const q = v.slice(4);
    return `${year} ${q}`;
  }
  if (node.timeBucketKind === "month") {
    const [y, m] = v.split("-");
    return `${y} 年 ${parseInt(m ?? "1", 10)} 月`;
  }
  return node.title;
}
