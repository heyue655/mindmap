/**
 * GET  /api/workspace  → 获取当前用户的完整工作区快照
 * PUT  /api/workspace  → 保存（全量快照 upsert+delete）工作区，返回 idMap
 *
 * 规范 1-4：withApiLogger 包裹
 * 规范 4-2：所有查询附带 userId 条件，防止越权
 * 规范 4-3：getAuth 验证身份
 *
 * PUT 核心逻辑：
 *  1. 字符串临时 ID（前端新建）→ INSERT，记录到 idMap
 *  2. 数字 ID → UPDATE（附带 userId 条件）
 *  3. DB 中属于当前用户、但快照中不存在的记录 → 软删除
 *  4. 跳过空节点（title 为空白）及其所有级联引用
 *  5. 返回 { ok: true, idMap: { "n-abc": "12345" } }
 */

import { NextResponse, type NextRequest } from "next/server";
import { withApiLogger } from "@/lib/withApiLogger";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import type { WorkspaceSnapshot } from "@/types/workspaceSnapshot";
import { pushPendingDingtalkNotifs, type PendingDingtalkNotif } from "@/lib/dingtalk";

// Prisma Json 字段类型辅助：绕过 InputJsonValue 的严格类型约束
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function j(v: unknown): any { return v ?? null; }
// Json 字段 undefined 语义（不更新该字段）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ju(v: unknown): any { return v ?? undefined; }

// ──────────────────────────────────────────────────────────────
// 工具函数
// ──────────────────────────────────────────────────────────────

/** 判断是否为前端生成的临时字符串 ID（非纯数字） */
function isTempId(id: string | undefined | null): boolean {
  if (!id) return false;
  return isNaN(Number(id)) || !id;
}

/** 将临时 ID 或数字字符串 ID 解析为数字；临时 ID 返回 null */
function parseDbId(id: string | undefined | null): number | null {
  if (!id) return null;
  const n = Number(id);
  return isNaN(n) || n <= 0 ? null : n;
}

/** 通过 idMap 解析外键：若为临时 ID 则查映射表；否则直接转数字 */
function resolveId(
  id: string | undefined | null,
  idMap: Map<string, number>,
): number | null {
  if (!id) return null;
  if (isTempId(id)) return idMap.get(id) ?? null;
  return parseDbId(id);
}

