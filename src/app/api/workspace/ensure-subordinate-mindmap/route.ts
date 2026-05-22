/**
 * POST /api/workspace/ensure-subordinate-mindmap
 *
 * 按需为下属创建当前年度导图和骨架节点。
 * 调用方（上级）在 AssignDialog 指派任务前，若发现某下属尚无年度导图，
 * 则调用此接口完成初始化，并将结果合并到本地 store，确保后续指派能正常解析。
 *
 * 规范 1-4：withApiLogger 包裹
 * 规范 4-2：校验调用方确实是目标用户的上级（User.managerId 或 OrgRelation solid）
 * 规范 4-3：getAuth 验证身份
 */

import { NextResponse, type NextRequest } from "next/server";
import { withApiLogger } from "@/lib/withApiLogger";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";

const currentYear = new Date().getFullYear();

async function handler(req: NextRequest) {
  const { userId } = await getAuth(req);
  const logCtx = { user: userId, method: "POST", path: "/api/workspace/ensure-subordinate-mindmap" };

  const body = await req.json();
  const subordinateId = Number(body?.subordinateId);
  if (!subordinateId || isNaN(subordinateId)) {
    logger.warn(logCtx, "参数缺失：subordinateId");
    return NextResponse.json({ error: "subordinateId 参数必填" }, { status: 400 });
  }

  // ── 权限校验：调用方必须是目标用户的直接或间接上级 ──────────────
  const targetUser = await prisma.user.findUnique({
    where: { id: subordinateId },
    select: { id: true, managerId: true },
  });
  if (!targetUser) {
    return NextResponse.json({ error: "目标用户不存在" }, { status: 404 });
  }

  // 检查 User.managerId 链 或 OrgRelation solid
  const isDirectManager = targetUser.managerId === userId;
  const solidRelation = isDirectManager
    ? null
    : await prisma.orgRelation.findFirst({
        where: {
          managerId: userId,
          subordinateId: subordinateId,
          relationType: "solid",
        },
      });

  if (!isDirectManager && !solidRelation) {
    logger.warn(logCtx, `用户 ${userId} 无权为 ${subordinateId} 初始化导图（非其上级）`);
    return NextResponse.json({ error: "无权限：您不是该用户的上级" }, { status: 403 });
  }

  // ── 幂等：若已存在年度导图则直接返回 ──────────────────────────────
  const existing = await prisma.mindMap.findFirst({
    where: {
      ownerId: subordinateId,
      useAnnualTemplate: true,
      year: currentYear,
    },
  });

  if (existing) {
    const skeletonNodes = await prisma.node.findMany({
      where: {
        mindmapId: existing.id,
        nodeType: "skeleton",
        isDeleted: false,
      },
    });
    logger.info(logCtx, `下属 ${subordinateId} 年度导图已存在 mindmapId=${existing.id}，直接返回`);
    return NextResponse.json({ mindmap: existing, skeletonNodes });
  }

  // ── 创建年度导图 + 17 个骨架节点 ──────────────────────────────────
  logger.info(logCtx, `为下属 ${subordinateId} 创建 ${currentYear} 年度导图`);

  const newMm = await prisma.mindMap.create({
    data: {
      ownerId: subordinateId,
      year: currentYear,
      title: `${currentYear} 工作计划`,
      structure: "right-logic",
      theme: "snowbrush",
      useAnnualTemplate: true,
    },
  });

  const yearNode = await prisma.node.create({
    data: {
      mindmapId: newMm.id,
      sortOrder: 0,
      title: `${currentYear} 工作计划`,
      nodeType: "skeleton",
      timeBucketKind: "year",
      timeBucketValue: `${currentYear}`,
      createdBy: subordinateId,
      isDeleted: false,
    },
  });

  const monthNodes = [];
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, "0");
    const node = await prisma.node.create({
      data: {
        mindmapId: newMm.id,
        parentId: yearNode.id,
        sortOrder: m - 1,
        title: `${m} 月`,
        nodeType: "skeleton",
        timeBucketKind: "month",
        timeBucketValue: `${currentYear}-${mm}`,
        createdBy: subordinateId,
        isDeleted: false,
      },
    });
    monthNodes.push(node);
  }

  const quarterNodes = [];
  for (let q = 1; q <= 4; q++) {
    const node = await prisma.node.create({
      data: {
        mindmapId: newMm.id,
        parentId: yearNode.id,
        sortOrder: 100 + q - 1,
        title: `Q${q} 主要工作`,
        nodeType: "skeleton",
        timeBucketKind: "quarter",
        timeBucketValue: `${currentYear}Q${q}`,
        createdBy: subordinateId,
        isDeleted: false,
      },
    });
    quarterNodes.push(node);
  }

  const skeletonNodes = [yearNode, ...monthNodes, ...quarterNodes];
  logger.info(logCtx, `下属 ${subordinateId} 年度导图创建完成 mindmapId=${newMm.id}，共 ${skeletonNodes.length} 个骨架节点`);

  return NextResponse.json({ mindmap: newMm, skeletonNodes }, { status: 201 });
}

export const POST = withApiLogger(handler);
