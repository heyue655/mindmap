/**
 * 规范 1-4：API 日志 HOF（Higher-Order Function）
 *
 * 包裹 Next.js Route Handler，自动打印：
 *   - 请求进入日志（含请求参数，敏感字段自动掩码）
 *   - 请求完成日志（含状态码和耗时）
 *   - 异常日志（含错误信息）
 *
 * 每个请求生成唯一 8 位十六进制请求 ID（req:XXXXXXXX），贯穿进入/完成/异常三条日志。
 * 业务处理函数内调用 logger 时，可将 requestId 透传至 LogContext 以关联同一请求的所有日志。
 *
 * 使用方式：
 *   export const POST = withApiLogger(async (req) => {
 *     // ...业务逻辑...
 *     return NextResponse.json({ ok: true }, { status: 201 });
 *   });
 */

import { type NextRequest, NextResponse } from "next/server";
import { logger, maskSensitive } from "@/lib/logger";

type RouteHandler = (
  req: NextRequest,
  ctx?: { params?: Record<string, string> },
) => Promise<NextResponse> | NextResponse;

/**
 * 生成 8 位十六进制请求 ID
 */
function genReqId(): string {
  return Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
}

/**
 * 从 Authorization 头解析用户标识（仅用于日志，不做鉴权）
 */
function extractUserFromHeader(req: NextRequest): string {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return "anon";
  // 仅取 token 前 8 位用于日志标识，避免泄露完整 token
  return `jwt:${auth.slice(7, 15)}…`;
}

/**
 * 安全提取请求体（JSON），失败时返回空对象
 */
async function safeParseBody(req: NextRequest): Promise<Record<string, unknown>> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) return {};
  try {
    const text = await req.text();
    if (!text) return {};
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * 将请求参数摘要化：
 * - 整体 JSON 序列化后 < 512 字节：原样返回
 * - 否则：对每个顶层字段只记录类型/长度摘要，不打印具体内容
 */
function summarizeParams(params: Record<string, unknown>): Record<string, unknown> {
  const raw = JSON.stringify(params);
  if (raw.length <= 512) return params;

  const summary: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(params)) {
    if (Array.isArray(val)) {
      summary[key] = `Array(${val.length})`;
    } else if (val !== null && typeof val === "object") {
      summary[key] = `Object(${Object.keys(val as object).length} keys)`;
    } else if (typeof val === "string" && val.length > 50) {
      summary[key] = `"${val.slice(0, 50)}…"(${val.length}chars)`;
    } else {
      summary[key] = val;
    }
  }
  return summary;
}

/**
 * withApiLogger：包裹 Route Handler，自动完成请求日志记录
 */
export function withApiLogger(handler: RouteHandler): RouteHandler {
  return async function wrappedHandler(
    req: NextRequest,
    ctx?: { params?: Record<string, string> },
  ): Promise<NextResponse> {
    const start = Date.now();
    const requestId = genReqId();
    const method = req.method;
    const url = new URL(req.url);
    const path = url.pathname;
    const user = extractUserFromHeader(req);

    // 提取请求参数（query + body），克隆 req 以避免消费 body
    const reqClone = req.clone() as NextRequest;
    const queryParams = Object.fromEntries(url.searchParams.entries());
    const bodyParams = await safeParseBody(reqClone);
    const params = summarizeParams(maskSensitive({ ...queryParams, ...bodyParams }));

    logger.info(
      { requestId, user, method, path },
      `→ 请求进入 params=${JSON.stringify(params)}`,
    );

    let response: NextResponse;
    try {
      response = await handler(req, ctx);
    } catch (err) {
      const durationMs = Date.now() - start;
      logger.error(
        { requestId, user, method, path, status: 500, durationMs },
        "← 请求异常",
        err,
      );
      return NextResponse.json(
        { error: "服务器内部错误" },
        { status: 500 },
      );
    }

    const durationMs = Date.now() - start;
    const status = response.status;
    logger.info(
      { requestId, user, method, path, status, durationMs },
      `← 请求完成`,
    );

    return response;
  };
}
