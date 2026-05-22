import type { OrgRelation, User, UserId } from "@/types";

// 是否处在 effective 期间内
export function isRelationActive(rel: OrgRelation, atISO?: string): boolean {
  const now = atISO ?? new Date().toISOString();
  if (rel.effectiveFrom > now) return false;
  if (rel.effectiveTo && rel.effectiveTo < now) return false;
  return true;
}

// 获取某人的所有"直接上级"（包括实线 + 当前生效的虚线）
export function getDirectManagers(
  userId: UserId,
  relations: OrgRelation[],
  atISO?: string,
): OrgRelation[] {
  return relations.filter(
    (r) => r.subordinateId === userId && isRelationActive(r, atISO),
  );
}

// 获取某人的所有"直接下属"
export function getDirectReports(
  userId: UserId,
  relations: OrgRelation[],
  atISO?: string,
): OrgRelation[] {
  return relations.filter(
    (r) => r.managerId === userId && isRelationActive(r, atISO),
  );
}

// 是否拥有下属（任何关系类型）= 是否管理者
export function isManager(
  userId: UserId,
  relations: OrgRelation[],
  atISO?: string,
): boolean {
  return getDirectReports(userId, relations, atISO).length > 0;
}

// 获取所有下属（含下属的下属，递归），仅沿实线传播
export function getAllSolidDescendants(
  userId: UserId,
  relations: OrgRelation[],
  atISO?: string,
): UserId[] {
  const result: UserId[] = [];
  const visited = new Set<UserId>([userId]);
  const queue: UserId[] = [userId];
  while (queue.length) {
    const curr = queue.shift()!;
    const reports = relations.filter(
      (r) =>
        r.managerId === curr &&
        r.relationType === "solid" &&
        isRelationActive(r, atISO),
    );
    for (const rel of reports) {
      if (visited.has(rel.subordinateId)) continue;
      visited.add(rel.subordinateId);
      result.push(rel.subordinateId);
      queue.push(rel.subordinateId);
    }
  }
  return result;
}

// 获取所有可派任务的目标（含跨层）
export function getAllAssignTargets(
  userId: UserId,
  relations: OrgRelation[],
  atISO?: string,
): UserId[] {
  return getAllSolidDescendants(userId, relations, atISO);
}

// 获取从 manager 到 subordinate 的实线链路（不含 manager 本身，含 subordinate）
// 若不可达返回 null
export function getSolidPath(
  managerId: UserId,
  subordinateId: UserId,
  relations: OrgRelation[],
  atISO?: string,
): UserId[] | null {
  // BFS，记录前驱
  const prev = new Map<UserId, UserId>();
  const visited = new Set<UserId>([managerId]);
  const queue: UserId[] = [managerId];
  while (queue.length) {
    const curr = queue.shift()!;
    if (curr === subordinateId) {
      const path: UserId[] = [];
      let p = subordinateId;
      while (p !== managerId) {
        path.unshift(p);
        p = prev.get(p)!;
      }
      return path;
    }
    const reports = relations.filter(
      (r) =>
        r.managerId === curr &&
        r.relationType === "solid" &&
        isRelationActive(r, atISO),
    );
    for (const rel of reports) {
      if (visited.has(rel.subordinateId)) continue;
      visited.add(rel.subordinateId);
      prev.set(rel.subordinateId, curr);
      queue.push(rel.subordinateId);
    }
  }
  return null;
}

// 中间层管理者：从 assigner 到 assignee 实线链路上除 assignee 之外的中间节点
export function getMiddleManagers(
  assignerId: UserId,
  assigneeId: UserId,
  relations: OrgRelation[],
  atISO?: string,
): UserId[] {
  const path = getSolidPath(assignerId, assigneeId, relations, atISO);
  if (!path) return [];
  // path 不含 assigner，含 assignee，去掉 assignee 即中间层
  return path.slice(0, -1);
}

export function getUserById(users: User[], id: UserId): User | undefined {
  return users.find((u) => u.id === id);
}

/** 直属实线上级（取一条）；无则 null */
export function getDirectSolidManagerId(
  userId: UserId,
  relations: OrgRelation[],
  atISO?: string,
): UserId | null {
  const rel = relations.find(
    (r) =>
      r.subordinateId === userId &&
      r.relationType === "solid" &&
      isRelationActive(r, atISO),
  );
  return rel?.managerId ?? null;
}

// 获取所有上级（含上级的上级，递归），仅沿实线传播
export function getAllSolidAncestors(
  userId: UserId,
  relations: OrgRelation[],
  atISO?: string,
): UserId[] {
  const result: UserId[] = [];
  const visited = new Set<UserId>([userId]);
  const queue: UserId[] = [userId];
  while (queue.length) {
    const curr = queue.shift()!;
    const managers = relations.filter(
      (r) =>
        r.subordinateId === curr &&
        r.relationType === "solid" &&
        isRelationActive(r, atISO),
    );
    for (const rel of managers) {
      if (visited.has(rel.managerId)) continue;
      visited.add(rel.managerId);
      result.push(rel.managerId);
      queue.push(rel.managerId);
    }
  }
  return result;
}

/**
 * 通过 User.managerId 链向上追溯所有上级。
 * 作为 OrgRelation 的补充/兜底：管理员在用户管理页设置的直属上级
 * 会写入 users.managerId，同时也会同步到 OrgRelation 表。
 * 但为防止数据不一致（如历史数据、同步延迟），此函数提供独立路径。
 */
export function getAllAncestorsByManagerId(
  userId: UserId,
  users: Pick<User, "id" | "managerId">[],
): UserId[] {
  const result: UserId[] = [];
  const visited = new Set<UserId>([userId]);
  let curr = userId;
  while (true) {
    const user = users.find((u) => u.id === curr);
    const mid = user?.managerId;
    if (!mid || visited.has(mid)) break;
    visited.add(mid);
    result.push(mid);
    curr = mid;
  }
  return result;
}

/**
 * 通过 User.managerId 链向下追溯所有下属（含间接下属，BFS）。
 * 与 getAllAncestorsByManagerId 对称，作为 getAllSolidDescendants（依赖 OrgRelation）的
 * 补充/兜底，防止历史数据中 OrgRelation 缺失导致下属不可见。
 */
export function getAllDescendantsByManagerId(
  userId: UserId,
  users: Pick<User, "id" | "managerId">[],
): UserId[] {
  const result: UserId[] = [];
  const visited = new Set<UserId>([userId]);
  const queue: UserId[] = [userId];
  while (queue.length) {
    const curr = queue.shift()!;
    for (const u of users) {
      if (u.managerId === curr && !visited.has(u.id)) {
        visited.add(u.id);
        result.push(u.id);
        queue.push(u.id);
      }
    }
  }
  return result;
}