// ──────────────────────────────────────────────────────────────
// GET /api/workspace
// ──────────────────────────────────────────────────────────────
async function getHandler(req: NextRequest): Promise<NextResponse> {
  const { userId } = await getAuth(req);

  // ── 自动初始化：若当前用户名下没有当前年份的年度导图，自动创建 ──
  const currentYear = new Date().getFullYear();
  const existingAnnual = await prisma.mindMap.findFirst({
    where: { ownerId: userId, year: currentYear, useAnnualTemplate: true },
  });

  if (!existingAnnual) {
    logger.info(
      { user: userId, method: "GET", path: "/api/workspace" },
      `用户 ${userId} 无 ${currentYear} 年度导图，自动创建`,
    );
    const newMm = await prisma.mindMap.create({
      data: {
        ownerId: userId,
        year: currentYear,
        title: `${currentYear} 工作计划`,
        structure: "right-logic",
        theme: "snowbrush",
        useAnnualTemplate: true,
      },
    });

    // 创建骨架节点：年根节点
    const yearNode = await prisma.node.create({
      data: {
        mindmapId: newMm.id,
        sortOrder: 0,
        title: `${currentYear} 工作计划`,
        nodeType: "skeleton",
        timeBucketKind: "year",
        timeBucketValue: `${currentYear}`,
        createdBy: userId,
        isDeleted: false,
      },
    });

    // 12 个月
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, "0");
      await prisma.node.create({
        data: {
          mindmapId: newMm.id,
          parentId: yearNode.id,
          sortOrder: m - 1,
          title: `${m} 月`,
          nodeType: "skeleton",
          timeBucketKind: "month",
          timeBucketValue: `${currentYear}-${mm}`,
          createdBy: userId,
          isDeleted: false,
        },
      });
    }

    // 4 个季度
    for (let q = 1; q <= 4; q++) {
      await prisma.node.create({
        data: {
          mindmapId: newMm.id,
          parentId: yearNode.id,
          sortOrder: 100 + q - 1,
          title: `Q${q} 主要工作`,
          nodeType: "skeleton",
          timeBucketKind: "quarter",
          timeBucketValue: `${currentYear}Q${q}`,
          createdBy: userId,
          isDeleted: false,
        },
      });
    }
  }

  const [
    users,
    mindmaps,
    nodes,
    assignments,
    follows,
    shares,
    logs,
    notifications,
    relationships,
    calendarSyncs,
    mentions,
    workReports,
  ] = await Promise.all([
    prisma.user.findMany({ where: { status: "active" } }),
    prisma.mindMap.findMany({ where: { ownerId: userId } }),
    prisma.node.findMany({
      where: { mindmap: { ownerId: userId }, isDeleted: false },
    }),
    prisma.assignment.findMany({
      where: { OR: [{ assignerId: userId }, { assigneeId: userId }] },
    }),
    prisma.followGrant.findMany({
      where: { OR: [{ requesterId: userId }, { granteeId: userId }] },
    }),
    prisma.nodeShare.findMany({
      where: { OR: [{ sharerId: userId }, { audienceId: userId }] },
    }),
    prisma.taskLog.findMany({
      where: { node: { mindmap: { ownerId: userId } } },
    }),
    prisma.appNotification.findMany({
      where: { recipientId: userId },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.mindMap.findMany({ where: { ownerId: userId } }).then((mms) =>
      prisma.relationship.findMany({
        where: { mindmapId: { in: mms.map((m) => m.id) } },
      }),
    ),
    prisma.calendarSync.findMany({ where: { userId } }),
    prisma.mentionEvent.findMany({
      where: { OR: [{ byUserId: userId }, { mentionedUserId: userId }] },
    }),
    prisma.workReport.findMany({ where: { authorId: userId } }),
  ]);

  // ── 跨用户节点加载 ────────────────────────────────────────────
  // 收集当前用户作为 grantee 的所有 FollowGrant.targetNodeId（含 pending，
  // 确保上级审批时 target 节点已在 store 中），以及作为 assigner 的
  // Assignment.resultNodeId，然后加载这些节点所在的完整导图及其全部节点。
  const ownMindmapIds = new Set(mindmaps.map((m) => m.id));

  const crossNodeIds = new Set<number>();
  for (const f of follows) {
    if (f.granteeId === userId) crossNodeIds.add(f.targetNodeId);
  }
  for (const a of assignments) {
    if (a.assignerId === userId && a.resultNodeId) crossNodeIds.add(a.resultNodeId);
  }

  let extraMindmaps: typeof mindmaps = [];
  let extraNodes: typeof nodes = [];
  let extraRelationships: typeof relationships = [];
  let extraLogs: typeof logs = [];

  if (crossNodeIds.size > 0) {
    // 先找到这些节点所在的导图 ID（排除当前用户自有的导图）
    const crossNodes = await prisma.node.findMany({
      where: { id: { in: [...crossNodeIds] } },
      select: { mindmapId: true },
    });
    const extraMindmapIds = [
      ...new Set(
        crossNodes.map((n) => n.mindmapId).filter((id) => !ownMindmapIds.has(id)),
      ),
    ];

    if (extraMindmapIds.length > 0) {
      [extraMindmaps, extraNodes, extraRelationships, extraLogs] =
        await Promise.all([
          prisma.mindMap.findMany({ where: { id: { in: extraMindmapIds } } }),
          prisma.node.findMany({
            where: { mindmapId: { in: extraMindmapIds }, isDeleted: false },
          }),
          prisma.relationship.findMany({
            where: { mindmapId: { in: extraMindmapIds } },
          }),
          prisma.taskLog.findMany({
            where: { node: { mindmapId: { in: extraMindmapIds } } },
          }),
        ]);
    }
  }

  // ── 下属骨架数据加载（为"派任务"弹窗提供数据） ────────────────
  // 派任务时需要在下属的 mindmap 中找到对应时间桶的骨架节点。
  // 两路来源：① User.managerId 链 ② OrgRelation solid 关系，合并去重。
  const subordinateIds: number[] = [];
  {
    const visited = new Set<number>([userId]);
    const queue: number[] = [userId];

    // 预加载所有 solid OrgRelation，供 BFS 使用
    const allSolidRelations = await prisma.orgRelation.findMany({
      where: { relationType: "solid" },
      select: { managerId: true, subordinateId: true },
    });

    while (queue.length) {
      const curr = queue.shift()!;

      // 路径 ①：User.managerId 链
      for (const u of users) {
        const uid = u.id as number;
        const mid = u.managerId as number | null;
        if (mid === curr && !visited.has(uid)) {
          visited.add(uid);
          subordinateIds.push(uid);
          queue.push(uid);
        }
      }

      // 路径 ②：OrgRelation solid
      for (const rel of allSolidRelations) {
        const subId = rel.subordinateId as number;
        if ((rel.managerId as number) === curr && !visited.has(subId)) {
          visited.add(subId);
          subordinateIds.push(subId);
          queue.push(subId);
        }
      }
    }
  }

  let subMindmaps: typeof mindmaps = [];
  let subSkeletonNodes: typeof nodes = [];

  if (subordinateIds.length > 0) {
    subMindmaps = await prisma.mindMap.findMany({
      where: { ownerId: { in: subordinateIds } },
    });

    // 注：不再在上级登录时代为创建下属导图。
    // 如下属尚无年度导图，上级在 AssignDialog 派任务时会调用
    // POST /api/workspace/ensure-subordinate-mindmap 按需初始化。

    const subMindmapIds = subMindmaps.map((m) => m.id);
    if (subMindmapIds.length > 0) {
      subSkeletonNodes = await prisma.node.findMany({
        where: {
          mindmapId: { in: subMindmapIds },
          nodeType: "skeleton",
          isDeleted: false,
        },
      });
    }
  }

  logger.info(
    { user: userId, method: "GET", path: "/api/workspace" },
    `下属骨架加载：subordinateIds=[${subordinateIds.join(",")}]，` +
      `${subMindmaps.length} 个导图，${subSkeletonNodes.length} 个骨架节点`,
  );

  // 合并，以 id 去重（自有数据优先，排在前面）
  const mergedMindmaps = [
    ...mindmaps,
    ...extraMindmaps.filter((m) => !ownMindmapIds.has(m.id)),
    ...subMindmaps.filter((m) => !ownMindmapIds.has(m.id)),
  // 以 id 去重
  ].filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i);

  const ownNodeIds = new Set(nodes.map((n) => n.id));
  const extraNodeIds = new Set(extraNodes.map((n) => n.id));
  const mergedNodes = [
    ...nodes,
    ...extraNodes.filter((n) => !ownNodeIds.has(n.id)),
    ...subSkeletonNodes.filter((n) => !ownNodeIds.has(n.id) && !extraNodeIds.has(n.id)),
  ];
  const ownRelIds = new Set(relationships.map((r) => r.id));
  const mergedRelationships = [
    ...relationships,
    ...extraRelationships.filter((r) => !ownRelIds.has(r.id)),
  ];
  const ownLogIds = new Set(logs.map((l) => l.id));
  const mergedLogs = [
    ...logs,
    ...extraLogs.filter((l) => !ownLogIds.has(l.id)),
  ];

  logger.info(
    { user: userId, method: "GET", path: "/api/workspace" },
    `加载工作区：${mindmaps.length} 个导图，${nodes.length} 个节点；` +
      `跨用户额外加载 ${extraMindmaps.length} 个导图，${extraNodes.length} 个节点；` +
      `下属骨架加载 ${subordinateIds.length} 人，${subMindmaps.length} 个导图，${subSkeletonNodes.length} 个骨架节点`,
  );

  // ── 服务端 reconciliation：补齐 assigner 侧的 taskPeer 互链 ─────────────
  // 问题根因：assignerSourceNodeId 从未持久化到 DB，升级逻辑跑在 assignee 侧，
  // 而 assigner 节点不在 assignee store 中 → 升级静默失败。
  // 修复策略（pull 模型）：每次 assigner 调用 GET /api/workspace 时，在服务端
  // 对满足条件的 assignment 补齐 source 节点的 taskPeer，并从 result 节点同步进度。
  {
    // 建立 mergedNodes 的可变副本，以便在循环中更新
    const nodeMap = new Map<number, (typeof mergedNodes)[0]>(
      mergedNodes.map((n) => [n.id as number, n]),
    );

    for (const asg of assignments) {
      const assignerId = asg.assignerId as number;
      const assigneeId = asg.assigneeId as number;
      const assignerSourceNodeId = asg.assignerSourceNodeId as number | null;
      const resultNodeId = asg.resultNodeId as number | null;
      const assignerMirrorNodeId = asg.assignerMirrorNodeId as number | null;

      // 仅处理当前用户是 assigner、已接受、有 source 节点和 result 节点的情况
      if (
        assignerId !== userId ||
        asg.state !== "accepted" ||
        !assignerSourceNodeId ||
        !resultNodeId
      ) {
        continue;
      }

      const srcNode = nodeMap.get(assignerSourceNodeId);
      const resNode = nodeMap.get(resultNodeId);
      if (!srcNode || !resNode) continue;

    const nowISO = new Date().toISOString();
    const nowDate = new Date();
    const srcLinked = !!(srcNode.taskPeer as { peerNodeId?: unknown } | null)?.peerNodeId;
    const resLinked = !!(resNode.taskPeer as { peerNodeId?: unknown } | null)?.peerNodeId;
    let srcUpdated = false;
    let resUpdated = false;

      if (!srcLinked) {
        // 上级 source 节点尚未建立 taskPeer → 升级并互链
        const managerPeer = {
          peerNodeId: String(resultNodeId),
          peerMindmapId: String((resNode as { mindmapId: number }).mindmapId),
          peerUserId: String(assigneeId),
          kind: "assignment",
          iAmExecutor: false,
          refAssignmentId: String(asg.id),
        };
        const upgradedSrc = {
          ...srcNode,
          task: resNode.task
            ? { ...(resNode.task as object) }
            : srcNode.task,
          taskPeer: managerPeer,
          updatedAt: nowDate,
        };
        nodeMap.set(assignerSourceNodeId, upgradedSrc);
        // 写入 DB（仅更新 task/taskPeer/updatedAt）
        await prisma.node.updateMany({
          where: { id: assignerSourceNodeId, mindmap: { ownerId: userId } },
          data: {
            task: j(upgradedSrc.task),
            taskPeer: j(managerPeer),
            updatedAt: nowDate,
          },
        });
        // 同步 assignment.assignerMirrorNodeId → source 节点 ID
        if (!assignerMirrorNodeId || assignerMirrorNodeId !== assignerSourceNodeId) {
          await prisma.assignment.updateMany({
            where: {
              id: asg.id as number,
              OR: [{ assignerId: userId }, { assigneeId: userId }],
            },
            data: { assignerMirrorNodeId: assignerSourceNodeId },
          });
          // 更新内存中的 assignment 记录以便序列化时正确输出
          (asg as { assignerMirrorNodeId: number | null }).assignerMirrorNodeId =
            assignerSourceNodeId;
        }
        srcUpdated = true;
        logger.info(
          { user: userId, method: "GET", path: "/api/workspace" },
          `[reconciliation] assignment ${asg.id}：升级 source 节点 ${assignerSourceNodeId}，写入 taskPeer`,
        );
      } else {
        // source 节点已有 taskPeer → 仅同步 result 节点的进度字段
        const resTask = resNode.task as {
          status?: string; progressPct?: number; deadline?: string; closedAt?: string;
        } | null;
        const srcTask = srcNode.task as {
          status?: string; progressPct?: number; deadline?: string; closedAt?: string;
        } | null;
        if (resTask && srcTask) {
          const needsSync =
            srcTask.status !== resTask.status ||
            srcTask.progressPct !== resTask.progressPct ||
            srcTask.deadline !== resTask.deadline ||
            srcTask.closedAt !== resTask.closedAt;
          if (needsSync) {
            const syncedTask = {
              ...(srcTask as object),
              status: resTask.status,
              progressPct: resTask.progressPct,
              deadline: resTask.deadline,
              closedAt: resTask.closedAt,
            };
            nodeMap.set(assignerSourceNodeId, {
              ...srcNode,
              task: syncedTask,
              updatedAt: nowDate,
            });
            await prisma.node.updateMany({
              where: { id: assignerSourceNodeId, mindmap: { ownerId: userId } },
              data: { task: j(syncedTask), updatedAt: nowDate },
            });
            srcUpdated = true;
            logger.info(
              { user: userId, method: "GET", path: "/api/workspace" },
              `[reconciliation] assignment ${asg.id}：同步进度到 source 节点 ${assignerSourceNodeId}`,
            );
          }
        }
      }

      if (!resLinked) {
        // result 节点尚未建立 executorPeer → 补齐
        const executorPeer = {
          peerNodeId: String(assignerSourceNodeId),
          peerMindmapId: String((srcNode as { mindmapId: number }).mindmapId),
          peerUserId: String(assignerId),
          kind: "assignment",
          iAmExecutor: true,
          syncProgressToPeer: true,
          refAssignmentId: String(asg.id),
        };
        nodeMap.set(resultNodeId, {
          ...resNode,
          taskPeer: executorPeer,
          updatedAt: nowDate,
        });
        // result 节点属于 assignee，不受 ownerId: userId 限制
        await prisma.node.updateMany({
          where: { id: resultNodeId },
          data: { taskPeer: j(executorPeer), updatedAt: nowDate },
        });
        resUpdated = true;
        logger.info(
          { user: userId, method: "GET", path: "/api/workspace" },
          `[reconciliation] assignment ${asg.id}：补齐 result 节点 ${resultNodeId} executorPeer`,
        );
      }

      void srcUpdated; void resUpdated; // 变量已用于 DB 写入，此处仅消除 lint 警告
      void nowISO;
    }

    // 将 nodeMap 的更新写回 mergedNodes（就地替换）
    for (let i = 0; i < mergedNodes.length; i++) {
      const updated = nodeMap.get(mergedNodes[i].id as number);
      if (updated && updated !== mergedNodes[i]) {
        mergedNodes[i] = updated;
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Dangling Assignment Reconciliation
  // 处理"悬空"派任务：当下属登录时，服务端尝试为 targetSkeletonNodeId 为 null
  // 的 pending assignment 匹配当前用户的骨架节点，匹配成功则写入 DB 并更新内存。
  // ──────────────────────────────────────────────────────────────────────
  {
    const danglingAsgs = assignments.filter(
      (a) =>
        a.assigneeId === userId &&
        a.targetSkeletonNodeId == null &&
        a.state === "pending" &&
        (a as any).timeBucketKind &&
        (a as any).timeBucketValue,
    );

    if (danglingAsgs.length > 0) {
      logger.info(
        { user: userId, method: "GET", path: "/api/workspace" },
        `发现 ${danglingAsgs.length} 条悬空 assignment，开始 reconciliation`,
      );

      // 当前用户的导图 ID 集合
      const myMindmapIds = new Set(
        mergedMindmaps.filter((m) => (m as any).ownerId === userId).map((m) => m.id as number),
      );

      for (const asg of danglingAsgs) {
        const bKind = (asg as any).timeBucketKind as string;
        const bVal = (asg as any).timeBucketValue as string;

        const skNode = mergedNodes.find(
          (n) =>
            myMindmapIds.has(n.mindmapId as number) &&
            (n as any).nodeType === "skeleton" &&
            (n as any).timeBucketKind === bKind &&
            (n as any).timeBucketValue === bVal &&
            !(n as any).isDeleted,
        );

        if (!skNode) {
          logger.info(
            { user: userId, method: "GET", path: "/api/workspace" },
            `悬空 assignment ${asg.id}：未找到 timeBucket=${bKind}:${bVal} 对应的骨架节点，跳过`,
          );
          continue;
        }

        const skMindmapId = skNode.mindmapId as number;
        await prisma.assignment.update({
          where: { id: asg.id as number },
          data: {
            targetMindmapId: skMindmapId,
            targetSkeletonNodeId: skNode.id as number,
          },
        });

        // 更新内存中的 assignment（就地修改，后续 serializeAssignment 会读取）
        (asg as any).targetMindmapId = skMindmapId;
        (asg as any).targetSkeletonNodeId = skNode.id;

        logger.info(
          { user: userId, method: "GET", path: "/api/workspace" },
          `悬空 assignment ${asg.id} reconciliation 完成：targetMindmap=${skMindmapId} targetSkeleton=${skNode.id}`,
        );
      }
    }
  }

  logger.info(
    { user: userId, method: "GET", path: "/api/workspace" },
    `reconciliation 完成，准备构建快照`,
  );

  const snapshot: WorkspaceSnapshot = {
    users: users.map(serializeUser),
    mindmaps: mergedMindmaps.map(serializeMindMap),
    nodes: mergedNodes.map(serializeNode),
    assignments: assignments.map(serializeAssignment),
    follows: follows.map(serializeFollowGrant),
    shares: shares.map(serializeNodeShare),
    logs: mergedLogs.map(serializeTaskLog),
    notifications: notifications.map(serializeNotification),
    relationships: mergedRelationships.map(serializeRelationship),
    calendarSyncs: calendarSyncs.map(serializeCalendarSync),
    mentions: mentions.map(serializeMention),
    workReports: workReports.map(serializeWorkReport),
  };

  return NextResponse.json(snapshot);
}

// ──────────────────────────────────────────────────────────────
// PUT /api/workspace
// ──────────────────────────────────────────────────────────────
async function putHandler(req: NextRequest): Promise<NextResponse> {
  const { userId } = await getAuth(req);
  const snap = (await req.json()) as WorkspaceSnapshot;

  // 临时 ID → 数据库数字 ID 的映射表（在事务外跨实体类型共用）
  const idMap = new Map<string, number>();

  // ── 3.1.3 前置：构建"空节点"集合（跳过这些节点及引用它们的实体）──
  const emptyNodeTempIds = new Set<string>(
    (snap.nodes ?? [])
      .filter((n) => isTempId(n.id) && !n.title?.trim())
      .map((n) => n.id),
  );

  logger.info(
    { user: userId, method: "PUT", path: "/api/workspace" },
    `保存快照：${snap.nodes?.length ?? 0} 节点（其中 ${emptyNodeTempIds.size} 个空节点将跳过）`,
  );

  // 收集事务中新建的通知，事务后用于钉钉 fire-and-forget 推送
  const pendingDingtalkNotifs: PendingDingtalkNotif[] = [];

  await prisma.$transaction(
    async (tx) => {
      // ──────────────────────────────────────────────────────
      // 1. MindMap
      // ──────────────────────────────────────────────────────
      const snapMindmapIds = new Set<number>();
      for (const mm of snap.mindmaps ?? []) {
        if (isTempId(mm.id)) {
          const created = await tx.mindMap.create({
            data: {
              ownerId: userId,
              year: mm.year ?? new Date().getFullYear(),
              title: mm.title ?? null,
              structure: mm.structure ?? null,
              theme: mm.theme ?? null,
              useAnnualTemplate: mm.useAnnualTemplate ?? false,
            },
          });
          idMap.set(mm.id, created.id);
          snapMindmapIds.add(created.id);
        } else {
          const dbId = parseDbId(mm.id);
          if (!dbId) continue;
          await tx.mindMap.updateMany({
            where: { id: dbId, ownerId: userId },
            data: {
              title: mm.title ?? null,
              structure: mm.structure ?? null,
              theme: mm.theme ?? null,
              useAnnualTemplate: mm.useAnnualTemplate ?? false,
              updatedAt: new Date(),
            },
          });
          snapMindmapIds.add(dbId);
        }
      }

      // ──────────────────────────────────────────────────────
      // 2. Node（按 parentId 拓扑排序，父节点先插入）
      // ──────────────────────────────────────────────────────
      const snapNodeIds = new Set<number>();
      const allNodes = snap.nodes ?? [];

      // 过滤空节点
      const validNodes = allNodes.filter(
        (n) => !(isTempId(n.id) && !n.title?.trim()),
      );

      // 拓扑排序（保证父节点先于子节点处理）
      const sortedNodes = topoSortNodes(validNodes);

      for (const node of sortedNodes) {
        const mindmapDbId = resolveId(node.mindmapId, idMap);
        if (!mindmapDbId) continue; // 找不到所属导图，跳过

        const parentDbId = node.parentId ? resolveId(node.parentId, idMap) : null;

        if (isTempId(node.id)) {
          const created = await tx.node.create({
            data: {
              mindmapId: mindmapDbId,
              parentId: parentDbId ?? null,
              sortOrder: node.sortOrder ?? 0,
              title: node.title ?? "",
              description: node.description ?? null,
              nodeType: node.nodeType ?? "normal",
              timeBucketKind: node.timeBucketKind ?? null,
              timeBucketValue: node.timeBucketValue ?? null,
              createdBy: userId,
              isDeleted: node.isDeleted ?? false,
              deletedAt: node.deletedAt ? new Date(node.deletedAt) : null,
              task: j(node.task),
               markers: j(node.markers),
               notes: node.notes ?? null,
               labels: j(node.labels),
               hyperlink: node.hyperlink ?? null,
               image: node.image ?? null,
               summaryRange: j(node.summaryRange),
               boundaryRange: j(node.boundaryRange),
               isFloating: node.isFloating ?? false,
               floatX: node.floatX ?? null,
               floatY: node.floatY ?? null,
               taskPeer: j(node.taskPeer),
               topicFormat: j(node.topicFormat),
             },
           });
           idMap.set(node.id, created.id);
          if (!created.isDeleted) snapNodeIds.add(created.id);
        } else {
          const dbId = parseDbId(node.id);
          if (!dbId) continue;
          await tx.node.updateMany({
            where: { id: dbId, mindmap: { ownerId: userId } },
            data: {
              parentId: parentDbId ?? null,
              sortOrder: node.sortOrder ?? 0,
              title: node.title ?? "",
              description: node.description ?? null,
              isDeleted: node.isDeleted ?? false,
              deletedAt: node.deletedAt ? new Date(node.deletedAt) : null,
              task: ju(node.task),
               markers: ju(node.markers),
               notes: node.notes ?? null,
               labels: ju(node.labels),
               hyperlink: node.hyperlink ?? null,
               image: node.image ?? null,
               summaryRange: ju(node.summaryRange),
               boundaryRange: ju(node.boundaryRange),
               isFloating: node.isFloating ?? false,
               floatX: node.floatX ?? null,
               floatY: node.floatY ?? null,
               taskPeer: ju(node.taskPeer),
               topicFormat: ju(node.topicFormat),
               updatedAt: new Date(),
            },
          });
          if (!node.isDeleted) snapNodeIds.add(dbId);
        }
      }

      // 软删除：DB 中属于该用户但快照中不含的节点
      // 规范 4-2：必须加 mindmap.ownerId 约束，防止上级的 snapMindmapIds 中包含
      // 下属导图 ID，误删下属的 task 节点（下属骨架节点会在 snapNodeIds 中，
      // 但下属的普通任务节点不在快照里，若无 ownerId 保护会被误标 isDeleted）
      if (snapMindmapIds.size > 0) {
        await tx.node.updateMany({
          where: {
            mindmap: { ownerId: userId },
            mindmapId: { in: [...snapMindmapIds] },
            id: { notIn: snapNodeIds.size > 0 ? [...snapNodeIds] : [-1] },
            isDeleted: false,
          },
          data: { isDeleted: true, deletedAt: new Date() },
        });
      }

      // ──────────────────────────────────────────────────────
      // 3. WorkReport
      // ──────────────────────────────────────────────────────
      const snapReportIds = new Set<number>();
      for (const report of snap.workReports ?? []) {
        if (isTempId(report.id)) {
          const created = await tx.workReport.create({
            data: {
              authorId: userId,
              kind: report.kind,
              periodLabel: report.periodLabel,
              periodStart: report.periodStart,
              periodEnd: report.periodEnd,
              contentMarkdown: report.contentMarkdown ?? "",
              summaryStats: j(report.summaryStats),
              status: report.status ?? "draft",
              submittedAt: report.submittedAt ? new Date(report.submittedAt) : null,
              submitToUserId: report.submitToUserId
                ? parseDbId(report.submitToUserId)
                : null,
              ccUserIds: report.ccUserIds ?? [],
            },
          });
          idMap.set(report.id, created.id);
          snapReportIds.add(created.id);
        } else {
          const dbId = parseDbId(report.id);
          if (!dbId) continue;
          await tx.workReport.updateMany({
            where: { id: dbId, authorId: userId },
            data: {
              contentMarkdown: report.contentMarkdown ?? "",
              status: report.status ?? "draft",
              submittedAt: report.submittedAt ? new Date(report.submittedAt) : null,
              submitToUserId: report.submitToUserId
                ? parseDbId(report.submitToUserId)
                : null,
              ccUserIds: report.ccUserIds ?? [],
              updatedAt: new Date(),
            },
          });
          snapReportIds.add(dbId);
        }
      }

      // ──────────────────────────────────────────────────────
      // 4. Assignment（派任务）
      // ──────────────────────────────────────────────────────
      for (const asg of snap.assignments ?? []) {
        if (isTempId(asg.id)) {
          const targetMindmapDbId = resolveId(asg.targetMindmapId, idMap);
          const targetSkeletonDbId = resolveId(asg.targetSkeletonNodeId, idMap);
          const created = await tx.assignment.create({
            data: {
              assignerId: resolveId(asg.assignerId, idMap) ?? userId,
              assigneeId: resolveId(asg.assigneeId, idMap) ?? userId,
              targetMindmapId: targetMindmapDbId ?? null,
              targetSkeletonNodeId: targetSkeletonDbId ?? null,
              timeBucketKind: asg.timeBucketKind ?? null,
              timeBucketValue: asg.timeBucketValue ?? null,
              proposedTitle: asg.proposedTitle,
              proposedDescription: asg.proposedDescription ?? null,
              proposedDeadline: asg.proposedDeadline ?? null,
              proposedPriority: asg.proposedPriority ?? "P2",
              state: asg.state ?? "pending",
              resultNodeId: asg.resultNodeId ? resolveId(asg.resultNodeId, idMap) : null,
              assignerMirrorNodeId: asg.assignerMirrorNodeId
                ? resolveId(asg.assignerMirrorNodeId, idMap)
                : null,
              assignerSourceNodeId: asg.assignerSourceNodeId
                ? resolveId(asg.assignerSourceNodeId, idMap)
                : null,
              adjustmentRequest: asg.adjustmentRequest ?? undefined,
              resolvedAt: asg.resolvedAt ? new Date(asg.resolvedAt) : null,
            },
          });
          idMap.set(asg.id, created.id);
        } else {
          const dbId = parseDbId(asg.id);
          if (!dbId) continue;
          await tx.assignment.updateMany({
            where: {
              id: dbId,
              OR: [{ assignerId: userId }, { assigneeId: userId }],
            },
            data: {
              state: asg.state ?? "pending",
              resultNodeId: asg.resultNodeId ? resolveId(asg.resultNodeId, idMap) : null,
              assignerMirrorNodeId: asg.assignerMirrorNodeId
                ? resolveId(asg.assignerMirrorNodeId, idMap)
                : null,
              adjustmentRequest: asg.adjustmentRequest ?? undefined,
              resolvedAt: asg.resolvedAt ? new Date(asg.resolvedAt) : null,
            },
          });
        }
      }

      // ──────────────────────────────────────────────────────
      // 5. FollowGrant（关注授权）
      // ──────────────────────────────────────────────────────
      for (const fg of snap.follows ?? []) {
        if (isTempId(fg.id)) {
          const targetNodeDbId = resolveId(fg.targetNodeId, idMap);
          if (!targetNodeDbId) continue;
          const created = await tx.followGrant.create({
            data: {
              requesterId: resolveId(fg.requesterId, idMap) ?? userId,
              granteeId: resolveId(fg.granteeId, idMap) ?? userId,
              targetNodeId: targetNodeDbId,
              scope: fg.scope,
              state: fg.state ?? "pending",
              expiresAt: fg.expiresAt ? new Date(fg.expiresAt) : new Date(Date.now() + 365 * 86400000),
              reason: fg.reason ?? null,
              decidedReason: fg.decidedReason ?? null,
              granteeMirrorNodeId: fg.granteeMirrorNodeId
                ? resolveId(fg.granteeMirrorNodeId, idMap)
                : null,
              decidedAt: fg.decidedAt ? new Date(fg.decidedAt) : null,
            },
          });
          idMap.set(fg.id, created.id);
        } else {
          const dbId = parseDbId(fg.id);
          if (!dbId) continue;
          await tx.followGrant.updateMany({
            where: {
              id: dbId,
              OR: [{ requesterId: userId }, { granteeId: userId }],
            },
            data: {
              state: fg.state ?? "pending",
              decidedReason: fg.decidedReason ?? null,
              granteeMirrorNodeId: fg.granteeMirrorNodeId
                ? resolveId(fg.granteeMirrorNodeId, idMap)
                : null,
              decidedAt: fg.decidedAt ? new Date(fg.decidedAt) : null,
            },
          });
        }
      }

      // ──────────────────────────────────────────────────────
      // 6. NodeShare
      // ──────────────────────────────────────────────────────
      for (const ns of snap.shares ?? []) {
        if (isTempId(ns.id)) {
          const nodeDbId = resolveId(ns.nodeId, idMap);
          if (!nodeDbId) continue;
          const created = await tx.nodeShare.create({
            data: {
              sharerId: resolveId(ns.sharerId, idMap) ?? userId,
              audienceId: resolveId(ns.audienceId, idMap) ?? userId,
              nodeId: nodeDbId,
              revokedAt: ns.revokedAt ? new Date(ns.revokedAt) : null,
            },
          });
          idMap.set(ns.id, created.id);
        } else {
          const dbId = parseDbId(ns.id);
          if (!dbId) continue;
          await tx.nodeShare.updateMany({
            where: { id: dbId, sharerId: userId },
            data: {
              revokedAt: ns.revokedAt ? new Date(ns.revokedAt) : null,
            },
          });
        }
      }

      // ──────────────────────────────────────────────────────
      // 7. TaskLog（仅追加新建的）
      // ──────────────────────────────────────────────────────
      for (const log of snap.logs ?? []) {
        if (!isTempId(log.id)) continue; // 已入库的日志不更新
        const nodeDbId = resolveId(log.nodeId, idMap);
        if (!nodeDbId) continue;
        const created = await tx.taskLog.create({
          data: {
            nodeId: nodeDbId,
            authorId: resolveId(log.authorId, idMap) ?? userId,
            logType: log.logType,
            contentText: log.contentText ?? "",
            contentMeta: j(log.contentMeta),
          },
        });
        idMap.set(log.id, created.id);
      }

      // ──────────────────────────────────────────────────────
      // 8. AppNotification（仅追加新建的；已有的仅更新 readAt）
      // ──────────────────────────────────────────────────────
      for (const notif of snap.notifications ?? []) {
        if (isTempId(notif.id)) {
          const created = await tx.appNotification.create({
            data: {
              recipientId: resolveId(notif.recipientId, idMap) ?? userId,
              actorId: notif.actorId ? resolveId(notif.actorId, idMap) : null,
              kind: notif.kind,
              title: notif.title,
              body: notif.body ?? null,
              refNodeId: notif.refNodeId ? resolveId(notif.refNodeId, idMap) : null,
              refAssignmentId: notif.refAssignmentId
                ? resolveId(notif.refAssignmentId, idMap)
                : null,
              refFollowGrantId: notif.refFollowGrantId
                ? resolveId(notif.refFollowGrantId, idMap)
                : null,
              refReportId: notif.refReportId
                ? resolveId(notif.refReportId, idMap)
                : null,
              readAt: notif.readAt ? new Date(notif.readAt) : null,
              calendarProvider: notif.calendarProvider ?? null,
            },
          });
          idMap.set(notif.id, created.id);
          // 收集新建通知，用于事务后钉钉推送
          pendingDingtalkNotifs.push({
            recipientId: created.recipientId,
            title: created.title,
            body: created.body,
          });
        } else {
          const dbId = parseDbId(notif.id);
          if (!dbId) continue;
          await tx.appNotification.updateMany({
            where: { id: dbId, recipientId: userId },
            data: { readAt: notif.readAt ? new Date(notif.readAt) : null },
          });
        }
      }

      // ──────────────────────────────────────────────────────
      // 9. Relationship（联系线）
      // ──────────────────────────────────────────────────────
      const snapRelIds = new Set<number>();
      for (const rel of snap.relationships ?? []) {
        if (isTempId(rel.id)) {
          const mindmapDbId = resolveId(rel.mindmapId, idMap);
          const fromDbId = resolveId(rel.fromId, idMap);
          const toDbId = resolveId(rel.toId, idMap);
          if (!mindmapDbId || !fromDbId || !toDbId) continue;
          const created = await tx.relationship.create({
            data: {
              mindmapId: mindmapDbId,
              fromId: fromDbId,
              toId: toDbId,
              label: rel.label ?? null,
              createdBy: userId,
            },
          });
          idMap.set(rel.id, created.id);
          snapRelIds.add(created.id);
        } else {
          const dbId = parseDbId(rel.id);
          if (!dbId) continue;
          snapRelIds.add(dbId);
        }
      }
      // 删除快照中不存在的联系线
      // 规范 4-2：Relationship 无 mindmap 关联模型，用 createdBy: userId 限定
      // 只删当前用户创建的联系线，防止误删下属导图的联系线（下属导图 ID 会
      // 出现在 snapMindmapIds 中，但其联系线的 createdBy 是下属 userId）
      if (snapMindmapIds.size > 0) {
        await tx.relationship.deleteMany({
          where: {
            createdBy: userId,
            mindmapId: { in: [...snapMindmapIds] },
            id: { notIn: snapRelIds.size > 0 ? [...snapRelIds] : [-1] },
          },
        });
      }

      // ──────────────────────────────────────────────────────
      // 10. MentionEvent（仅追加）
      // ──────────────────────────────────────────────────────
      for (const mention of snap.mentions ?? []) {
        if (!isTempId(mention.id)) continue;
        const nodeDbId = resolveId(mention.nodeId, idMap);
        if (!nodeDbId) continue;
        const created = await tx.mentionEvent.create({
          data: {
            nodeId: nodeDbId,
            byUserId: resolveId(mention.byUserId, idMap) ?? userId,
            mentionedUserId: resolveId(mention.mentionedUserId, idMap) ?? userId,
            kind: mention.kind,
            text: mention.text ?? "",
            dingtalkPushedAt: mention.dingtalkPushedAt
              ? new Date(mention.dingtalkPushedAt)
              : null,
          },
        });
        idMap.set(mention.id, created.id);
      }

      // ──────────────────────────────────────────────────────
      // 11. CalendarSync（upsert by nodeId+provider）
      // ──────────────────────────────────────────────────────
      for (const cs of snap.calendarSyncs ?? []) {
        const nodeDbId = resolveId(cs.nodeId, idMap);
        if (!nodeDbId) continue;
        if (isTempId(cs.id)) {
          const created = await tx.calendarSync.create({
            data: {
              nodeId: nodeDbId,
              userId,
              provider: cs.provider,
              externalEventId: cs.externalEventId,
              syncedTitle: cs.syncedTitle ?? "",
              syncedDeadline: cs.syncedDeadline ?? null,
              syncedStatus: cs.syncedStatus ?? null,
              externalCompleted: cs.externalCompleted ?? false,
              status: cs.status ?? "pending",
              syncedAt: new Date(),
              lastError: cs.lastError ?? null,
            },
          });
          idMap.set(cs.id, created.id);
        } else {
          const dbId = parseDbId(cs.id);
          if (!dbId) continue;
          await tx.calendarSync.updateMany({
            where: { id: dbId, userId },
            data: {
              syncedTitle: cs.syncedTitle ?? "",
              syncedDeadline: cs.syncedDeadline ?? null,
              syncedStatus: cs.syncedStatus ?? null,
              externalCompleted: cs.externalCompleted ?? false,
              status: cs.status ?? "pending",
              syncedAt: new Date(),
              lastError: cs.lastError ?? null,
            },
          });
        }
      }
    },
    { timeout: 30000 },
  );

  // 将 Map 转为普通对象，值转为字符串（与前端 string ID 对齐）
  const idMapObj: Record<string, string> = {};
  for (const [tempId, dbId] of idMap.entries()) {
    idMapObj[tempId] = String(dbId);
  }

  logger.info(
    { user: userId, method: "PUT", path: "/api/workspace" },
    `快照保存完成，idMap 条目数：${idMap.size}`,
  );

  // 钉钉工作通知推送（fire-and-forget，不阻塞响应）
  if (pendingDingtalkNotifs.length > 0) {
    void pushPendingDingtalkNotifs(pendingDingtalkNotifs);
  }

  return NextResponse.json({ ok: true, idMap: idMapObj });
}

export const GET = withApiLogger(getHandler);
export const PUT = withApiLogger(putHandler);

// ──────────────────────────────────────────────────────────────
// 节点拓扑排序（父节点先于子节点）
// ──────────────────────────────────────────────────────────────
function topoSortNodes<T extends { id: string; parentId?: string | null }>(
  nodes: T[],
): T[] {
  const result: T[] = [];
  const visited = new Set<string>();
  const map = new Map<string, T>(nodes.map((n) => [n.id, n]));

  function visit(node: T) {
    if (visited.has(node.id)) return;
    if (node.parentId && map.has(node.parentId)) {
      visit(map.get(node.parentId)!);
    }
    visited.add(node.id);
    result.push(node);
  }

  for (const node of nodes) visit(node);
  return result;
}

// ──────────────────────────────────────────────────────────────
// 序列化工具：Prisma 记录 → 前端类型（数值 ID → 字符串）
// ──────────────────────────────────────────────────────────────
function sid(n: number | null | undefined): string {
  return n == null ? "" : String(n);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeUser(u: any) {
  return {
    id: sid(u.id),
    employeeNo: u.employeeNo,
    name: u.name,
    email: u.email,
    avatar: u.avatar,
    departmentId: sid(u.departmentId),
    jobTitle: u.jobTitle,
    status: u.status,
    isAdmin: u.isAdmin ?? false,
    dingtalkBound: u.dingtalkBound,
    connectedCalendars: u.connectedCalendars ?? [],
    managerId: u.managerId ? sid(u.managerId) : undefined,
    mustResetPassword: u.mustResetPassword ?? false,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeMindMap(m: any) {
  return {
    id: sid(m.id),
    ownerId: sid(m.ownerId),
    year: m.year,
    title: m.title,
    structure: m.structure,
    theme: m.theme,
    useAnnualTemplate: m.useAnnualTemplate,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeNode(n: any) {
  return {
    id: sid(n.id),
    mindmapId: sid(n.mindmapId),
    parentId: n.parentId ? sid(n.parentId) : undefined,
    sortOrder: n.sortOrder,
    title: n.title,
    description: n.description,
    nodeType: n.nodeType,
    timeBucketKind: n.timeBucketKind,
    timeBucketValue: n.timeBucketValue,
    createdBy: sid(n.createdBy),
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
    isDeleted: n.isDeleted,
    deletedAt: n.deletedAt?.toISOString(),
    task: n.task,
    markers: n.markers,
    notes: n.notes,
    labels: n.labels,
    hyperlink: n.hyperlink,
    image: n.image,
    summaryRange: n.summaryRange,
    boundaryRange: n.boundaryRange,
    isFloating: n.isFloating,
    floatX: n.floatX,
    floatY: n.floatY,
    taskPeer: n.taskPeer,
    topicFormat: n.topicFormat,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeAssignment(a: any) {
  return {
    id: sid(a.id),
    assignerId: sid(a.assignerId),
    assigneeId: sid(a.assigneeId),
    targetMindmapId: a.targetMindmapId != null ? sid(a.targetMindmapId) : undefined,
    targetSkeletonNodeId: a.targetSkeletonNodeId != null ? sid(a.targetSkeletonNodeId) : undefined,
    timeBucketKind: a.timeBucketKind ?? undefined,
    timeBucketValue: a.timeBucketValue ?? undefined,
    proposedTitle: a.proposedTitle,
    proposedDescription: a.proposedDescription,
    proposedDeadline: a.proposedDeadline,
    proposedPriority: a.proposedPriority,
    state: a.state,
    resultNodeId: a.resultNodeId ? sid(a.resultNodeId) : undefined,
    assignerMirrorNodeId: a.assignerMirrorNodeId ? sid(a.assignerMirrorNodeId) : undefined,
    assignerSourceNodeId: a.assignerSourceNodeId ? sid(a.assignerSourceNodeId) : undefined,
    adjustmentRequest: a.adjustmentRequest,
    createdAt: a.createdAt.toISOString(),
    resolvedAt: a.resolvedAt?.toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeFollowGrant(f: any) {
  return {
    id: sid(f.id),
    requesterId: sid(f.requesterId),
    granteeId: sid(f.granteeId),
    targetNodeId: sid(f.targetNodeId),
    scope: f.scope,
    state: f.state,
    expiresAt: f.expiresAt.toISOString(),
    reason: f.reason,
    decidedReason: f.decidedReason,
    createdAt: f.createdAt.toISOString(),
    decidedAt: f.decidedAt?.toISOString(),
    granteeMirrorNodeId: f.granteeMirrorNodeId ? sid(f.granteeMirrorNodeId) : undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeNodeShare(s: any) {
  return {
    id: sid(s.id),
    sharerId: sid(s.sharerId),
    audienceId: sid(s.audienceId),
    nodeId: sid(s.nodeId),
    createdAt: s.createdAt.toISOString(),
    revokedAt: s.revokedAt?.toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeTaskLog(l: any) {
  return {
    id: sid(l.id),
    nodeId: sid(l.nodeId),
    authorId: sid(l.authorId),
    logType: l.logType,
    contentText: l.contentText,
    contentMeta: l.contentMeta,
    createdAt: l.createdAt.toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeNotification(n: any) {
  return {
    id: sid(n.id),
    recipientId: sid(n.recipientId),
    actorId: n.actorId ? sid(n.actorId) : undefined,
    kind: n.kind,
    title: n.title,
    body: n.body,
    refNodeId: n.refNodeId ? sid(n.refNodeId) : undefined,
    refAssignmentId: n.refAssignmentId ? sid(n.refAssignmentId) : undefined,
    refFollowGrantId: n.refFollowGrantId ? sid(n.refFollowGrantId) : undefined,
    refReportId: n.refReportId ? sid(n.refReportId) : undefined,
    createdAt: n.createdAt.toISOString(),
    readAt: n.readAt?.toISOString(),
    dingtalkPushedAt: n.dingtalkPushedAt?.toISOString(),
    calendarProvider: n.calendarProvider,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeRelationship(r: any) {
  return {
    id: sid(r.id),
    mindmapId: sid(r.mindmapId),
    fromId: sid(r.fromId),
    toId: sid(r.toId),
    label: r.label,
    createdBy: sid(r.createdBy),
    createdAt: r.createdAt.toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeCalendarSync(c: any) {
  return {
    id: sid(c.id),
    nodeId: sid(c.nodeId),
    userId: sid(c.userId),
    provider: c.provider,
    externalEventId: c.externalEventId,
    syncedTitle: c.syncedTitle,
    syncedDeadline: c.syncedDeadline,
    syncedStatus: c.syncedStatus,
    externalCompleted: c.externalCompleted,
    status: c.status,
    syncedAt: c.syncedAt.toISOString(),
    lastError: c.lastError,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeMention(m: any) {
  return {
    id: sid(m.id),
    nodeId: sid(m.nodeId),
    byUserId: sid(m.byUserId),
    mentionedUserId: sid(m.mentionedUserId),
    kind: m.kind,
    text: m.text,
    createdAt: m.createdAt.toISOString(),
    dingtalkPushedAt: m.dingtalkPushedAt?.toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeWorkReport(r: any) {
  return {
    id: sid(r.id),
    authorId: sid(r.authorId),
    kind: r.kind,
    periodLabel: r.periodLabel,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    contentMarkdown: r.contentMarkdown,
    summaryStats: r.summaryStats,
    status: r.status,
    submittedAt: r.submittedAt?.toISOString(),
    submitToUserId: r.submitToUserId ? sid(r.submitToUserId) : undefined,
    ccUserIds: r.ccUserIds ?? [],
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
