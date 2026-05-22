/**
 * 钉钉企业内部应用服务层
 *
 * 功能：
 *  1. access_token 获取与模块级缓存（过期前 5 分钟主动刷新）
 *  2. sendDingtalkRobotMessage — 通过机器人单聊向指定用户发送消息（新版 API）
 *  3. pushPendingDingtalkNotifs — 按数据库 recipientId 查 dingtalkUserId 后推送
 *  4. searchDingtalkUsers — 按姓名搜索钉钉用户（新版 API）
 *  5. getDingtalkUserDetail — 按 userid 查询用户详情（工号/邮箱/头像）
 *  6. fetchDingtalkDeptTree — BFS 拉取全量部门树（含 dept_id/name/parentId）
 *  7. fetchAllDingtalkUsers — 遍历所有部门分页拉取全量用户（按 userid 去重）
 *
 * 设计决策：
 *  - 推送失败只记录 logger.warn，不抛出异常（静默降级）
 *  - 环境变量缺失时直接跳过，不影响主业务
 *  - 使用机器人单聊 API（POST /v1.0/robot/oToMessages/batchSend）推送消息
 *    需配置 DINGTALK_ROBOT_CODE；token 通过 x-acs-dingtalk-access-token 请求头传入
 *  - 搜索使用新版 API（api.dingtalk.com），token 与推送相同
 *  - 部门同步根节点由 env DINGTALK_ROOT_DEPT_ID 指定（默认 1）
 */

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

// ──────────────────────────────────────────────────────────────
// access_token 缓存
// ──────────────────────────────────────────────────────────────

interface TokenCache {
  token: string;
  /** 过期时间戳（毫秒），到期前 5 分钟触发刷新 */
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

/**
 * 获取钉钉企业 access_token（含模块级缓存，过期前 5 分钟刷新）。
 * 环境变量 DINGTALK_APP_KEY / DINGTALK_APP_SECRET 缺失时返回 null。
 */
async function getDingtalkToken(): Promise<string | null> {
  const appKey = process.env.DINGTALK_APP_KEY;
  const appSecret = process.env.DINGTALK_APP_SECRET;

  if (!appKey || !appSecret) {
    return null;
  }

  const now = Date.now();
  // 提前 5 分钟（300_000 ms）刷新，避免临界过期
  if (tokenCache && tokenCache.expiresAt - 300_000 > now) {
    return tokenCache.token;
  }

  try {
    const url = `https://oapi.dingtalk.com/gettoken?appkey=${encodeURIComponent(appKey)}&appsecret=${encodeURIComponent(appSecret)}`;
    const res = await fetch(url, { method: "GET" });
    const data = (await res.json()) as {
      errcode: number;
      errmsg: string;
      access_token?: string;
      expires_in?: number;
    };

    if (data.errcode !== 0 || !data.access_token) {
      logger.warn(
        { service: "dingtalk" },
        `获取钉钉 access_token 失败：errcode=${data.errcode} errmsg=${data.errmsg}`,
      );
      return null;
    }

    // expires_in 单位为秒，默认 7200
    const expiresIn = (data.expires_in ?? 7200) * 1000;
    tokenCache = {
      token: data.access_token,
      expiresAt: now + expiresIn,
    };
    return tokenCache.token;
  } catch (err) {
    logger.warn({ service: "dingtalk", err }, "请求钉钉 access_token 异常");
    return null;
  }
}

// ──────────────────────────────────────────────────────────────
// 通过机器人单聊发送消息（新版 API）
// ──────────────────────────────────────────────────────────────

/**
 * 通过钉钉机器人单聊向指定用户发送文本消息。
 *
 * 接口：POST https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend
 * 鉴权：x-acs-dingtalk-access-token 请求头
 *
 * @param dingtalkUserId 目标用户的钉钉 userId
 * @param content        消息正文（纯文本）
 *
 * 失败时仅 logger.warn，不抛出异常。
 */
export async function sendDingtalkRobotMessage(
  dingtalkUserId: string,
  content: string,
): Promise<void> {
  const robotCode = process.env.DINGTALK_ROBOT_CODE;
  if (!robotCode) {
    logger.warn({ service: "dingtalk" }, "DINGTALK_ROBOT_CODE 未配置，跳过推送");
    return;
  }

  const token = await getDingtalkToken();
  if (!token) {
    return;
  }

  try {
    const res = await fetch(
      "https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-acs-dingtalk-access-token": token,
        },
        body: JSON.stringify({
          robotCode,
          userIds: [dingtalkUserId],
          msgKey: "sampleText",
          msgParam: JSON.stringify({ content }),
        }),
      },
    );

