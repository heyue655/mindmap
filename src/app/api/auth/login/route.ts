/**
 * POST /api/auth/login
 * 规范 1-4：withApiLogger 包裹
 * 规范 4-3：工号 + 密码登录，bcrypt 校验；失败统一"工号或密码错误"防枚举；
 *           in-memory rate limiting（5 次/分钟/IP）
 *
 * 请求体：{ employeeNo: string, password: string }
 * 响应：{ token: string, user: { id, name, employeeNo } }
 */

import { NextResponse, type NextRequest } from "next/server";
import { withApiLogger } from "@/lib/withApiLogger";
import { prisma } from "@/lib/prisma";
import { signToken, verifyPassword } from "@/lib/auth";
import { logger } from "@/lib/logger";

// ──────────────────────────────────────────────────────────────
// in-memory rate limiting（IP → { count, resetAt }）
// 规范 4-3：登录接口须做频率限制，防止暴力破解
// ──────────────────────────────────────────────────────────────
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60 * 1000; // 1 分钟
const ipAttempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = ipAttempts.get(ip);
  if (!record || record.resetAt < now) {
    ipAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true; // 允许
  }
  if (record.count >= MAX_ATTEMPTS) return false; // 超限
  record.count++;
  return true;
}

// ──────────────────────────────────────────────────────────────
// 请求处理
// ──────────────────────────────────────────────────────────────
async function handler(req: NextRequest): Promise<NextResponse> {
  // rate limiting（规范 4-3）
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "操作频繁，请 1 分钟后再试" },
      { status: 429 },
    );
  }

  const body = (await req.json()) as {
    employeeNo?: string;
    password?: string;
  };
  const { employeeNo, password } = body;

  if (!employeeNo || typeof employeeNo !== "string") {
    return NextResponse.json({ error: "工号不能为空" }, { status: 400 });
  }
  if (!password || typeof password !== "string") {
    return NextResponse.json({ error: "密码不能为空" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { employeeNo },
    select: {
      id: true,
      name: true,
      employeeNo: true,
      status: true,
      passwordHash: true,
    },
  });

  // 规范 4-3：不区分"用户不存在"和"密码错误"，防止用户枚举
  if (!user || user.status === "disabled") {
    return NextResponse.json({ error: "工号或密码错误" }, { status: 401 });
  }

  // 密码校验
  if (!user.passwordHash) {
    return NextResponse.json({ error: "工号或密码错误" }, { status: 401 });
  }
  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk) {
    logger.warn(
      { user: user.id, method: "POST", path: "/api/auth/login" },
      `用户 ${user.employeeNo} 密码错误（IP: ${ip}）`,
    );
    return NextResponse.json({ error: "工号或密码错误" }, { status: 401 });
  }

  logger.info(
    { user: user.id, method: "POST", path: "/api/auth/login" },
    `用户登录成功：${user.name}（${user.employeeNo}）`,
  );

  const token = await signToken({
    userId: user.id,
    employeeNo: user.employeeNo,
  });

  return NextResponse.json(
    {
      token,
      user: { id: user.id, name: user.name, employeeNo: user.employeeNo },
    },
    { status: 200 },
  );
}

export const POST = withApiLogger(handler);
