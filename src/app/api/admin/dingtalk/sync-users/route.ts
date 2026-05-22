/**
 * POST /api/admin/dingtalk/sync-users — 从钉钉同步全量用户（仅管理员）
 *
 * 逻辑：
 *  1. 从 DB 读取已知 dingDeptId 列表（跳过 fetchDingtalkDeptTree，节省大量 HTTP 请求）
 *  2. 并行拉取钉钉全量用户（fetchAllDingtalkUsers，并发 5 个部门）
 *  3. 一次性预加载 DB 全量用户到 Map（避免逐条查询）
 *  4. 将用户分组为 toUpdate / toCreate
 *  5. toCreate：并行 bcrypt（并发 5）
 *  6. 批量写入（transaction update + createMany）
 *  7. 自动禁用离职用户（dingtalkBound=true 但不在同步结果中，管理员跳过）
 *  8. 返回同步摘要：{ total, created, updated, disabled }
 *
 * 规范 1-4：withApiLogger 包裹
 * 规范 4-2：操作前校验 isAdmin
 * 规范 4-3：getAuth 鉴权
 */

import { NextResponse, type NextRequest } from "next/server";
import { withApiLogger } from "@/lib/withApiLogger";
import { prisma } from "@/lib/prisma";
import { getAuth, hashPassword } from "@/lib/auth";
import { fetchAllDingtalkUsers } from "@/lib/dingtalk";
import { logger } from "@/lib/logger";

/** 并行执行 Promise，每批最多 concurrency 个 */
async function pLimit<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map((fn) => fn()));
    results.push(...batchResults);
  }
  return results;
}