    const data = (await res.json()) as {
      processQueryKey?: string;
      // 新版 API 失败时返回 code + message
      code?: string;
      message?: string;
    };

    if (!res.ok || data.code) {
      logger.warn(
        { service: "dingtalk", dingtalkUserId },
        `钉钉机器人消息发送失败：status=${res.status} code=${data.code ?? "-"} message=${data.message ?? "-"}`,
      );
    }
  } catch (err) {
    logger.warn(
      { service: "dingtalk", dingtalkUserId, err },
      "发送钉钉机器人消息异常",
    );
  }
}

// ──────────────────────────────────────────────────────────────
// 按 recipientId 推送通知（供 workspace route 调用）
// ──────────────────────────────────────────────────────────────

export interface PendingDingtalkNotif {
  recipientId: number;
  title: string;
  body?: string | null;
}

/**
 * 批量推送待发钉钉通知（fire-and-forget 场景）。
 *
 * 对每条通知：
 *  1. 查询接收者的 dingtalkUserId
 *  2. 若非空，调用 sendDingtalkRobotMessage 通过机器人单聊发送
 *
 * 整个函数不抛出异常，失败均 logger.warn 静默处理。
 */
export async function pushPendingDingtalkNotifs(
  notifs: PendingDingtalkNotif[],
): Promise<void> {
  if (notifs.length === 0) return;

  // 去重 recipientId，批量查询
  const recipientIds = [...new Set(notifs.map((n) => n.recipientId))];

  let userMap: Map<number, string>;
  try {
    const users = await prisma.user.findMany({
      where: {
        id: { in: recipientIds },
        dingtalkUserId: { not: null },
      },
      select: { id: true, dingtalkUserId: true },
    });
    userMap = new Map(
      users
        .filter((u) => u.dingtalkUserId)
        .map((u) => [u.id, u.dingtalkUserId!]),
    );
  } catch (err) {
    logger.warn({ service: "dingtalk", err }, "查询用户 dingtalkUserId 异常，跳过推送");
    return;
  }

  // 逐条推送（不并发，避免触发钉钉限流）
  for (const notif of notifs) {
    const dingtalkUserId = userMap.get(notif.recipientId);
    if (!dingtalkUserId) continue;

    const content = notif.body
      ? `【工作平台】${notif.title}\n${notif.body}`
      : `【工作平台】${notif.title}`;

    // fire-and-forget：不 await，不阻塞调用方
    void sendDingtalkRobotMessage(dingtalkUserId, content);
  }
}

// ──────────────────────────────────────────────────────────────
// 钉钉用户搜索（新版 API：api.dingtalk.com）
// ──────────────────────────────────────────────────────────────

/**
 * 钉钉用户候选人信息（搜索+详情合并结果）
 */
export interface DingtalkUserCandidate {
  /** 钉钉 userId */
  userid: string;
  /** 姓名 */
  name: string;
  /** 工号 */
  jobNumber: string;
  /** 邮箱 */
  email: string;
  /** 头像图片 URL */
  avatar: string;
  /** 直属上级的钉钉 userId（无上级时为 undefined） */
  managerUserId?: string;
}

/**
 * 按姓名搜索钉钉用户，返回 userid 列表。
 *
 * 使用新版 API：POST https://api.dingtalk.com/v1.0/contact/users/search
 * token 与旧版相同，通过 x-acs-dingtalk-access-token 请求头传入。
 *
 * 失败时返回空数组，不抛出异常。
 */
export async function searchDingtalkUsers(name: string): Promise<string[]> {
  const token = await getDingtalkToken();
  if (!token) return [];

  try {
    const res = await fetch("https://api.dingtalk.com/v1.0/contact/users/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-acs-dingtalk-access-token": token,
      },
      body: JSON.stringify({ queryWord: name, offset: 0, size: 20 }),
    });

    const data = (await res.json()) as {
      list?: string[];
      totalCount?: number;
      code?: string;
      message?: string;
    };

    if (data.code) {
      logger.warn(
        { service: "dingtalk" },
        `钉钉用户搜索失败：code=${data.code} message=${data.message}`,
      );
      return [];
    }

    return data.list ?? [];
  } catch (err) {
    logger.warn({ service: "dingtalk", err }, "钉钉用户搜索异常");
    return [];
  }
}

