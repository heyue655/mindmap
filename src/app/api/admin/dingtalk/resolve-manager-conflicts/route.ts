/**
 * POST /api/admin/dingtalk/resolve-manager-conflicts — 批量处理上级冲突（仅管理员）
 *
 * 管理员在冲突列表中选择「接受钉钉」或「保持当前」后调用此接口。
 *
 * 请求体：
 *   { actions: Array<{ userId: string; action: "accept" | "keep" }> }
 *
 * accept → managerId = pendingManagerId，managerSource = "dingtalk"，清空 pendingManagerId
 *          同步重建 OrgRelation（删旧 solid + 建新 solid）
 * keep   → 清空 pendingManagerId，managerSource 保持 "manual"（不改 managerId）
 *
 * 规范 1-4：withApiLogger 包裹
 * 规范 4-2：仅管理员可操作
 * 规范 4-3：getAuth 鉴权
 */

import { NextResponse, type NextRequest } from "next/server";
import { withApiLogger } from "@/lib/withApiLogger";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";

async function postHandler(req: NextRequest): Promise<NextResponse> {
  const { userId } = await getAuth(req);

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me?.isAdmin) {
    return NextResponse.json({ error: "无权限，仅管理员可操作" }, { status: 403 });
  }

  const body = (await req.json()) as {
    actions?: Array<{ userId: string; action: "accept" | "keep" }>;
  };

  if (!Array.isArray(body.actions) || body.actions.length === 0) {
    return NextResponse.json({ error: "actions 不能为空" }, { status: 400 });
  }

  // 校验 action 合法性
  for (const a of body.actions) {
    if (!a.userId || !["accept", "keep"].includes(a.action)) {
      return NextResponse.json(
        { error: `action 无效：userId=${a.userId} action=${a.action}` },
        { status: 400 },
      );
    }
  }

  const userIds = body.actions.map((a) => parseInt(a.userId, 10)).filter((n) => !isNaN(n));
  if (userIds.length !== body.actions.length) {
    return NextResponse.json({ error: "存在无效的 userId" }, { status: 400 });
  }

  // 查询这批用户的当前 pendingManagerId（规范 4-2：后端独立校验，不信任前端传值）
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, managerId: true, pendingManagerId: true, managerSource: true },
  });

  const userMap = new Map(users.map((u) => [u.id, u]));
  const actionMap = new Map(body.actions.map((a) => [parseInt(a.userId, 10), a.action]));

  const today = new Date().toISOString().slice(0, 10);

  type AcceptOp = { userId: number; newManagerId: number };
  const acceptOps: AcceptOp[] = [];
  const keepUserIds: number[] = [];

  for (const [uid, action] of actionMap) {
    const u = userMap.get(uid);
    if (!u) continue; // 用户不存在，跳过

    if (action === "accept") {
      if (!u.pendingManagerId) {
        // 无待确认上级，视为 keep
        keepUserIds.push(uid);
        continue;
      }
      acceptOps.push({ userId: uid, newManagerId: u.pendingManagerId });
    } else {
      keepUserIds.push(uid);
    }
  }

  // 执行事务
  const txOps = [];

  // accept：覆盖 managerId + 清空 pendingManagerId + 设 managerSource="dingtalk"
  for (const { userId, newManagerId } of acceptOps) {
    txOps.push(
      prisma.user.update({
        where: { id: userId },
        data: { managerId: newManagerId, managerSource: "dingtalk", pendingManagerId: null },
      }),
    );
  }

  // accept：删除旧实线 OrgRelation
  if (acceptOps.length > 0) {
    txOps.push(
      prisma.orgRelation.deleteMany({
        where: {
          subordinateId: { in: acceptOps.map((o) => o.userId) },
          relationType: "solid",
        },
      }),
    );
  }

  // accept：创建新实线 OrgRelation
  for (const { userId, newManagerId } of acceptOps) {
    txOps.push(
      prisma.orgRelation.create({
        data: {
          subordinateId: userId,
          managerId: newManagerId,
          relationType: "solid",
          effectiveFrom: today,
          effectiveTo: null,
        },
      }),
    );
  }

  // keep：仅清空 pendingManagerId，managerSource 保持 "manual"
  if (keepUserIds.length > 0) {
    txOps.push(
      prisma.user.updateMany({
        where: { id: { in: keepUserIds } },
        data: { pendingManagerId: null },
      }),
    );
  }

  await prisma.$transaction(txOps);

  logger.info(
    { user: userId },
    `resolve-manager-conflicts 完成：accept=${acceptOps.length} keep=${keepUserIds.length}`,
  );

  return NextResponse.json({ ok: true, accepted: acceptOps.length, kept: keepUserIds.length });
}

export const POST = withApiLogger(postHandler);
