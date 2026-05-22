/**
 * POST /api/admin/dingtalk/sync-departments — 从钉钉同步组织架构（仅管理员）
 *
 * 逻辑：
 *  1. BFS 拉取钉钉全量部门树（fetchDingtalkDeptTree）
 *  2. 按 BFS 顺序 upsert 到 departments 表
 *     - 命中 dingDeptId → update name / parentId
 *     - 未命中 → create，parentId 通过 dingDeptId→dbId 映射表解析
 *  3. 返回同步摘要：{ total, created, updated }
 *
 * 规范 1-4：withApiLogger 包裹
 * 规范 4-2：操作前校验 isAdmin
 * 规范 4-3：getAuth 鉴权
 */

import { NextResponse, type NextRequest } from "next/server";
import { withApiLogger } from "@/lib/withApiLogger";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { fetchDingtalkDeptTree } from "@/lib/dingtalk";
import { logger } from "@/lib/logger";

async function postHandler(req: NextRequest): Promise<NextResponse> {
  const { userId } = await getAuth(req);

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me?.isAdmin) {
    return NextResponse.json({ error: "无权限，仅管理员可操作" }, { status: 403 });
  }

  logger.info({ user: userId }, "开始从钉钉同步部门树");

  let deptTree;
  try {
    deptTree = await fetchDingtalkDeptTree();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ user: userId, err }, `拉取钉钉部门树失败：${msg}`);
    return NextResponse.json({ error: `拉取钉钉部门树失败：${msg}` }, { status: 502 });
  }

  logger.info({ user: userId }, `钉钉部门树拉取完成，共 ${deptTree.length} 个部门`);

  // dingDeptId → 数据库 id 的映射（用于解析父子关系）
  const dingToDb = new Map<number, number>();

  // 预加载数据库中已有 dingDeptId 的部门
  const existingDepts = await prisma.department.findMany({
    where: { dingDeptId: { not: null } },
    select: { id: true, dingDeptId: true },
  });
  for (const d of existingDepts) {
    if (d.dingDeptId !== null) {
      dingToDb.set(d.dingDeptId, d.id);
    }
  }

  let created = 0;
  let updated = 0;

  // BFS 顺序保证父先于子，逐条 upsert
  for (const dept of deptTree) {
    // 解析父部门 dbId（根节点 parentDeptId=null，parentDbId 保持 null）
    let parentDbId: number | null = null;
    if (dept.parentDeptId !== null) {
      parentDbId = dingToDb.get(dept.parentDeptId) ?? null;
      if (parentDbId === null) {
        logger.warn(
          { user: userId, deptId: dept.deptId, parentDeptId: dept.parentDeptId },
          "父部门 dingDeptId 在数据库中未找到对应记录，parentId 置 NULL",
        );
      }
    }

    // 优先按 dingDeptId 查找已有记录
    let existing = await prisma.department.findUnique({
      where: { dingDeptId: dept.deptId },
    });

    // 根节点（parentDeptId=null）未命中时，回退到数据库中 parentId=NULL 的顶级部门（覆盖初始化数据）
    if (!existing && dept.parentDeptId === null) {
      existing = await prisma.department.findFirst({
        where: { parentId: null },
        orderBy: { id: "asc" },
      });
      if (existing) {
        logger.info(
          { user: userId, deptId: dept.deptId, dbId: existing.id },
          `根节点覆盖：钉钉 dept_id=${dept.deptId}「${dept.name}」→ 数据库「${existing.name}」(id=${existing.id})`,
        );
      }
    }

    if (existing) {
      await prisma.department.update({
        where: { id: existing.id },
        data: { name: dept.name, parentId: parentDbId, dingDeptId: dept.deptId },
      });
      dingToDb.set(dept.deptId, existing.id);
      updated++;
      logger.info(
        { user: userId, deptId: dept.deptId, dbId: existing.id },
        `更新部门：${dept.name}`,
      );
    } else {
      const created_ = await prisma.department.create({
        data: {
          name: dept.name,
          parentId: parentDbId,
          dingDeptId: dept.deptId,
        },
      });
      dingToDb.set(dept.deptId, created_.id);
      created++;
      logger.info(
        { user: userId, deptId: dept.deptId, dbId: created_.id },
        `创建部门：${dept.name}`,
      );
    }
  }

  logger.info(
    { user: userId },
    `钉钉部门同步完成：total=${deptTree.length} created=${created} updated=${updated}`,
  );

  return NextResponse.json({
    ok: true,
    total: deptTree.length,
    created,
    updated,
  });
}

export const POST = withApiLogger(postHandler);
