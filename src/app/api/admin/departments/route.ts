/**
 * GET  /api/admin/departments  — 查询部门列表（仅管理员）
 * POST /api/admin/departments  — 创建部门（仅管理员）
 *
 * 规范 1-4：withApiLogger 包裹
 * 规范 4-2：操作前校验 isAdmin
 */

import { NextResponse, type NextRequest } from "next/server";
import { withApiLogger } from "@/lib/withApiLogger";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";

function serializeDept(d: { id: number; name: string; parentId: number | null }) {
  return {
    id: String(d.id),
    name: d.name,
    parentId: d.parentId !== null ? String(d.parentId) : undefined,
  };
}

// ── GET ────────────────────────────────────────────────────────
async function getHandler(req: NextRequest): Promise<NextResponse> {
  const { userId } = await getAuth(req);

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me?.isAdmin) {
    return NextResponse.json({ error: "无权限，仅管理员可访问" }, { status: 403 });
  }

  const departments = await prisma.department.findMany({
    orderBy: { id: "asc" },
    select: { id: true, name: true, parentId: true },
  });

  return NextResponse.json({ departments: departments.map(serializeDept) });
}

// ── POST ───────────────────────────────────────────────────────
async function postHandler(req: NextRequest): Promise<NextResponse> {
  const { userId } = await getAuth(req);

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me?.isAdmin) {
    return NextResponse.json({ error: "无权限，仅管理员可操作" }, { status: 403 });
  }

  const body = (await req.json()) as { name?: string; parentId?: string };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "部门名称不能为空" }, { status: 400 });
  }

  // 父部门存在性校验
  if (body.parentId !== undefined) {
    const parent = await prisma.department.findUnique({ where: { id: parseInt(body.parentId) } });
    if (!parent) {
      return NextResponse.json({ error: "父部门不存在" }, { status: 400 });
    }
  }

  const created = await prisma.department.create({
    data: {
      name: body.name.trim(),
      parentId: body.parentId ? parseInt(body.parentId) : null,
    },
    select: { id: true, name: true, parentId: true },
  });

  logger.info({ user: userId }, `管理员创建部门：${created.name}（id=${created.id}）`);

  return NextResponse.json({ department: serializeDept(created) }, { status: 201 });
}

export const GET = withApiLogger(getHandler);
export const POST = withApiLogger(postHandler);
