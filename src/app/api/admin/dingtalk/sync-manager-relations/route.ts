/**
 * POST /api/admin/dingtalk/sync-manager-relations — 同步钉钉直属上级关系（仅管理员）
 *
 * 逻辑：
 *  1. 鉴权：支持 JWT 管理员（手动触发）或 x-cron-secret header（定时任务）
 *  2. 预加载全量 dingtalkUserId → db_id 映射表（一次 DB 查询）
 *  3. 查询待处理用户（managerSyncedAt IS NULL 或超过 24h；force=true 时全量）
 *  4. 分批（每批 100 人）并发调用钉钉 user/get 获取 manager_userid
 *  5. 解析冲突逻辑：
 *     - managerSource = null / "dingtalk"  → 直接覆盖 managerId，清空 pendingManagerId
 *     - managerSource = "manual" 且与钉钉不一致 → 写入 pendingManagerId（不覆盖）
 *     - managerSource = "manual" 且与钉钉一致   → 清空 pendingManagerId（无冲突）
 *     - 钉钉无上级（顶层管理者）              → 不改 managerId，清空 pendingManagerId
 *  6. 批量事务写入：users + OrgRelation
 *  7. 返回摘要 { processed, updated, conflicts, skipped }
 *
 * 规范 1-4：withApiLogger 包裹
 * 规范 4-3：双重鉴权（JWT 管理员 or CRON_SECRET）
 */

import { NextResponse, type NextRequest } from "next/server";
import { withApiLogger } from "@/lib/withApiLogger";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { batchFetchManagerUserids } from "@/lib/dingtalk";
import { logger } from "@/lib/logger";

/** 每批处理用户数 */
const BATCH_SIZE = 100;

