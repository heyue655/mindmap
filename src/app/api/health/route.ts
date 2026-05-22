/**
 * GET /api/health
 * 健康检查端点，供nginx和其他监控服务使用
 */

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() });
}