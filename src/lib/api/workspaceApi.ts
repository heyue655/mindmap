import type { Department, OrgRelation } from "@/types";
import type { WorkspaceSnapshot } from "@/types/workspaceSnapshot";

export interface OrgPayload {
  departments: Department[];
  relations: OrgRelation[];
}

export const LS_API_TOKEN = "mindmap-prototype-v6:apiToken";

export function getApiToken(): string | null {
  try {
    return localStorage.getItem(LS_API_TOKEN);
  } catch {
    return null;
  }
}

export function setApiToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(LS_API_TOKEN, token);
    else localStorage.removeItem(LS_API_TOKEN);
  } catch {
    /* ignore */
  }
}

export async function apiLogin(
  employeeNo: string,
  password: string,
): Promise<{ token: string; user: { id: number; name: string; employeeNo: string } }> {
  const r = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeNo, password }),
  });
  const data = (await r.json()) as {
    error?: string;
    token?: string;
    user?: { id: number; name: string; employeeNo: string };
  };
  if (!r.ok) {
    throw new Error(data.error || "登录失败");
  }
  if (!data.token || !data.user) throw new Error("登录失败");
  return { token: data.token, user: data.user };
}

/** 钉钉内免登：corpId + requestAuthCode 换应用 JWT（服务端需配置 DINGTALK_APP_*） */
export async function dingTalkExchangeApi(payload: {
  corpId: string;
  authCode: string;
}): Promise<{ token: string; userId: string; tenantId: string }> {
  const r = await fetch("/api/auth/dingtalk/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      corpId: payload.corpId,
      authCode: payload.authCode,
    }),
  });
  const data = (await r.json()) as {
    error?: string;
    detail?: string;
    token?: string;
    userId?: string;
    tenantId?: string;
  };
  if (!r.ok) {
    throw new Error(
      data.detail ? `${data.error || "换票失败"}: ${data.detail}` : data.error || "换票失败",
    );
  }
  if (!data.token || !data.userId || !data.tenantId) {
    throw new Error("换票失败");
  }
  return { token: data.token, userId: data.userId, tenantId: data.tenantId };
}

export async function fetchOrg(token: string): Promise<OrgPayload> {
  const r = await fetch("/api/org", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (r.status === 401) throw new Error("401");
  if (!r.ok) throw new Error("加载组织失败");
  return r.json() as Promise<OrgPayload>;
}

export async function fetchWorkspace(
  token: string,
): Promise<WorkspaceSnapshot> {
  const r = await fetch("/api/workspace", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (r.status === 401) {
    throw new Error("401");
  }
  if (!r.ok) {
    throw new Error("加载工作区失败");
  }
  return r.json() as Promise<WorkspaceSnapshot>;
}

export async function putWorkspace(
  token: string,
  snap: Pick<
    WorkspaceSnapshot,
    | "mindmaps"
    | "nodes"
    | "relationships"
    | "assignments"
    | "notifications"
    | "follows"
    | "shares"
    | "logs"
  >,
): Promise<{ idMap: Record<string, string> }> {
  const r = await fetch("/api/workspace", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(snap),
  });
  if (!r.ok) {
    throw new Error("保存失败");
  }
  const data = (await r.json()) as { ok: boolean; idMap?: Record<string, string> };
  return { idMap: data.idMap ?? {} };
}

export async function resetWorkspaceRemote(token: string): Promise<void> {
  const r = await fetch("/api/workspace/reset", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    throw new Error("重置失败");
  }
}

export function useRemoteWorkspaceApi(): boolean {
  return process.env.NEXT_PUBLIC_USE_API === "true";
}

/**
 * 即时标记通知为已读（不依赖 PUT /api/workspace 的防抖）
 * 对应 POST /api/notifications/read
 */
export async function markNotificationsReadApi(
  token: string,
  ids: string[],
): Promise<{ updated: number }> {
  if (ids.length === 0) return { updated: 0 };
  const r = await fetch("/api/notifications/read", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids }),
  });
  const data = (await r.json()) as { error?: string; updated?: number };
  if (!r.ok) throw new Error(data.error || "标记已读失败");
  return { updated: data.updated ?? 0 };
}

/** M3：手动入队一条钉钉工作通知（PG） */
export async function enqueueDingTalkNoticeApi(
  token: string,
  payload: { recipientUserId: string; title: string; body?: string },
): Promise<{ id: string; flushed: number }> {
  const r = await fetch("/api/integrations/dingtalk/enqueue", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = (await r.json()) as { error?: string; id?: string; flushed?: number };
  if (!r.ok) throw new Error(data.error || "入队失败");
  return { id: data.id!, flushed: data.flushed ?? 0 };
}

/** 钉钉：创建/更新负责人「我的日程」中的日程（需服务端配置 DINGTALK_APP_*） */
export async function pushDingTalkCalendarApi(
  token: string,
  payload: {
    nodeId: string;
    summary: string;
    description?: string;
    deadline?: string | null;
    ownerAppUserId: string;
  },
): Promise<{ externalEventId: string; operation: "created" | "updated" }> {
  const r = await fetch("/api/integrations/dingtalk/calendar/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = (await r.json()) as {
    error?: string;
    detail?: string;
    externalEventId?: string;
    operation?: string;
  };
  if (!r.ok) {
    throw new Error(
      data.detail
        ? `${data.error || "推送失败"}: ${data.detail}`
        : data.error || "推送失败",
    );
  }
  if (!data.externalEventId) throw new Error("推送失败");
  return {
    externalEventId: data.externalEventId,
    operation: data.operation === "updated" ? "updated" : "created",
  };
}

/** M4：登记节点与外部日历事件（PG） */
export async function upsertCalendarLinkApi(
  token: string,
  payload: {
    nodeId: string;
    provider?: string;
    externalEventId?: string;
    userId?: string;
  },
): Promise<{ id: string; externalEventId: string; provider: string }> {
  const r = await fetch("/api/calendar/links", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = (await r.json()) as {
    error?: string;
    id?: string;
    externalEventId?: string;
    provider?: string;
  };
  if (!r.ok) throw new Error(data.error || "登记失败");
  return {
    id: data.id!,
    externalEventId: data.externalEventId!,
    provider: data.provider!,
  };
}
