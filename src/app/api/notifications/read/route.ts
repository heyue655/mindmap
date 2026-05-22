/**
 * POST /api/notifications/read
 *
 * 即时将指定通知标记为已读（不依赖 PUT /api/workspace 的 1200ms 防抖）。
 *
 * 请求体：{ ids: string[] }  —— 要标记已读的通知 ID 列表（数字字符串）
 * 响应：{ ok: true, updated: number }
 *
 * 规范 1-4：withApiLogger 包裹
 * 规范 4-2：updateMany 附带 recipientId: userId，防止越权标记他人通知
 * 规范 4-3：getAuth 验证身份
 */

import { NextResponse, type NextRequest } from "next/server";
import { withApiLogger } from "@/lib/withApiLogger";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";

async function postHandler(req: NextRequest): Promise<NextResponse> {
  const { userId } = await getAuth(req);

  const body = (await req.json()) as { ids?: unknown };
  const ids = body.ids;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids 必须为非空数组" }, { status: 400 });
  }

  // 过滤出合法的数字 ID
  const dbIds: number[] = [];
  for (const id of ids) {
    const n = Number(id);
    if (!isNaN(n) && n > 0) dbIds.push(n);
  }

  if (dbIds.length === 0) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  const result = await prisma.appNotification.updateMany({
    where: {
      id: { in: dbIds },
      recipientId: userId, // 规范 4-2：只允许标记自己收到的通知
      readAt: null,        // 已读的不重复更新
    },
    data: { readAt: new Date() },
  });

  logger.info(
    { user: userId, method: "POST", path: "/api/notifications/read" },
    `标记已读：请求 ${dbIds.length} 条，实际更新 ${result.count} 条`,
  );

  return NextResponse.json({ ok: true, updated: result.count });
}

export const POST = withApiLogger(postHandler);
