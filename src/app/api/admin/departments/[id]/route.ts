/**
 * PATCH  /api/admin/departments/[id]  — 修改部门名称/父部门（仅管理员）
 * DELETE /api/admin/departments/[id]  — 删除部门（仅管理员，部门下有用户时拒绝）
 *
 * 规范 1-4：withApiLogger 包裹
 * 规范 4-2：操作前校验 isAdmin
 */

import { NextResponse, type NextRequest } from "next/server";
import { withApiLogger } from "@/lib/withApiLogger";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";

// ── PATCH ──────────────────────────────────────────────────────
async function patchHandler(req: NextRequest, ctx?: { params?: Record<string, string> }): Promise<NextResponse> {
  const { userId } = await getAuth(req);

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me?.isAdmin) {
    return NextResponse.json({ error: "无权限，仅管理员可操作" }, { status: 403 });
  }

  const targetId = parseInt((ctx?.params as Record<string, string>)?.id ?? "");
  if (isNaN(targetId)) {
    return NextResponse.json({ error: "部门 ID 无效" }, { status: 400 });
  }

  const dept = await prisma.department.findUnique({ where: { id: targetId } });
  if (!dept) {
    return NextResponse.json({ error: "部门不存在" }, { status: 404 });
  }

  const body = (await req.json()) as { name?: string; parentId?: string | null };

  if (body.name !== undefined && !body.name.trim()) {
    return NextResponse.json({ error: "部门名称不能为空" }, { status: 400 });
  }

  // 父部门存在性校验
  if (body.parentId !== undefined && body.parentId !== null) {
    const parent = await prisma.department.findUnique({ where: { id: parseInt(body.parentId) } });
    if (!parent) {
      return NextResponse.json({ error: "父部门不存在" }, { status: 400 });
    }
    // 禁止将部门设为自己的子部门（循环依赖）
    if (parseInt(body.parentId) === targetId) {
      return NextResponse.json({ error: "不能将部门设为自己的子部门" }, { status: 400 });
    }
  }

  const updated = await prisma.department.update({
    where: { id: targetId },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.parentId !== undefined && {
        parentId: body.parentId !== null ? parseInt(body.parentId) : null,
      }),
    },
    select: { id: true, name: true, parentId: true },
  });

  logger.info({ user: userId }, `管理员更新部门 ${targetId}：${JSON.stringify(body)}`);

  return NextResponse.json({
    department: {
      id: String(updated.id),
      name: updated.name,
      parentId: updated.parentId !== null ? String(updated.parentId) : undefined,
    },
  });
}

// ── DELETE ─────────────────────────────────────────────────────
async function deleteHandler(req: NextRequest, ctx?: { params?: Record<string, string> }): Promise<NextResponse> {
  const { userId } = await getAuth(req);

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me?.isAdmin) {
    return NextResponse.json({ error: "无权限，仅管理员可操作" }, { status: 403 });
  }

  const targetId = parseInt((ctx?.params as Record<string, string>)?.id ?? "");
  if (isNaN(targetId)) {
    return NextResponse.json({ error: "部门 ID 无效" }, { status: 400 });
  }

  const dept = await prisma.department.findUnique({ where: { id: targetId } });
  if (!dept) {
    return NextResponse.json({ error: "部门不存在" }, { status: 404 });
  }

  // 拒绝删除有用户的部门
  const userCount = await prisma.user.count({ where: { departmentId: targetId } });
  if (userCount > 0) {
    return NextResponse.json(
      { error: `部门下还有 ${userCount} 名用户，请先将用户移出该部门再删除` },
      { status: 409 },
    );
  }

  // 拒绝删除有子部门的部门
  const childCount = await prisma.department.count({ where: { parentId: targetId } });
  if (childCount > 0) {
    return NextResponse.json(
      { error: `部门下还有 ${childCount} 个子部门，请先删除子部门` },
      { status: 409 },
    );
  }

  await prisma.department.delete({ where: { id: targetId } });

  logger.info({ user: userId }, `管理员删除部门 ${targetId}（${dept.name}）`);

  return NextResponse.json({ ok: true });
}

export const PATCH = withApiLogger(patchHandler);
export const DELETE = withApiLogger(deleteHandler);
