/**
 * PATCH  /api/admin/users/[id]  — 更新用户信息（仅管理员）
 * DELETE /api/admin/users/[id]  — 禁用用户（软删除，仅管理员）
 *
 * 规范 1-4：withApiLogger 包裹
 * 规范 4-2：操作前校验 isAdmin，且禁止管理员禁用自身
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
    return NextResponse.json({ error: "用户 ID 无效" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  const body = (await req.json()) as {
    name?: string;
    email?: string;
    avatar?: string;
    departmentId?: string;
    jobTitle?: string;
    status?: string;
    isAdmin?: boolean;
    managerId?: string | null;
    dingtalkUserId?: string | null;
  };

  // 部门存在性校验
  if (body.departmentId !== undefined) {
    const dept = await prisma.department.findUnique({ where: { id: parseInt(body.departmentId) } });
    if (!dept) {
      return NextResponse.json({ error: "部门不存在" }, { status: 400 });
    }
  }

  // 直接上级存在性校验
  let managerDbId: number | null | undefined = undefined;
  if (body.managerId !== undefined) {
    if (body.managerId === null || body.managerId === "") {
      managerDbId = null;
    } else {
      const mid = parseInt(body.managerId);
      if (isNaN(mid)) return NextResponse.json({ error: "直接上级 ID 无效" }, { status: 400 });
      if (mid === targetId) return NextResponse.json({ error: "不能将自己设为自己的上级" }, { status: 400 });
      const mgr = await prisma.user.findUnique({ where: { id: mid } });
      if (!mgr) return NextResponse.json({ error: "指定的直接上级不存在" }, { status: 400 });
      managerDbId = mid;
    }
  }

  // 禁止把自己的 isAdmin 去掉（防止锁死系统）
  if (targetId === userId && body.isAdmin === false) {
    return NextResponse.json({ error: "不能取消自己的管理员权限" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: targetId },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.email !== undefined && { email: body.email.trim() }),
      ...(body.avatar !== undefined && { avatar: body.avatar.trim() || null }),
      ...(body.departmentId !== undefined && { departmentId: parseInt(body.departmentId) }),
      ...(body.jobTitle !== undefined && { jobTitle: body.jobTitle.trim() }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.isAdmin !== undefined && { isAdmin: body.isAdmin }),
      ...(managerDbId !== undefined && {
        managerId: managerDbId,
        // 手动设置上级 → 标记来源为 manual，同时清除待确认冲突
        managerSource: managerDbId ? "manual" : null,
        pendingManagerId: null,
      }),
      // dingtalkUserId：非空字符串→写入并置 dingtalkBound=true；空/null→清空并置 dingtalkBound=false
      ...(body.dingtalkUserId !== undefined && {
        dingtalkUserId: body.dingtalkUserId?.trim() || null,
        dingtalkBound: !!(body.dingtalkUserId?.trim()),
      }),
    },
    select: {
      id: true,
      employeeNo: true,
      name: true,
      email: true,
      avatar: true,
      departmentId: true,
      jobTitle: true,
      status: true,
      isAdmin: true,
      dingtalkBound: true,
      dingtalkUserId: true,
      managerId: true,
      mustResetPassword: true,
    },
  });

  // 同步 OrgRelation：managerId 字段有变更时，重建实线汇报关系
  if (managerDbId !== undefined) {
    // 删除该用户现有的所有实线上级关系
    await prisma.orgRelation.deleteMany({
      where: { subordinateId: targetId, relationType: "solid" },
    });
    if (managerDbId !== null) {
      const today = new Date().toISOString().slice(0, 10);
      await prisma.orgRelation.create({
        data: {
          subordinateId: targetId,
          managerId: managerDbId,
          relationType: "solid",
          effectiveFrom: today,
          effectiveTo: null,
        },
      });
      logger.info(
        { user: userId },
        `同步 OrgRelation：用户 ${targetId} → 新上级 ${managerDbId}（solid）`,
      );
    } else {
      logger.info(
        { user: userId },
        `同步 OrgRelation：清除用户 ${targetId} 的实线上级关系`,
      );
    }
  }

  logger.info({ user: userId }, `管理员更新用户 ${targetId}：${JSON.stringify(body)}`);

  return NextResponse.json({
    user: {
      id: String(updated.id),
      employeeNo: updated.employeeNo,
      name: updated.name,
      email: updated.email,
      avatar: updated.avatar ?? undefined,
      departmentId: String(updated.departmentId),
      jobTitle: updated.jobTitle,
      status: updated.status,
      isAdmin: updated.isAdmin,
      dingtalkBound: updated.dingtalkBound,
      dingtalkUserId: updated.dingtalkUserId ?? undefined,
      managerId: updated.managerId ? String(updated.managerId) : undefined,
      mustResetPassword: updated.mustResetPassword,
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
    return NextResponse.json({ error: "用户 ID 无效" }, { status: 400 });
  }

  // 禁止管理员删除自身
  if (targetId === userId) {
    return NextResponse.json({ error: "不能禁用自己的账号" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  // 软删除：状态改为 disabled
  await prisma.user.update({
    where: { id: targetId },
    data: { status: "disabled" },
  });

  logger.info({ user: userId }, `管理员禁用用户 ${targetId}（${target.employeeNo} ${target.name}）`);

  return NextResponse.json({ ok: true });
}

export const PATCH = withApiLogger(patchHandler);
export const DELETE = withApiLogger(deleteHandler);