async function postHandler(req: NextRequest): Promise<NextResponse> {
  const { userId } = await getAuth(req);

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me?.isAdmin) {
    return NextResponse.json({ error: "无权限，仅管理员可操作" }, { status: 403 });
  }

  logger.info({ user: userId }, "开始从钉钉同步用户");

  // ── 1. 从 DB 读取已知钉钉部门 ID（跳过树请求） ───────────────
  const deptMappings = await prisma.department.findMany({
    where: { dingDeptId: { not: null } },
    select: { id: true, dingDeptId: true },
  });
  const dingDeptToDb = new Map<number, number>();
  for (const d of deptMappings) {
    if (d.dingDeptId !== null) dingDeptToDb.set(d.dingDeptId, d.id);
  }
  const knownDeptIds = [...dingDeptToDb.keys()];
  logger.info({ user: userId }, `DB 中已有 ${knownDeptIds.length} 个钉钉部门映射`);

  // ── 2. 拉取钉钉全量用户（并行） ──────────────────────────────
  let dingtalkUsers;
  try {
    dingtalkUsers = await fetchAllDingtalkUsers(knownDeptIds.length > 0 ? knownDeptIds : undefined);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ user: userId, err }, `拉取钉钉用户失败：${msg}`);
    return NextResponse.json({ error: `拉取钉钉用户失败：${msg}` }, { status: 502 });
  }
  logger.info({ user: userId }, `钉钉用户拉取完成，共 ${dingtalkUsers.length} 人`);

  // ── 3. 一次性预加载 DB 全量用户到 Map ───────────────────────
  const allDbUsers = await prisma.user.findMany({
    select: {
      id: true,
      dingtalkUserId: true,
      employeeNo: true,
      email: true,
      isAdmin: true,
      status: true,
      dingtalkBound: true,
      name: true,
    },
  });

  const byDingId = new Map<string, (typeof allDbUsers)[0]>();
  const byEmpNo = new Map<string, (typeof allDbUsers)[0]>();
  const existingEmails = new Set<string>();

  for (const u of allDbUsers) {
    if (u.dingtalkUserId) byDingId.set(u.dingtalkUserId, u);
    byEmpNo.set(u.employeeNo, u);
    if (u.email) existingEmails.add(u.email);
  }

  // 默认部门（找不到映射时使用）
  const defaultDept = await prisma.department.findFirst({ orderBy: { id: "asc" } });
  const defaultDeptId = defaultDept?.id ?? 1;

  // ── 4. 分组 toUpdate / toCreate ─────────────────────────────
  type UpdateOp = { id: number; data: Record<string, unknown> };
  type CreateItem = { du: (typeof dingtalkUsers)[0]; deptDbId: number; employeeNo: string; email: string };

  const toUpdate: UpdateOp[] = [];
  const toCreate: CreateItem[] = [];
  const syncedUserids = new Set<string>();

  for (const du of dingtalkUsers) {
    syncedUserids.add(du.userid);
    const deptDbId = dingDeptToDb.get(du.mainDeptId) ?? defaultDeptId;

    // 按 dingtalkUserId 匹配，再按 employeeNo fallback
    let existing = byDingId.get(du.userid);
    if (!existing && du.jobNumber) existing = byEmpNo.get(du.jobNumber);

    if (existing) {
      toUpdate.push({
        id: existing.id,
        data: {
          name: du.name,
          ...(du.email ? { email: du.email } : {}),
          ...(du.avatar ? { avatar: du.avatar } : {}),
          departmentId: deptDbId,
          dingtalkUserId: du.userid,
          dingtalkBound: true,
        },
      });
      continue;
    }

    // 工号冲突：绑定钉钉 ID 后当作 update
    if (du.jobNumber) {
      const conflictByNo = byEmpNo.get(du.jobNumber);
      if (conflictByNo) {
        logger.warn(
          { user: userId, employeeNo: du.jobNumber, dingtalkUserId: du.userid },
          `工号 ${du.jobNumber} 已存在（userId=${conflictByNo.id}），改为绑定钉钉`,
        );
        toUpdate.push({
          id: conflictByNo.id,
          data: { dingtalkUserId: du.userid, dingtalkBound: true },
        });
        continue;
      }
    }

    // 新用户
    const employeeNo = du.jobNumber || `ding_${du.userid.slice(0, 12)}`;
    let email = du.email || `${employeeNo}@company.local`;
    if (existingEmails.has(email)) {
      email = `${employeeNo}_${du.userid.slice(0, 8)}@company.local`;
    }
    toCreate.push({ du, deptDbId, employeeNo, email });
  }

  logger.info(
    { user: userId },
    `分组完成：toUpdate=${toUpdate.length} toCreate=${toCreate.length}`,
  );

  // ── 5. 并行 bcrypt（并发 5） ─────────────────────────────────
  const BCRYPT_CONCURRENCY = 5;
  const hashTasks = toCreate.map(
    ({ du }) =>
      () =>
        hashPassword(du.jobNumber || du.userid.slice(0, 16)),
  );
  const hashes = await pLimit(hashTasks, BCRYPT_CONCURRENCY);
  logger.info({ user: userId }, `bcrypt 完成，共 ${hashes.length} 个新用户密码`);

  // ── 6. 批量写入 ──────────────────────────────────────────────
  // 6a. 批量 update（每批 50 条，避免超大 transaction）
  const UPDATE_BATCH = 50;
  let updated = 0;
  for (let i = 0; i < toUpdate.length; i += UPDATE_BATCH) {
    const batch = toUpdate.slice(i, i + UPDATE_BATCH);
    await prisma.$transaction(
      batch.map(({ id, data }) =>
        prisma.user.update({ where: { id }, data }),
      ),
    );
    updated += batch.length;
  }

  // 6b. 批量 create
  let created = 0;
  if (toCreate.length > 0) {
    const createData = toCreate.map(({ du, deptDbId, employeeNo, email }, idx) => ({
      employeeNo,
      name: du.name,
      email,
      avatar: du.avatar || null,
      departmentId: deptDbId,
      jobTitle: "待设置",
      status: "active",
      passwordHash: hashes[idx],
      isAdmin: false,
      dingtalkUserId: du.userid,
      dingtalkBound: true,
      mustResetPassword: true,
    }));

    const result = await prisma.user.createMany({ data: createData, skipDuplicates: true });
    created = result.count;
  }

  // ── 7. 自动禁用离职用户 ──────────────────────────────────────
  let disabled = 0;
  for (const u of allDbUsers) {
    if (u.dingtalkBound && u.status === "active" && u.dingtalkUserId && !syncedUserids.has(u.dingtalkUserId)) {
      if (u.isAdmin) {
        logger.warn(
          { user: userId, dbUserId: u.id },
          `用户 ${u.name}（${u.employeeNo}）不在钉钉同步结果中但为管理员，跳过禁用`,
        );
        continue;
      }
      await prisma.user.update({ where: { id: u.id }, data: { status: "disabled" } });
      disabled++;
      logger.info(
        { user: userId, dbUserId: u.id },
        `自动禁用离职用户：${u.name}（${u.employeeNo}）`,
      );
    }
  }

  logger.info(
    { user: userId },
    `钉钉用户同步完成：total=${dingtalkUsers.length} created=${created} updated=${updated} disabled=${disabled}`,
  );

  return NextResponse.json({
    ok: true,
    total: dingtalkUsers.length,
    created,
    updated,
    disabled,
  });
}

export const POST = withApiLogger(postHandler);
