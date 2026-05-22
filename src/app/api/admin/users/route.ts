/**
 * GET  /api/admin/users  — 查询用户列表（仅管理员）
 * POST /api/admin/users  — 创建用户，初始密码为工号，mustResetPassword=true（仅管理员）
 *
 * 规范 1-4：withApiLogger 包裹
 * 规范 4-2：操作前校验 isAdmin
 * 规范 4-3：getAuth 鉴权
 */

import { NextResponse, type NextRequest } from "next/server";
import { withApiLogger } from "@/lib/withApiLogger";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { hashPassword } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { getDingtalkUserDetail } from "@/lib/dingtalk";

/** 初始密码为用户工号，用户首次登录后必须修改 */

// ── 工具：序列化用户行 ──────────────────────────────────────────
function serializeUser(u: {
  id: number;
  employeeNo: string;
  name: string;
  email: string;
  avatar: string | null;
  departmentId: number;
  jobTitle: string;
  status: string;
  isAdmin: boolean;
  dingtalkBound: boolean;
  dingtalkUserId: string | null;
  managerId: number | null;
  managerSource: string | null;
  pendingManagerId: number | null;
  mustResetPassword: boolean;
  manager?: { id: number; name: string; jobTitle: string } | null;
  pendingManager?: { id: number; name: string } | null;
}) {
  return {
    id: String(u.id),
    employeeNo: u.employeeNo,
    name: u.name,
    email: u.email,
    avatar: u.avatar ?? undefined,
    departmentId: String(u.departmentId),
    jobTitle: u.jobTitle,
    status: u.status,
    isAdmin: u.isAdmin,
    dingtalkBound: u.dingtalkBound,
    dingtalkUserId: u.dingtalkUserId ?? undefined,
    managerId: u.managerId ? String(u.managerId) : undefined,
    managerName: u.manager?.name ?? undefined,
    managerJobTitle: u.manager?.jobTitle ?? undefined,
    managerSource: u.managerSource ?? undefined,
    pendingManagerId: u.pendingManagerId ? String(u.pendingManagerId) : undefined,
    pendingManagerName: u.pendingManager?.name ?? undefined,
    mustResetPassword: u.mustResetPassword,
  };
}

const USER_SELECT = {
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
  managerSource: true,
  pendingManagerId: true,
  mustResetPassword: true,
  manager: { select: { id: true, name: true, jobTitle: true } },
  pendingManager: { select: { id: true, name: true } },
} as const;

// ── GET ────────────────────────────────────────────────────────
// 支持以下查询参数：
//   all=true          返回全量列表（不分页，用于下拉框）
//   page=1            当前页（默认 1）
//   pageSize=20       每页条数（默认 20，最大 100）
//   keyword=xxx       按姓名/工号/职位模糊搜索
//   status=active     按状态筛选（active | disabled）
//   deptId=123        按部门筛选
async function getHandler(req: NextRequest): Promise<NextResponse> {
  const { userId } = await getAuth(req);

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me?.isAdmin) {
    return NextResponse.json({ error: "无权限，仅管理员可访问" }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;
  const all = sp.get("all") === "true";
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(sp.get("pageSize") ?? "20", 10)));
  const keyword = sp.get("keyword")?.trim() ?? "";
  const statusFilter = sp.get("status")?.trim() ?? "";
  const deptId = sp.get("deptId")?.trim() ?? "";
  const hasPendingManager = sp.get("hasPendingManager") === "true";
  const dingtalkUserIdFilter = sp.get("dingtalkUserId")?.trim() ?? "";

  // 构造 where 条件
  const andConditions: object[] = [];
  if (keyword) {
    andConditions.push({
      OR: [
        { name: { contains: keyword } },
        { employeeNo: { contains: keyword } },
        { jobTitle: { contains: keyword } },
      ],
    });
  }
  if (statusFilter) andConditions.push({ status: statusFilter });
  if (deptId) andConditions.push({ departmentId: parseInt(deptId, 10) });
  if (hasPendingManager) andConditions.push({ pendingManagerId: { not: null } });
  if (dingtalkUserIdFilter) andConditions.push({ dingtalkUserId: dingtalkUserIdFilter });
  const where = andConditions.length > 0 ? { AND: andConditions } : {};

  // all=true：全量返回（用于下拉框）
  if (all) {
    const users = await prisma.user.findMany({
      where,
      orderBy: { id: "asc" },
      select: USER_SELECT,
    });
    return NextResponse.json({ users: users.map(serializeUser) });
  }

  // 分页返回
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { id: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: USER_SELECT,
    }),
  ]);

  return NextResponse.json({ users: users.map(serializeUser), total, page, pageSize });
}

