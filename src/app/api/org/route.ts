/**
 * GET  /api/org → 获取部门列表和汇报关系（全局数据，只读）
 * PUT  /api/org → 更新组织汇报关系（管理员操作）
 *
 * 规范 1-4：withApiLogger 包裹
 * 规范 4-3：getAuth 验证身份
 */

import { NextResponse, type NextRequest } from "next/server";
import { withApiLogger } from "@/lib/withApiLogger";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import type { Department, OrgRelation } from "@/types";

// ──────────────────────────────────────────────────────────────
// GET /api/org
// ──────────────────────────────────────────────────────────────
async function getHandler(req: NextRequest): Promise<NextResponse> {
  const { userId } = await getAuth(req);

  const [departments, orgRelations] = await Promise.all([
    prisma.department.findMany({ orderBy: { id: "asc" } }),
    prisma.orgRelation.findMany({ orderBy: { id: "asc" } }),
  ]);

  logger.info(
    { user: userId, method: "GET", path: "/api/org" },
    `加载组织：${departments.length} 个部门，${orgRelations.length} 条汇报关系`,
  );

  const result = {
    departments: departments.map(serializeDept),
    relations: orgRelations.map(serializeOrgRelation),
  };

  return NextResponse.json(result);
}

// ──────────────────────────────────────────────────────────────
// PUT /api/org  （管理员：同步组织关系，目前仅允许 CEO/VP）
// ──────────────────────────────────────────────────────────────
async function putHandler(req: NextRequest): Promise<NextResponse> {
  const { userId } = await getAuth(req);

  // 简化权限校验：仅管理级别用户可修改（DB 中 jobTitle 包含 VP/CEO 判定）
  const operator = await prisma.user.findUnique({ where: { id: userId } });
  if (
    !operator ||
    !["CEO", "VP", "产品VP", "研发VP", "设计总监"].some((t) =>
      operator.jobTitle.includes(t),
    )
  ) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = (await req.json()) as {
    departments?: Department[];
    relations?: OrgRelation[];
  };

  logger.info(
    { user: userId, method: "PUT", path: "/api/org" },
    `更新组织：${body.departments?.length ?? 0} 个部门，${body.relations?.length ?? 0} 条关系`,
  );

  await prisma.$transaction(async (tx) => {
    // 同步部门（仅更新 name/parentId，不删除；前端序列化时部门 ID 为字符串需转换）
    for (const dept of body.departments ?? []) {
      const numId = Number(dept.id);
      if (!numId) continue;
      await tx.department.updateMany({
        where: { id: numId },
        data: {
          name: dept.name,
          parentId: dept.parentId ? Number(dept.parentId) : null,
        },
      });
    }

    // 同步汇报关系（全量：先删用户相关旧记录，再插入新记录）
    if (body.relations) {
      await tx.orgRelation.deleteMany({});
      for (const rel of body.relations) {
        const subordinateId = Number(rel.subordinateId);
        const managerId = Number(rel.managerId);
        if (!subordinateId || !managerId) continue;
        await tx.orgRelation.create({
          data: {
            subordinateId,
            managerId,
            relationType: rel.relationType,
            effectiveFrom: rel.effectiveFrom,
            effectiveTo: rel.effectiveTo ?? null,
          },
        });
      }
    }
  });

  return NextResponse.json({ ok: true });
}

export const GET = withApiLogger(getHandler);
export const PUT = withApiLogger(putHandler);

// ──────────────────────────────────────────────────────────────
// 序列化工具（数值 ID → 字符串）
// ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeDept(d: any): Department {
  return {
    id: String(d.id),
    name: d.name,
    parentId: d.parentId ? String(d.parentId) : undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeOrgRelation(r: any): OrgRelation {
  return {
    id: String(r.id),
    subordinateId: String(r.subordinateId),
    managerId: String(r.managerId),
    relationType: r.relationType,
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo ?? undefined,
  };
}
