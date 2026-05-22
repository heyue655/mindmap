/**
 * Next.js Middleware — 服务端 API 路由保护
 * 规范 4-3：API 路由未携带有效 JWT 时返回 401
 *
 * 注意：页面路由（非 /api/*）不在此处重定向，由客户端 AppShell 守卫负责。
 * 原因：JWT 存储在浏览器 localStorage，服务端无法读取，页面请求中不携带 token。
 *
 * 放行：
 *  - 所有非 API 路径（页面由 AppShell 客户端守卫处理）
 *  - /api/auth/login（登录接口）
 *  - /_next/*（Next.js 静态资源）
 *  - /favicon.ico 及 /public 下静态文件
 */

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const API_PUBLIC_PATHS = ["/api/auth/login"];
const PUBLIC_PREFIXES = ["/_next/", "/favicon", "/public/"];

function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET ?? "dev-secret-please-change-in-production";
  return new TextEncoder().encode(secret);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 放行静态资源
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  // 非 API 路径（页面）一律放行，由客户端 AppShell 守卫处理
  const isApi = pathname.startsWith("/api/");
  if (!isApi) return NextResponse.next();

  // API 公开路径放行
  if (API_PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  // API 路由：验证 Authorization Bearer token
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!token) {
    return NextResponse.json({ error: "未授权，请先登录" }, { status: 401 });
  }

  try {
    await jwtVerify(token, getSecretKey());
    return NextResponse.next();
  } catch {
    return NextResponse.json({ error: "登录已过期，请重新登录" }, { status: 401 });
  }
}

export const config = {
  // 匹配所有路径，但排除 Next.js 内部路径和静态文件
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public/).*)"],
};