// ── POST ───────────────────────────────────────────────────────
async function postHandler(req: NextRequest): Promise<NextResponse> {
  const { userId } = await getAuth(req);

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me?.isAdmin) {
    return NextResponse.json({ error: "无权限，仅管理员可操作" }, { status: 403 });
  }

  const body = (await req.json()) as {
    employeeNo?: string;
    name?: string;
    email?: string;
    departmentId?: string;
    jobTitle?: string;
    avatar?: string;
    managerId?: string;
    dingtalkUserId?: string;
  };

  const { employeeNo, name, email, departmentId, jobTitle, avatar, managerId, dingtalkUserId } = body;

  if (!employeeNo?.trim()) return NextResponse.json({ error: "工号不能为空" }, { status: 400 });
  if (!name?.trim()) return NextResponse.json({ error: "姓名不能为空" }, { status: 400 });
  if (!departmentId) return NextResponse.json({ error: "部门不能为空" }, { status: 400 });
  if (!jobTitle?.trim()) return NextResponse.json({ error: "职位不能为空" }, { status: 400 });

  // 工号唯一性校验
  const existing = await prisma.user.findUnique({ where: { employeeNo: employeeNo.trim() } });
  if (existing) {
    return NextResponse.json({ error: "工号已存在" }, { status: 409 });
  }

  // 部门存在性校验（规范 4-2：后端独立鉴权，不信任前端传值）
  const dept = await prisma.department.findUnique({ where: { id: parseInt(departmentId) } });
  if (!dept) {
    return NextResponse.json({ error: "部门不存在" }, { status: 400 });
  }

  // 直接上级存在性校验（如果指定）
  let managerDbId: number | null = null;
  if (managerId) {
    managerDbId = parseInt(managerId);
    if (isNaN(managerDbId)) return NextResponse.json({ error: "直接上级 ID 无效" }, { status: 400 });
    const mgr = await prisma.user.findUnique({ where: { id: managerDbId } });
    if (!mgr) return NextResponse.json({ error: "指定的直接上级不存在" }, { status: 400 });
  }

  // 未手动指定上级，但有钉钉 ID → 尝试从钉钉自动解析上级
  let autoManagerSource: string | null = null;
  if (!managerDbId && dingtalkUserId?.trim()) {
    try {
      const detail = await getDingtalkUserDetail(dingtalkUserId.trim());
      const dtManagerUserId = detail?.managerUserId;
      if (dtManagerUserId) {
        const dtMgr = await prisma.user.findFirst({ where: { dingtalkUserId: dtManagerUserId } });
        if (dtMgr) {
          managerDbId = dtMgr.id;
          autoManagerSource = "dingtalk";
          logger.info({ user: userId }, `新建用户自动解析上级：钉钉 ${dtManagerUserId} → DB 用户 ${dtMgr.id} ${dtMgr.name}`);
        }
      }
    } catch (e) {
      // 自动解析失败不阻断创建流程，仅记录警告
      logger.warn({ user: userId }, `新建用户自动解析钉钉上级失败：${(e as Error).message}`);
    }
  }

  const passwordHash = await hashPassword(employeeNo.trim());

  const created = await prisma.user.create({
    data: {
      employeeNo: employeeNo.trim(),
      name: name.trim(),
      email: email?.trim() || `${employeeNo.trim()}@company.local`,
      avatar: avatar?.trim() || null,
      departmentId: parseInt(departmentId),
      jobTitle: jobTitle.trim(),
      status: "active",
      passwordHash,
      isAdmin: false,
      managerId: managerDbId,
      // 手动指定上级 → "manual"；钉钉自动解析 → "dingtalk"；未设置 → null
      managerSource: managerId ? "manual" : autoManagerSource,
      mustResetPassword: true,
      // 钉钉绑定（新建时可选）
      ...(dingtalkUserId?.trim() ? {
        dingtalkUserId: dingtalkUserId.trim(),
        dingtalkBound: true,
      } : {}),
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
      managerSource: true,
      pendingManagerId: true,
      mustResetPassword: true,
      manager: { select: { id: true, name: true, jobTitle: true } },
      pendingManager: { select: { id: true, name: true } },
    },
  });

  // 同步 OrgRelation：若设置了直属上级，创建实线汇报关系
  if (managerDbId) {
    const today = new Date().toISOString().slice(0, 10);
    await prisma.orgRelation.create({
      data: {
        subordinateId: created.id,
        managerId: managerDbId,
        relationType: "solid",
        effectiveFrom: today,
        effectiveTo: null,
      },
    });
    logger.info(
      { user: userId },
      `同步 OrgRelation：新用户 ${created.id} → 上级 ${managerDbId}（solid）`,
    );
  }

  logger.info(
    { user: userId },
    `管理员创建用户：${created.employeeNo} ${created.name}`,
  );

  return NextResponse.json({ user: serializeUser(created) }, { status: 201 });
}

export const GET = withApiLogger(getHandler);
export const POST = withApiLogger(postHandler);
