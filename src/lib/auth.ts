/**
 * 规范 4-3：身份认证工具
 *
 * - getAuth(req)：验证 Bearer JWT，返回解析后的 payload；验证失败直接抛出 NextResponse 401
 * - signToken(payload)：签发 JWT（24h 有效期）
 * - 密码哈希工具：hashPassword / verifyPassword（bcrypt cost=12）
 *
 * 使用方式：
 *   const { userId } = await getAuth(req);
 */

import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { NextResponse, type NextRequest } from "next/server";

const JWT_SECRET = process.env.JWT_SECRET;
const BCRYPT_COST = 12;

function getSecretKey(): Uint8Array {
  if (!JWT_SECRET) {
    // 开发模式允许缺省，生产必须设置
    if (process.env.NODE_ENV === "production") {
      throw new Error("环境变量 JWT_SECRET 未设置，生产环境必须配置");
    }
    return new TextEncoder().encode("dev-secret-please-change-in-production");
  }
  return new TextEncoder().encode(JWT_SECRET);
}

export interface JwtPayload {
  /** 用户数据库主键 */
  userId: number;
  /** 员工工号（用于日志） */
  employeeNo: string;
  /** JWT 签发时间（Unix 秒） */
  iat?: number;
  /** JWT 过期时间（Unix 秒） */
  exp?: number;
}

/**
 * 签发 JWT，有效期 24 小时
 */
export async function signToken(payload: Omit<JwtPayload, "iat" | "exp">): Promise<string> {
  const expiresIn = process.env.JWT_EXPIRES_IN ?? "24h";
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getSecretKey());
}

/**
 * 规范 4-3：验证 Bearer JWT，返回 payload
 * 验证失败时抛出 NextResponse（由 withApiLogger 捕获并返回）
 */
export async function getAuth(req: NextRequest): Promise<JwtPayload> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    throw NextResponse.json({ error: "未授权，请先登录" }, { status: 401 });
  }
  const token = auth.slice(7);
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (typeof payload.userId !== "number") {
      throw new Error("token payload 格式错误");
    }
    return payload as unknown as JwtPayload;
  } catch {
    throw NextResponse.json({ error: "登录已过期，请重新登录" }, { status: 401 });
  }
}

/**
 * 规范 4-3：使用 bcrypt（cost=12）哈希密码
 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

/**
 * 规范 4-3：校验密码
 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
