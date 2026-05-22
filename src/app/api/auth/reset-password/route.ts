/**
 * POST /api/auth/reset-password
 * 重置当前登录用户的密码，同时清除 mustResetPassword 标记。
 *
 * 规范 1-4：withApiLogger 包裹
 * 规范 4-3：getAuth 鉴权
 *
 * 请求体：{ newPassword: string }
 * 响应：{ ok: true }
 */

import { NextResponse, type NextRequest } from "next/server";
import { withApiLogger } from "@/lib/withApiLogger";
import { prisma } from "@/lib/prisma";
import { getAuth, hashPassword } from "@/lib/auth";
import { logger } from "@/lib/logger";

async function handler(req: NextRequest): Promise<NextResponse> {
  const { userId } = await getAuth(req);

  const body = (await req.json()) as { newPassword?: string };
  const { newPassword } = body;

  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
    return NextResponse.json({ error: "新密码不能为空且长度不能少于 6 位" }, { status: 400 });
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, mustResetPassword: false },
  });

  logger.info(
    { user: userId, method: "POST", path: "/api/auth/reset-password" },
    `用户 ${userId} 重置密码成功`,
  );

  return NextResponse.json({ ok: true });
}

export const POST = withApiLogger(handler);