/**
 * 钉钉 QPS 限流错误（errcode=88，subcode=90018）。
 * 由 getDingtalkUserDetail 抛出，供 batchFetchManagerUserids 捕获并退避重试。
 */
export class DingtalkQpsError extends Error {
  constructor(public readonly userid: string) {
    super(`钉钉 QPS 限流：userid=${userid}`);
    this.name = "DingtalkQpsError";
  }
}

/**
 * 按 userid 查询钉钉用户详情（工号、姓名、邮箱、头像）。
 *
 * 使用旧版 API：POST https://oapi.dingtalk.com/topapi/v2/user/get
 *
 * - errcode=88（QPS 限流）时抛出 DingtalkQpsError，供调用方退避重试
 * - 其他错误返回 null，不抛出异常
 */
export async function getDingtalkUserDetail(
  userid: string,
): Promise<DingtalkUserCandidate | null> {
  const token = await getDingtalkToken();
  if (!token) return null;

  try {
    const res = await fetch(
      `https://oapi.dingtalk.com/topapi/v2/user/get?access_token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userid, language: "zh_CN" }),
      },
    );

    const data = (await res.json()) as {
      errcode: number;
      errmsg: string;
      result?: {
        userid: string;
        name: string;
        job_number?: string;
        email?: string;
        org_email?: string;
        avatar?: string;
        manager_userid?: string;
      };
    };

    if (data.errcode === 88) {
      // QPS 限流：抛出专用错误，由 batchFetchManagerUserids 退避重试
      throw new DingtalkQpsError(userid);
    }

    if (data.errcode !== 0 || !data.result) {
      logger.warn(
        { service: "dingtalk", userid },
        `查询钉钉用户详情失败：errcode=${data.errcode} errmsg=${data.errmsg}`,
      );
      return null;
    }

    const r = data.result;
    return {
      userid: r.userid,
      name: r.name,
      jobNumber: r.job_number ?? "",
      email: r.email ?? r.org_email ?? "",
      avatar: r.avatar ?? "",
      managerUserId: r.manager_userid ?? undefined,
    };
  } catch (err) {
    logger.warn({ service: "dingtalk", userid, err }, "查询钉钉用户详情异常");
    return null;
  }
}

// ──────────────────────────────────────────────────────────────
// 组织架构同步：部门树 & 全量用户
// ──────────────────────────────────────────────────────────────

/** 钉钉部门节点（BFS 结果） */
export interface DingtalkDept {
  /** 钉钉部门 ID */
  deptId: number;
  /** 部门名称 */
  name: string;
  /** 父部门钉钉 ID（根节点为 rootDeptId，此时 parentDeptId 为 null） */
  parentDeptId: number | null;
}

/**
 * BFS 拉取钉钉全量部门树（不含根节点本身）。
 *
 * 接口：POST https://oapi.dingtalk.com/topapi/v2/department/listsubid
 * 返回顺序：BFS（父必先于子），供同步时构建 dingDeptId→dbId 映射表。
 *
 * 根节点由 env DINGTALK_ROOT_DEPT_ID 指定（默认 1）。
 * 失败时抛出异常，由调用方统一处理。
 */
export async function fetchDingtalkDeptTree(): Promise<DingtalkDept[]> {
  const token = await getDingtalkToken();
  if (!token) {
    throw new Error("无法获取钉钉 access_token，请检查 DINGTALK_APP_KEY / DINGTALK_APP_SECRET");
  }

  const rootDeptId = parseInt(process.env.DINGTALK_ROOT_DEPT_ID ?? "1", 10);
  const result: DingtalkDept[] = [];
  // BFS 队列：[deptId, parentDeptId]
  const queue: Array<[number, number | null]> = [[rootDeptId, null]];

  while (queue.length > 0) {
    const [currentId, parentId] = queue.shift()!;

    // 所有部门（含根节点）都查详情并加入结果
    const detailRes = await fetch(
      `https://oapi.dingtalk.com/topapi/v2/department/get?access_token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dept_id: currentId, language: "zh_CN" }),
      },
    );
    const detailData = (await detailRes.json()) as {
      errcode: number;
      errmsg: string;
      result?: { dept_id: number; name: string; parent_id?: number };
    };
    if (detailData.errcode !== 0 || !detailData.result) {
      logger.warn(
        { service: "dingtalk", dept_id: currentId },
        `查询部门详情失败：errcode=${detailData.errcode} errmsg=${detailData.errmsg}`,
      );
      continue;
    }
    result.push({
      deptId: currentId,
      name: detailData.result.name,
      parentDeptId: parentId,
    });

    // 拉取直接子部门 ID 列表
    const subRes = await fetch(
      `https://oapi.dingtalk.com/topapi/v2/department/listsubid?access_token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dept_id: currentId }),
      },
    );
    const subData = (await subRes.json()) as {
      errcode: number;
      errmsg: string;
      result?: { dept_id_list?: number[] };
    };
    if (subData.errcode !== 0) {
      logger.warn(
        { service: "dingtalk", dept_id: currentId },
        `拉取子部门列表失败：errcode=${subData.errcode} errmsg=${subData.errmsg}`,
      );
      continue;
    }
    for (const childId of subData.result?.dept_id_list ?? []) {
      queue.push([childId, currentId]);
    }
  }

  return result;
}

/** 钉钉用户信息（同步用） */
export interface DingtalkSyncUser {
  /** 钉钉 userId */
  userid: string;
  /** 姓名 */
  name: string;
  /** 工号（job_number） */
  jobNumber: string;
  /** 企业邮箱（优先 org_email，其次 email） */
  email: string;
  /** 头像 URL */
  avatar: string;
  /** 主部门钉钉 ID（dept_id_list[0]） */
  mainDeptId: number;
  /** 所属全部部门钉钉 ID 列表 */
  deptIdList: number[];
}

/** 拉取单个部门的全部用户（分页直到 has_more=false） */
async function fetchUsersForOneDept(
  token: string,
  deptId: number,
): Promise<
  Array<{
    userid: string;
    name: string;
    job_number?: string;
    email?: string;
    org_email?: string;
    avatar?: string;
    dept_id_list?: number[];
  }>
> {
  const users: Array<{
    userid: string;
    name: string;
    job_number?: string;
    email?: string;
    org_email?: string;
    avatar?: string;
    dept_id_list?: number[];
  }> = [];
  let cursor = 0;
  let hasMore = true;

  while (hasMore) {
    const res = await fetch(
      `https://oapi.dingtalk.com/topapi/v2/user/list?access_token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dept_id: deptId, cursor, size: 50, language: "zh_CN" }),
      },
    );
    const data = (await res.json()) as {
      errcode: number;
      errmsg: string;
      result?: {
        has_more: boolean;
        next_cursor?: number;
        list?: typeof users;
      };
    };

    if (data.errcode !== 0) {
      logger.warn(
        { service: "dingtalk", dept_id: deptId },
        `拉取部门用户列表失败：errcode=${data.errcode} errmsg=${data.errmsg}`,
      );
      break;
    }

    users.push(...(data.result?.list ?? []));
    hasMore = data.result?.has_more ?? false;
    cursor = data.result?.next_cursor ?? cursor + 50;
  }

  return users;
}

