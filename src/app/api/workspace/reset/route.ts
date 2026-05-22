/**
 * POST /api/workspace/reset → 重置当前用户的工作区为种子数据
 *
 * 规范 1-4：withApiLogger 包裹
 * 规范 4-2：仅删除/重置属于当前用户的数据
 * 规范 4-3：getAuth 验证身份
 */

import { NextResponse, type NextRequest } from "next/server";
import { withApiLogger } from "@/lib/withApiLogger";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";

async function postHandler(req: NextRequest): Promise<NextResponse> {
  const { userId } = await getAuth(req);

  // 3.4 仅管理员可调用 reset（规范 4-2）
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "无权限，仅管理员可执行重置操作" }, { status: 403 });
  }

  logger.info(
    { user: userId, method: "POST", path: "/api/workspace/reset" },
    "开始重置用户工作区",
  );

  // 找到当前 DB 用户名下的所有导图 ID（用于关联删除）
  const userMindmaps = await prisma.mindMap.findMany({
    where: { ownerId: userId },
    select: { id: true },
  });
  const mindmapIds = userMindmaps.map((m) => m.id);

  // 事务：删除当前用户的关联数据，再按种子数据重建（简化演示版：仅清空）
  await prisma.$transaction(async (tx) => {
    // 删除顺序：先子表，后父表（避免外键约束）
    if (mindmapIds.length > 0) {
      const nodeIds = (
        await tx.node.findMany({
          where: { mindmapId: { in: mindmapIds } },
          select: { id: true },
        })
      ).map((n) => n.id);

      if (nodeIds.length > 0) {
        await tx.taskLog.deleteMany({ where: { nodeId: { in: nodeIds } } });
        await tx.nodeShare.deleteMany({ where: { nodeId: { in: nodeIds } } });
        await tx.calendarSync.deleteMany({ where: { nodeId: { in: nodeIds } } });
        await tx.mentionEvent.deleteMany({ where: { nodeId: { in: nodeIds } } });
      }
      await tx.node.deleteMany({ where: { mindmapId: { in: mindmapIds } } });
      await tx.relationship.deleteMany({
        where: { mindmapId: { in: mindmapIds } },
      });
    }

    await tx.assignment.deleteMany({
      where: { OR: [{ assignerId: userId }, { assigneeId: userId }] },
    });
    await tx.followGrant.deleteMany({
      where: { OR: [{ requesterId: userId }, { granteeId: userId }] },
    });
    await tx.appNotification.deleteMany({ where: { recipientId: userId } });
    await tx.workReport.deleteMany({ where: { authorId: userId } });
    await tx.mindMap.deleteMany({ where: { ownerId: userId } });
  });

  logger.info(
    { user: userId, method: "POST", path: "/api/workspace/reset" },
    `工作区已清空，共删除 ${mindmapIds.length} 个导图`,
  );

  return NextResponse.json({ ok: true, reset: true });
}

export const POST = withApiLogger(postHandler);