/** 超过多少毫秒视为需要重新同步（24 小时） */
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function postHandler(req: NextRequest): Promise<NextResponse> {
  // ── 鉴权：JWT 管理员 或 CRON_SECRET ─────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  const incomingSecret = req.headers.get("x-cron-secret");
  let operatorId = 0; // 0 = cron 系统触发

  if (cronSecret && incomingSecret && incomingSecret === cronSecret) {
    // 定时任务鉴权通过，operatorId 保持 0
    logger.info({ user: "cron" }, "sync-manager-relations：cron 触发");
  } else {
    // JWT 管理员鉴权
    const { userId } = await getAuth(req);
    const me = await prisma.user.findUnique({ where: { id: userId } });
    if (!me?.isAdmin) {
      return NextResponse.json({ error: "无权限，仅管理员可操作" }, { status: 403 });
    }
    operatorId = userId;
    logger.info({ user: userId }, "sync-manager-relations：管理员手动触发");
  }

  const sp = new URL(req.url).searchParams;
  const force = sp.get("force") === "true";

  // ── 预加载全量 dingtalkUserId → db_id 映射 ──────────────────
  const allUsers = await prisma.user.findMany({
    where: { dingtalkUserId: { not: null } },
    select: { id: true, dingtalkUserId: true, managerId: true, managerSource: true },
  });

  const dingIdToDbId = new Map<string, number>();
  for (const u of allUsers) {
    if (u.dingtalkUserId) dingIdToDbId.set(u.dingtalkUserId, u.id);
  }
  logger.info(
    { user: operatorId || "cron" },
    `预加载映射表：${dingIdToDbId.size} 个绑定钉钉的用户`,
  );

  // ── 查询待处理用户 ───────────────────────────────────────────
  const cutoff = new Date(Date.now() - SYNC_INTERVAL_MS);
  const where = force
    ? { dingtalkUserId: { not: null } }
    : {
        dingtalkUserId: { not: null as null },
        OR: [
          { managerSyncedAt: null },
          { managerSyncedAt: { lt: cutoff } },
        ],
      };

  const pendingUsers = await prisma.user.findMany({
    where,
    select: {
      id: true,
      dingtalkUserId: true,
      managerId: true,
      managerSource: true,
      pendingManagerId: true,
    },
    orderBy: { id: "asc" },
  });

  logger.info(
    { user: operatorId || "cron" },
    `待处理用户：${pendingUsers.length} 人（force=${force}）`,
  );

  if (pendingUsers.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, updated: 0, conflicts: 0, skipped: 0 });
  }

  // ── 分批处理 ─────────────────────────────────────────────────
  let processed = 0;
  let updated = 0;
  let conflicts = 0;
  let skipped = 0;
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();

  for (let i = 0; i < pendingUsers.length; i += BATCH_SIZE) {
    const batch = pendingUsers.slice(i, i + BATCH_SIZE);
    const dingIds = batch.map((u) => u.dingtalkUserId!);

    // 并发调用钉钉 user/get，获取每人的 manager_userid
    const managerDingIdMap = await batchFetchManagerUserids(dingIds, 5);

    // 构造本批次的 DB 写入操作
    type UpdateOp = {
      userId: number;
      managerId?: number | null;
      managerSource?: string | null;
      pendingManagerId?: number | null;
      managerSyncedAt: Date;
      rebuildOrgRelation?: boolean; // managerId 实际变更时需重建 OrgRelation
    };
    const ops: UpdateOp[] = [];

    for (const u of batch) {
      const managerDingId = managerDingIdMap.get(u.dingtalkUserId!);
      const resolvedManagerDbId = managerDingId ? (dingIdToDbId.get(managerDingId) ?? null) : null;

      // 自环保护
      const safeManagerId = resolvedManagerDbId === u.id ? null : resolvedManagerDbId;

      if (safeManagerId === null) {
        // 钉钉无上级（顶层管理者），或上级不在本系统
        // 不修改 managerId，清空 pendingManagerId，更新同步时间
        ops.push({
          userId: u.id,
          pendingManagerId: null,
          managerSyncedAt: now,
        });
        skipped++;
        continue;
      }

      if (u.managerSource === "manual") {
        if (u.managerId === safeManagerId) {
          // 手动设置 与 钉钉一致，无冲突，清空 pendingManagerId
          ops.push({
            userId: u.id,
            pendingManagerId: null,
            managerSyncedAt: now,
          });
          skipped++;
        } else {
          // 手动设置 与 钉钉不一致，暂存冲突，不覆盖
          ops.push({
            userId: u.id,
            pendingManagerId: safeManagerId,
            managerSyncedAt: now,
          });
          conflicts++;
        }
      } else {
        // managerSource = null / "dingtalk"，直接覆盖
        const managerChanged = u.managerId !== safeManagerId;
        ops.push({
          userId: u.id,
          managerId: safeManagerId,
          managerSource: "dingtalk",
          pendingManagerId: null,
          managerSyncedAt: now,
          rebuildOrgRelation: managerChanged,
        });
        if (managerChanged) updated++;
        else skipped++;
      }
    }

    // 按批次写入事务
    const affectedForOrgRelation = ops.filter((o) => o.rebuildOrgRelation);

    await prisma.$transaction([
      // 1. 批量更新 users
      ...ops.map(({ userId, managerId, managerSource, pendingManagerId, managerSyncedAt, rebuildOrgRelation: _ }) =>
        prisma.user.update({
          where: { id: userId },
          data: {
            ...(managerId !== undefined && { managerId }),
            ...(managerSource !== undefined && { managerSource }),
            ...(pendingManagerId !== undefined && { pendingManagerId }),
            managerSyncedAt,
          },
        }),
      ),
      // 2. 清除需要重建的实线关系
      ...(affectedForOrgRelation.length > 0
        ? [
            prisma.orgRelation.deleteMany({
              where: {
                subordinateId: { in: affectedForOrgRelation.map((o) => o.userId) },
                relationType: "solid",
              },
            }),
          ]
        : []),
      // 3. 新建实线关系
      ...affectedForOrgRelation.map((o) =>
        prisma.orgRelation.create({
          data: {
            subordinateId: o.userId,
            managerId: o.managerId!,
            relationType: "solid",
            effectiveFrom: today,
            effectiveTo: null,
          },
        }),
      ),
    ]);

    processed += batch.length;
    logger.info(
      { user: operatorId || "cron" },
      `进度 ${processed}/${pendingUsers.length}：本批 updated=${updated} conflicts=${conflicts}`,
    );
  }

  logger.info(
    { user: operatorId || "cron" },
    `sync-manager-relations 完成：processed=${processed} updated=${updated} conflicts=${conflicts} skipped=${skipped}`,
  );

  return NextResponse.json({ ok: true, processed, updated, conflicts, skipped });
}

export const POST = withApiLogger(postHandler);
