/**
 * 规范 1-4：统一结构化日志模块
 *
 * 日志格式：[时间] [req:XXXXXXXX] [LEVEL] [user:X] [METHOD /path] [状态码] [耗时ms] 消息
 *
 * 使用方式：
 *   import { logger } from '@/lib/logger';
 *   logger.info({ user: userId, method: 'POST', path: '/api/tasks', requestId: reqId }, '请求进入');
 */

/** 日志级别 */
export type LogLevel = "INFO" | "WARN" | "ERROR";

/** 结构化日志上下文 */
export interface LogContext {
  /** 请求 ID；由 withApiLogger 生成，业务日志透传 */
  requestId?: string;
  /** 操作用户 ID；未认证请求传 'anon' */
  user?: string | number;
  /** HTTP 方法 */
  method?: string;
  /** 请求路径 */
  path?: string;
  /** HTTP 状态码 */
  status?: number;
  /** 请求耗时（毫秒）；仅完成/异常日志填写 */
  durationMs?: number;
  /** 其他自定义字段 */
  [key: string]: unknown;
}

/**
 * 将请求参数中的敏感字段替换为 ***
 */
export function maskSensitive(params: Record<string, unknown>): Record<string, unknown> {
  const SENSITIVE_KEYS = new Set(["password", "token", "secret", "passwordHash", "authorization"]);
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    result[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? "***" : v;
  }
  return result;
}

/**
 * 格式化当前时间为 YYYY-MM-DD HH:mm:ss.SSS（北京时间）
 */
function formatNow(): string {
  return new Date().toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hour12: false,
  }).replace(/\//g, "-");
}

function buildLine(level: LogLevel, ctx: LogContext, message: string): string {
  const time = formatNow();
  const reqId = ctx.requestId ?? "-";
  const user = ctx.user ?? "anon";
  const method = ctx.method ?? "";
  const path = ctx.path ?? "";
  const status = ctx.status != null ? ` [${ctx.status}]` : "";
  const duration = ctx.durationMs != null ? ` [${ctx.durationMs}ms]` : "";
  const endpoint = method && path ? ` [${method} ${path}]` : "";

  return `[${time}] [req:${reqId}] [${level}] [user:${user}]${endpoint}${status}${duration} ${message}`;
}

function output(level: LogLevel, ctx: LogContext, message: string): void {
  const line = buildLine(level, ctx, message);
  if (level === "ERROR") {
    console.error(line);
  } else if (level === "WARN") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info(ctx: LogContext, message: string): void {
    output("INFO", ctx, message);
  },
  warn(ctx: LogContext, message: string): void {
    output("WARN", ctx, message);
  },
  error(ctx: LogContext, message: string, err?: unknown): void {
    const errMsg = err instanceof Error ? ` | ${err.message}` : "";
    output("ERROR", ctx, `${message}${errMsg}`);
  },
};
