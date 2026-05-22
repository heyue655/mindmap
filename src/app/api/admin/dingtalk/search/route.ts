/**
 * GET /api/admin/dingtalk/search?name=xxx
 *
 * 按姓名搜索钉钉用户，返回候选人列表（userid / 姓名 / 工号 / 邮箱 / 头像）。
 * 前端在编辑用户时调用，选择候选人后将 dingtalkUserId / email / avatar 写入数据库。
 *
 * 规范 1-4：withApiLogger 包裹
 * 规范 4-3：getAuth 鉴权，仅管理员可访问
 */

import { NextResponse, type NextRequest } from "next/server";
import { withApiLogger } from "@/lib/withApiLogger";
import { getAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { searchDingtalkUsers, getDingtalkUserDetail } from "@/lib/dingtalk";

async function handler(req: NextRequest): Promise<NextResponse> {
  const { userId } = await getAuth(req);

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me?.isAdmin) {
    return NextResponse.json({ error: "无权限，仅管理员可操作" }, { status: 403 });
  }

  const name = req.nextUrl.searchParams.get("name")?.trim() ?? "";
  if (!name) {
    return NextResponse.json({ error: "name 参数不能为空" }, { status: 400 });
  }

  // 1. 按姓名搜索，获取 userid 列表
  const userIds = await searchDingtalkUsers(name);

  if (userIds.length === 0) {
    return NextResponse.json({ candidates: [] });
  }

  // 2. 并发查询每个 userid 的详情
  const details = await Promise.all(userIds.map((uid) => getDingtalkUserDetail(uid)));

  // 3. 过滤查询失败（null）的结果
  const candidates = details.filter(Boolean);

  return NextResponse.json({ candidates });
}

export const GET = withApiLogger(handler);