/**
 * 遍历全部部门，并行拉取所有钉钉用户（按 userid 去重）。
 *
 * @param knownDeptIds 已知的钉钉部门 ID 列表（部门同步完成后从 DB 读取，可跳过树请求）。
 *   不传时回退到 fetchDingtalkDeptTree 自动获取。
 *
 * 优化：
 *  - 当 knownDeptIds 已知时，跳过 fetchDingtalkDeptTree（省去 N×2 次串行 HTTP）
 *  - 各部门用户列表并行拉取，并发数 = DEPT_CONCURRENCY（默认 5）
 */
export async function fetchAllDingtalkUsers(knownDeptIds?: number[]): Promise<DingtalkSyncUser[]> {
  const token = await getDingtalkToken();
  if (!token) {
    throw new Error("无法获取钉钉 access_token，请检查 DINGTALK_APP_KEY / DINGTALK_APP_SECRET");
  }

  // 确定要遍历的部门 ID 列表
  let allDeptIds: number[];
  if (knownDeptIds && knownDeptIds.length > 0) {
    allDeptIds = knownDeptIds;
    logger.info({ service: "dingtalk" }, `使用已知部门列表（${allDeptIds.length} 个），跳过树请求`);
  } else {
    const rootDeptId = parseInt(process.env.DINGTALK_ROOT_DEPT_ID ?? "1", 10);
    const deptTree = await fetchDingtalkDeptTree();
    allDeptIds = [rootDeptId, ...deptTree.map((d) => d.deptId)];
    logger.info({ service: "dingtalk" }, `通过树请求获取部门列表（${allDeptIds.length} 个）`);
  }

  const userMap = new Map<string, DingtalkSyncUser>();

  // 并行拉取，每批最多 DEPT_CONCURRENCY 个部门同时请求
  const DEPT_CONCURRENCY = 5;
  for (let i = 0; i < allDeptIds.length; i += DEPT_CONCURRENCY) {
    const chunk = allDeptIds.slice(i, i + DEPT_CONCURRENCY);
    const results = await Promise.all(chunk.map((id) => fetchUsersForOneDept(token, id)));

    for (let j = 0; j < chunk.length; j++) {
      const deptId = chunk[j];
      for (const u of results[j]) {
        if (!userMap.has(u.userid)) {
          userMap.set(u.userid, {
            userid: u.userid,
            name: u.name,
            jobNumber: u.job_number ?? "",
            email: u.org_email ?? u.email ?? "",
            avatar: u.avatar ?? "",
            mainDeptId: u.dept_id_list?.[0] ?? deptId,
            deptIdList: u.dept_id_list ?? [deptId],
          });
        }
      }
    }
  }

  return [...userMap.values()];
}

