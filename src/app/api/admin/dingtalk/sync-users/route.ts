/**
 * POST /api/admin/dingtalk/sync-users — 从钉钉同步全量用户（仅管理员）
 *
 * 逻辑：
 *  1. 从 DB 读取已知 dingDeptId 列表（跳过 fetchDingtalkDeptTree，节省大量 HTTP 请求）
 *  2. 并行拉取钉钉全量用户（fetchAllDingtalkUsers，并发 2 个部门）
 *  3. 一次性预加载 DB 全量用户到 Map（避免逐条查询）
 *  4. 将用户分组为 toUpdate / toCreate
 *  5. toCreate：所有新同步用户共用一个 bcrypt 哈希（初始密码 = "请登录后修改密码"，
 *     mustResetPassword=true 强制首次登录改密，无需为每人单独 hash，避免 4000+ 次 bcrypt）
 *  6. 批量写入（transaction update + createMany，每批 200 条）
 *  7. 自动禁用离职用户（dingtalkBound=true 但不在同步结果中，管理员跳过；批量 updateMany）
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

/** 返回当前时间戳（ms），用于阶段耗时日志 */
function now() {
  return Date.now();
}

async function postHandler(req: NextRequest): Promise<NextResponse> {
  const startTotal = now();
  const { userId } = await getAuth(req);

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me?.isAdmin) {
    return NextResponse.json({ error: "无权限，仅管理员可操作" }, { status: 403 });
  }

  logger.info({ user: userId }, "开始从钉钉同步用户");

  // ── 1. 从 DB 读取已知钉钉部门 ID（跳过树请求） ───────────────
  const t1 = now();
  const deptMappings = await prisma.department.findMany({
    where: { dingDeptId: { not: null } },
    select: { id: true, dingDeptId: true },
  });
  const dingDeptToDb = new Map<number, number>();
  for (const d of deptMappings) {
    if (d.dingDeptId !== null) dingDeptToDb.set(d.dingDeptId, d.id);
  }
  const knownDeptIds = [...dingDeptToDb.keys()];
  logger.info(
    { user: userId },
    `[阶段1] DB 部门映射加载完成：${knownDeptIds.length} 个部门，耗时 ${now() - t1}ms`,
  );

  // ── 2. 拉取钉钉全量用户（并行） ──────────────────────────────
  const t2 = now();
  let dingtalkUsers;
  try {
    dingtalkUsers = await fetchAllDingtalkUsers(knownDeptIds.length > 0 ? knownDeptIds : undefined);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ user: userId, err }, `拉取钉钉用户失败：${msg}`);
    return NextResponse.json({ error: `拉取钉钉用户失败：${msg}` }, { status: 502 });
  }
  logger.info(
    { user: userId },
    `[阶段2] 钉钉用户拉取完成：${dingtalkUsers.length} 人，耗时 ${now() - t2}ms`,
  );

  // ── 3. 一次性预加载 DB 全量用户到 Map ───────────────────────
  const t3 = now();
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
  logger.info(
    { user: userId },
    `[阶段3] DB 用户预加载完成：${allDbUsers.length} 条，耗时 ${now() - t3}ms`,
  );

  // ── 4. 分组 toUpdate / toCreate ─────────────────────────────
  const t4 = now();
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
    `[阶段4] 分组完成：toUpdate=${toUpdate.length} toCreate=${toCreate.length}，耗时 ${now() - t4}ms`,
  );

  // ── 5. 新用户密码：全部共用同一个默认哈希 ───────────────────
  // 原因：每人单独 bcrypt(cost=12) 在 4000+ 用户时需数分钟；
  //       由于 mustResetPassword=true，初始密码仅为临时凭证，安全性不受影响。
  const t5 = now();
  let sharedDefaultHash = "";
  if (toCreate.length > 0) {
    sharedDefaultHash = await hashPassword("Changeme@1");
  }
  logger.info(
    { user: userId },
    `[阶段5] 默认密码哈希生成完成（共用 1 次 bcrypt，覆盖 ${toCreate.length} 个新用户），耗时 ${now() - t5}ms`,
  );

  // ── 6. 批量写入 ──────────────────────────────────────────────
  const t6 = now();
  // 6a. 批量 update（每批 200 条）
  const UPDATE_BATCH = 200;
  let updated = 0;
  for (let i = 0; i < toUpdate.length; i += UPDATE_BATCH) {
    const batch = toUpdate.slice(i, i + UPDATE_BATCH);
    await prisma.$transaction(
      batch.map(({ id, data }) =>
        prisma.user.update({ where: { id }, data }),
      ),
    );
    updated += batch.length;
    logger.info(
      { user: userId },
      `[阶段6a] 已更新 ${updated}/${toUpdate.length} 个用户`,
    );
  }
  logger.info(
    { user: userId },
    `[阶段6a] 全量 update 完成：${updated} 条，耗时 ${now() - t6}ms`,
  );

  // 6b. 批量 create（单次 createMany，MySQL 支持大批量插入）
  const t6b = now();
  let created = 0;
  if (toCreate.length > 0) {
    // 每批 500 条，避免单条 SQL 过长
    const CREATE_BATCH = 500;
    for (let i = 0; i < toCreate.length; i += CREATE_BATCH) {
      const batch = toCreate.slice(i, i + CREATE_BATCH);
      const createData = batch.map(({ du, deptDbId, employeeNo, email }) => ({
        employeeNo,
        name: du.name,
        email,
        avatar: du.avatar || null,
        departmentId: deptDbId,
        jobTitle: "待设置",
        status: "active",
        passwordHash: sharedDefaultHash,
        isAdmin: false,
        dingtalkUserId: du.userid,
        dingtalkBound: true,
        mustResetPassword: true,
      }));
      const result = await prisma.user.createMany({ data: createData, skipDuplicates: true });
      created += result.count;
      logger.info(
        { user: userId },
        `[阶段6b] 已创建 ${created}/${toCreate.length} 个新用户（本批 ${result.count} 条）`,
      );
    }
  }
  logger.info(
    { user: userId },
    `[阶段6b] 全量 create 完成：${created} 条，耗时 ${now() - t6b}ms`,
  );

  // ── 7. 自动禁用离职用户（批量 updateMany） ───────────────────
  const t7 = now();
  const toDisableIds: number[] = [];
  const skippedAdmins: string[] = [];

  for (const u of allDbUsers) {
    if (
      u.dingtalkBound &&
      u.status === "active" &&
      u.dingtalkUserId &&
      !syncedUserids.has(u.dingtalkUserId)
    ) {
      if (u.isAdmin) {
        skippedAdmins.push(`${u.name}(${u.employeeNo})`);
        continue;
      }
      toDisableIds.push(u.id);
    }
  }

  if (skippedAdmins.length > 0) {
    logger.warn(
      { user: userId },
      `以下管理员不在钉钉同步结果中，跳过禁用：${skippedAdmins.join("、")}`,
    );
  }

  let disabled = 0;
  if (toDisableIds.length > 0) {
    const result = await prisma.user.updateMany({
      where: { id: { in: toDisableIds } },
      data: { status: "disabled" },
    });
    disabled = result.count;
  }
  logger.info(
    { user: userId },
    `[阶段7] 离职用户禁用完成：${disabled} 条，耗时 ${now() - t7}ms`,
  );

  const totalMs = now() - startTotal;
  logger.info(
    { user: userId },
    `钉钉用户同步完成：total=${dingtalkUsers.length} created=${created} updated=${updated} disabled=${disabled}，总耗时 ${totalMs}ms`,
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