// ──────────────────────────────────────────────────────────────
// 批量获取用户的直属上级钉钉 userId
// ──────────────────────────────────────────────────────────────

/** 批次间固定延迟（ms），5 并发 × 250ms = 最高 20 req/s，远低于钉钉 60 req/s 限制 */
const BATCH_DELAY_MS = 250;
/** QPS 限流后初始退避时间（ms） */
const QPS_BACKOFF_BASE_MS = 1500;
/** QPS 限流最大重试次数 */
const QPS_MAX_RETRIES = 3;

/**
 * 批量获取一组钉钉用户的 manager_userid（通过并发调用 user/get 详情接口）。
 *
 * @param userids     钉钉 userid 列表
 * @param concurrency 每批并发数（默认 5，约 20 req/s，远低于钉钉 60 req/s 限制）
 * @returns Map<userid, managerUserId>（无上级或请求失败的用户不在 Map 中）
 *
 * - 批次间固定等待 250ms，防止瞬时超限
 * - 遇到 QPS 限流（DingtalkQpsError）时，对整批暂停 1.5s 后重试，最多 3 次
 * - 单条非限流失败时静默跳过，不影响整体批量处理
 */
export async function batchFetchManagerUserids(
  userids: string[],
  concurrency = 5,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (userids.length === 0) return result;

  /** 单次请求，捕获非 QPS 错误并返回 null */
  async function fetchOne(id: string): Promise<DingtalkUserCandidate | null> {
    try {
      return await getDingtalkUserDetail(id);
    } catch (err) {
      if (err instanceof DingtalkQpsError) throw err; // 向上传播，由批次层重试
      logger.warn({ service: "dingtalk", userid: id, err }, "batchFetch 单条异常，跳过");
      return null;
    }
  }

  for (let i = 0; i < userids.length; i += concurrency) {
    const chunk = userids.slice(i, i + concurrency);

    let retries = 0;
    let pendingChunk = chunk;

    while (pendingChunk.length > 0) {
      const qpsFailedIds: string[] = [];
      const settled = await Promise.allSettled(pendingChunk.map((id) => fetchOne(id)));

      for (let j = 0; j < settled.length; j++) {
        const item = settled[j];
        if (item.status === "fulfilled") {
          const d = item.value;
          if (d?.managerUserId) result.set(d.userid, d.managerUserId);
        } else {
          // rejected 只可能是 DingtalkQpsError（其余已在 fetchOne 内消化）
          qpsFailedIds.push(pendingChunk[j]);
        }
      }

      if (qpsFailedIds.length === 0) break; // 本批全部成功

      retries++;
      if (retries > QPS_MAX_RETRIES) {
        logger.warn(
          { service: "dingtalk", failedIds: qpsFailedIds },
          `批量获取上级：QPS 重试已达上限（${QPS_MAX_RETRIES} 次），跳过这些用户`,
        );
        break;
      }

      const backoff = QPS_BACKOFF_BASE_MS * retries;
      logger.info(
        { service: "dingtalk", retry: retries, backoffMs: backoff, count: qpsFailedIds.length },
        `批量获取上级：遭遇 QPS 限流，${backoff}ms 后重试（第 ${retries}/${QPS_MAX_RETRIES} 次）`,
      );
      await new Promise((r) => setTimeout(r, backoff));
      pendingChunk = qpsFailedIds;
    }

    // 批次间固定冷却，避免连续批次触发限流
    if (i + concurrency < userids.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  return result;
}
