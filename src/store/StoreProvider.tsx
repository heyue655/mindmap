"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AppNotification,
  Assignment,
  CalendarSync,
  Department,
  FollowGrant,
  MentionEvent,
  MindMap,
  Node,
  NodeShare,
  OrgRelation,
  Relationship,
  TaskLog,
  User,
  UserId,
  WorkReport,
} from "@/types";
import {
  departments as seedDepartments,
  orgRelations as seedOrgRelations,
  users as seedUsers,
} from "@/mock/org";
import {
  initialAssignments,
  initialCalendarSyncs,
  initialFollows,
  initialLogs,
  initialMentions,
  initialNodes,
  initialNotifications,
  initialRelationships,
  initialShares,
  initialWorkReports,
  mindmaps as seedMindmaps,
} from "@/mock/initialData";
import { getDefaultWorkspaceSnapshot } from "@/mock/workspaceSeed";
import {
  fetchOrg,
  fetchWorkspace,
  getApiToken,
  putWorkspace,
  resetWorkspaceRemote,
  setApiToken,
  useRemoteWorkspaceApi,
} from "@/lib/api/workspaceApi";
import type { WorkspaceSnapshot } from "@/types/workspaceSnapshot";

// localStorage key（v6 起：日历同步 + @ 提及，强制重置）
const LS_PREFIX = "mindmap-prototype-v6:";
const LS_CURRENT_USER = `${LS_PREFIX}currentUserId`;
const LS_NODES = `${LS_PREFIX}nodes`;
const LS_MINDMAPS = `${LS_PREFIX}mindmaps`;
const LS_USERS = `${LS_PREFIX}users`;
const LS_ASSIGNMENTS = `${LS_PREFIX}assignments`;
const LS_FOLLOWS = `${LS_PREFIX}follows`;
const LS_SHARES = `${LS_PREFIX}shares`;
const LS_LOGS = `${LS_PREFIX}logs`;
const LS_NOTIFICATIONS = `${LS_PREFIX}notifications`;
const LS_RELATIONSHIPS = `${LS_PREFIX}relationships`;
const LS_CALENDAR_SYNCS = `${LS_PREFIX}calendarSyncs`;
const LS_MENTIONS = `${LS_PREFIX}mentions`;
const LS_WORK_REPORTS = `${LS_PREFIX}workReports`;

const defaultWorkspace = getDefaultWorkspaceSnapshot();

function loadFromLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveToLS<T>(key: string, val: T) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* ignore */
  }
}

function applySnapshot(
  snap: WorkspaceSnapshot,
  setters: {
    setUsers: React.Dispatch<React.SetStateAction<User[]>>;
    setMindmaps: React.Dispatch<React.SetStateAction<MindMap[]>>;
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    setAssignments: React.Dispatch<React.SetStateAction<Assignment[]>>;
    setFollows: React.Dispatch<React.SetStateAction<FollowGrant[]>>;
    setShares: React.Dispatch<React.SetStateAction<NodeShare[]>>;
    setLogs: React.Dispatch<React.SetStateAction<TaskLog[]>>;
    setNotifications: React.Dispatch<React.SetStateAction<AppNotification[]>>;
    setRelationships: React.Dispatch<React.SetStateAction<Relationship[]>>;
    setCalendarSyncs: React.Dispatch<React.SetStateAction<CalendarSync[]>>;
    setMentions: React.Dispatch<React.SetStateAction<MentionEvent[]>>;
    setWorkReports: React.Dispatch<React.SetStateAction<WorkReport[]>>;
  },
) {
  setters.setUsers(snap.users);
  setters.setMindmaps(snap.mindmaps);
  setters.setNodes(snap.nodes);
  setters.setAssignments(snap.assignments);
  setters.setFollows(snap.follows);
  setters.setShares(snap.shares);
  setters.setLogs(snap.logs);
  setters.setNotifications(snap.notifications);
  setters.setRelationships(snap.relationships);
  setters.setCalendarSyncs(snap.calendarSyncs);
  setters.setMentions(snap.mentions);
  setters.setWorkReports(
    Array.isArray(snap.workReports) ? snap.workReports : [],
  );
}

interface Store {
  departments: Department[];
  relations: OrgRelation[];

  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;

  mindmaps: MindMap[];
  setMindmaps: React.Dispatch<React.SetStateAction<MindMap[]>>;

  currentUserId: UserId | null;
  currentUser: User | null;
  setCurrentUserId: (id: UserId | null) => void;

  nodes: Node[];
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;

  assignments: Assignment[];
  setAssignments: React.Dispatch<React.SetStateAction<Assignment[]>>;

  follows: FollowGrant[];
  setFollows: React.Dispatch<React.SetStateAction<FollowGrant[]>>;

  shares: NodeShare[];
  setShares: React.Dispatch<React.SetStateAction<NodeShare[]>>;

  logs: TaskLog[];
  setLogs: React.Dispatch<React.SetStateAction<TaskLog[]>>;

  notifications: AppNotification[];
  setNotifications: React.Dispatch<React.SetStateAction<AppNotification[]>>;

  relationships: Relationship[];
  setRelationships: React.Dispatch<React.SetStateAction<Relationship[]>>;

  calendarSyncs: CalendarSync[];
  setCalendarSyncs: React.Dispatch<React.SetStateAction<CalendarSync[]>>;

  mentions: MentionEvent[];
  setMentions: React.Dispatch<React.SetStateAction<MentionEvent[]>>;

  workReports: WorkReport[];
  setWorkReports: React.Dispatch<React.SetStateAction<WorkReport[]>>;

  resetAll: () => void;

  /** 使用后端 API 时：首屏拉取完成后为 true */
  workspaceHydrated: boolean;
  /** 登录成功后或需强制与服务端对齐时调用 */
  refreshWorkspace: () => Promise<void>;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const useApi = useRemoteWorkspaceApi();

  const [currentUserId, _setCurrentUserId] = useState<UserId | null>(() =>
    loadFromLS<UserId | null>(LS_CURRENT_USER, null),
  );

  const [users, setUsers] = useState<User[]>(() =>
    useApi ? defaultWorkspace.users : loadFromLS<User[]>(LS_USERS, seedUsers),
  );
  const [nodes, setNodes] = useState<Node[]>(() =>
    useApi ? defaultWorkspace.nodes : loadFromLS<Node[]>(LS_NODES, initialNodes),
  );
  const [mindmaps, setMindmaps] = useState<MindMap[]>(() =>
    useApi
      ? defaultWorkspace.mindmaps
      : loadFromLS<MindMap[]>(LS_MINDMAPS, seedMindmaps),
  );
  const [assignments, setAssignments] = useState<Assignment[]>(() =>
    useApi
      ? defaultWorkspace.assignments
      : loadFromLS<Assignment[]>(LS_ASSIGNMENTS, initialAssignments),
  );
  const [follows, setFollows] = useState<FollowGrant[]>(() =>
    useApi
      ? defaultWorkspace.follows
      : loadFromLS<FollowGrant[]>(LS_FOLLOWS, initialFollows),
  );
  const [shares, setShares] = useState<NodeShare[]>(() =>
    useApi
      ? defaultWorkspace.shares
      : loadFromLS<NodeShare[]>(LS_SHARES, initialShares),
  );
  const [logs, setLogs] = useState<TaskLog[]>(() =>
    useApi ? defaultWorkspace.logs : loadFromLS<TaskLog[]>(LS_LOGS, initialLogs),
  );
  const [notifications, setNotifications] = useState<AppNotification[]>(() =>
    useApi
      ? defaultWorkspace.notifications
      : loadFromLS<AppNotification[]>(
          LS_NOTIFICATIONS,
          initialNotifications,
        ),
  );
  const [relationships, setRelationships] = useState<Relationship[]>(() =>
    useApi
      ? defaultWorkspace.relationships
      : loadFromLS<Relationship[]>(
          LS_RELATIONSHIPS,
          initialRelationships,
        ),
  );
  const [calendarSyncs, setCalendarSyncs] = useState<CalendarSync[]>(() =>
    useApi
      ? defaultWorkspace.calendarSyncs
      : loadFromLS<CalendarSync[]>(LS_CALENDAR_SYNCS, initialCalendarSyncs),
  );
  const [mentions, setMentions] = useState<MentionEvent[]>(() =>
    useApi
      ? defaultWorkspace.mentions
      : loadFromLS<MentionEvent[]>(LS_MENTIONS, initialMentions),
  );
  const [workReports, setWorkReports] = useState<WorkReport[]>(() =>
    useApi
      ? defaultWorkspace.workReports
      : loadFromLS<WorkReport[]>(LS_WORK_REPORTS, initialWorkReports),
  );

  const [departments, setDepartments] = useState<Department[]>(() => [
    ...seedDepartments,
  ]);
  const [relations, setRelations] = useState<OrgRelation[]>(() => [
    ...seedOrgRelations,
  ]);

  const [workspaceHydrated, setWorkspaceHydrated] = useState(!useApi);

  // ── 单飞锁 ──────────────────────────────────────────────────
  // 防止并发 PUT 竞态：同一时刻只有一个 PUT 在飞，PUT 期间有变化则完成后再触发
  const isFlushing = useRef(false);
  const hasDirty = useRef(false);

  const refreshWorkspace = useCallback(async () => {
    if (!useApi) return;
    const token = getApiToken();
    if (!token) return;
    // 标记为未就绪，防止 AppShell 在 state 提交前误判为"无用户"而重定向
    setWorkspaceHydrated(false);
    try {
      const snap = await fetchWorkspace(token);
      applySnapshot(snap, {
        setUsers,
        setMindmaps,
        setNodes,
        setAssignments,
        setFollows,
        setShares,
        setLogs,
        setNotifications,
        setRelationships,
        setCalendarSyncs,
        setMentions,
        setWorkReports,
      });
      try {
        const org = await fetchOrg(token);
        setDepartments(org.departments);
        setRelations(org.relations);
      } catch (orgErr) {
        console.error(orgErr);
      }
    } catch (e) {
      console.error(e);
      if (e instanceof Error && e.message === "401") {
        setApiToken(null);
      }
    } finally {
      setWorkspaceHydrated(true);
    }
  }, [useApi]);

  useEffect(() => {
    if (!useApi) {
      setWorkspaceHydrated(true);
      return;
    }
    const token = getApiToken();
    if (!token) {
      setWorkspaceHydrated(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const snap = await fetchWorkspace(token);
        if (cancelled) return;
        applySnapshot(snap, {
          setUsers,
          setMindmaps,
          setNodes,
          setAssignments,
          setFollows,
          setShares,
          setLogs,
          setNotifications,
          setRelationships,
          setCalendarSyncs,
          setMentions,
          setWorkReports,
        });
        try {
          const org = await fetchOrg(token);
          if (!cancelled) {
            setDepartments(org.departments);
            setRelations(org.relations);
          }
        } catch (orgErr) {
          console.error(orgErr);
        }
      } catch (e) {
        console.error(e);
        if (e instanceof Error && e.message === "401") {
          setApiToken(null);
        }
      } finally {
        if (!cancelled) setWorkspaceHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [useApi]);

  useEffect(() => saveToLS(LS_CURRENT_USER, currentUserId), [currentUserId]);

  useEffect(() => {
    if (useApi) return;
    saveToLS(LS_USERS, users);
  }, [useApi, users]);
  useEffect(() => {
    if (useApi) return;
    saveToLS(LS_NODES, nodes);
  }, [useApi, nodes]);
  useEffect(() => {
    if (useApi) return;
    saveToLS(LS_MINDMAPS, mindmaps);
  }, [useApi, mindmaps]);
  useEffect(() => {
    if (useApi) return;
    saveToLS(LS_ASSIGNMENTS, assignments);
  }, [useApi, assignments]);
  useEffect(() => {
    if (useApi) return;
    saveToLS(LS_FOLLOWS, follows);
  }, [useApi, follows]);
  useEffect(() => {
    if (useApi) return;
    saveToLS(LS_SHARES, shares);
  }, [useApi, shares]);
  useEffect(() => {
    if (useApi) return;
    saveToLS(LS_LOGS, logs);
  }, [useApi, logs]);
  useEffect(() => {
    if (useApi) return;
    saveToLS(LS_NOTIFICATIONS, notifications);
  }, [useApi, notifications]);
  useEffect(() => {
    if (useApi) return;
    saveToLS(LS_RELATIONSHIPS, relationships);
  }, [useApi, relationships]);
  useEffect(() => {
    if (useApi) return;
    saveToLS(LS_CALENDAR_SYNCS, calendarSyncs);
  }, [useApi, calendarSyncs]);
  useEffect(() => {
    if (useApi) return;
    saveToLS(LS_MENTIONS, mentions);
  }, [useApi, mentions]);
  useEffect(() => {
    if (useApi) return;
    saveToLS(LS_WORK_REPORTS, workReports);
  }, [useApi, workReports]);

  useEffect(() => {
    if (!useApi || !workspaceHydrated) return;
    const token = getApiToken();
    if (!token) return;

    // 3.3.1 前端过滤空白节点（title 为空且是临时字符串 ID 的节点不发送）
    const filteredNodes = nodes.filter(
      (n) => !(isNaN(Number(n.id)) && !n.title?.trim()),
    );

    // 只发送前端可写的字段，服务端只读字段（workReports/mentions/calendarSyncs 等）不回传
    const snap: Pick<
      WorkspaceSnapshot,
      | "mindmaps"
      | "nodes"
      | "relationships"
      | "assignments"
      | "notifications"
      | "follows"
      | "shares"
      | "logs"
    > = {
      mindmaps,
      nodes: filteredNodes,
      relationships,
      assignments,
      notifications,
      follows,
      shares,
      logs,
    };

    // 3.3.4 带单飞锁的防抖 flush
    const t = setTimeout(() => {
      if (isFlushing.current) {
        hasDirty.current = true;
        return;
      }
      isFlushing.current = true;

      putWorkspace(token, snap)
        .then(({ idMap }) => {
          // 3.3.3 收到 idMap 后重写 state，把临时字符串 ID 替换为真实数字 ID
          if (Object.keys(idMap).length > 0) {
            applyIdMap(idMap, {
              setNodes,
              setMindmaps,
              setAssignments,
              setFollows,
              setShares,
              setLogs,
              setNotifications,
              setRelationships,
              setCalendarSyncs,
              setMentions,
              setWorkReports,
            });
          }
        })
        .catch((err) => console.error(err))
        .finally(() => {
          isFlushing.current = false;
          // 有脏数据则再触发一次
          if (hasDirty.current) {
            hasDirty.current = false;
            // 触发 state 微小变化，让 useEffect 重新执行
            setNodes((prev) => [...prev]);
          }
        });
    }, 1200);

    return () => clearTimeout(t);
  }, [
    useApi,
    workspaceHydrated,
    mindmaps,
    nodes,
    relationships,
    assignments,
    notifications,
    follows,
    shares,
    logs,
  ]);

  const setCurrentUserId = useCallback((id: UserId | null) => {
    _setCurrentUserId(id);
  }, []);

  const resetAll = useCallback(() => {
    if (useApi) {
      const token = getApiToken();
      if (token) {
        void (async () => {
          try {
            await resetWorkspaceRemote(token);
            await refreshWorkspace();
          } catch (e) {
            console.error(e);
          }
        })();
      }
      return;
    }
    setUsers(seedUsers);
    setNodes(initialNodes);
    setMindmaps(seedMindmaps);
    setAssignments(initialAssignments);
    setFollows(initialFollows);
    setShares(initialShares);
    setLogs(initialLogs);
    setNotifications(initialNotifications);
    setRelationships(initialRelationships);
    setCalendarSyncs(initialCalendarSyncs);
    setMentions(initialMentions);
    setWorkReports(initialWorkReports);
    setDepartments([...seedDepartments]);
    setRelations([...seedOrgRelations]);
  }, [useApi, refreshWorkspace]);

  const currentUser = useMemo(
    () => users.find((u) => u.id === currentUserId) ?? null,
    [currentUserId, users],
  );

  // 带 id 去重的 setter 包装，防止快速重复操作向 store 写入两条相同记录
  const setAssignmentsDeduped: React.Dispatch<React.SetStateAction<Assignment[]>> = useCallback(
    (action) => {
      setAssignments((prev) => {
        const next = typeof action === "function" ? action(prev) : action;
        const seen = new Set<string>();
        return next.filter((a) => {
          if (seen.has(a.id)) return false;
          seen.add(a.id);
          return true;
        });
      });
    },
    [setAssignments],
  );

  const setNotificationsDeduped: React.Dispatch<React.SetStateAction<AppNotification[]>> = useCallback(
    (action) => {
      setNotifications((prev) => {
        const next = typeof action === "function" ? action(prev) : action;
        const seen = new Set<string>();
        return next.filter((n) => {
          if (seen.has(n.id)) return false;
          seen.add(n.id);
          return true;
        });
      });
    },
    [setNotifications],
  );

  const value: Store = useMemo(
    () => ({
      users,
      setUsers,
      departments,
      relations,
      mindmaps,
      setMindmaps,
      currentUserId,
      currentUser,
      setCurrentUserId,
      nodes,
      setNodes,
      assignments,
      setAssignments: setAssignmentsDeduped,
      follows,
      setFollows,
      shares,
      setShares,
      logs,
      setLogs,
      notifications,
      setNotifications: setNotificationsDeduped,
      relationships,
      setRelationships,
      calendarSyncs,
      setCalendarSyncs,
      mentions,
      setMentions,
      workReports,
      setWorkReports,
      resetAll,
      workspaceHydrated,
      refreshWorkspace,
    }),
    [
      users,
      mindmaps,
      currentUserId,
      currentUser,
      setCurrentUserId,
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
      departments,
      relations,
      resetAll,
      workspaceHydrated,
      refreshWorkspace,
    ],
  );

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

// ──────────────────────────────────────────────────────────────
// 3.3.2 applyIdMap：将所有 state 中的临时字符串 ID 替换为服务端真实 ID
// ──────────────────────────────────────────────────────────────
type IdMapSetters = {
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setMindmaps: React.Dispatch<React.SetStateAction<MindMap[]>>;
  setAssignments: React.Dispatch<React.SetStateAction<Assignment[]>>;
  setFollows: React.Dispatch<React.SetStateAction<FollowGrant[]>>;
  setShares: React.Dispatch<React.SetStateAction<NodeShare[]>>;
  setLogs: React.Dispatch<React.SetStateAction<TaskLog[]>>;
  setNotifications: React.Dispatch<React.SetStateAction<AppNotification[]>>;
  setRelationships: React.Dispatch<React.SetStateAction<Relationship[]>>;
  setCalendarSyncs: React.Dispatch<React.SetStateAction<CalendarSync[]>>;
  setMentions: React.Dispatch<React.SetStateAction<MentionEvent[]>>;
  setWorkReports: React.Dispatch<React.SetStateAction<WorkReport[]>>;
};

function remap(id: string | undefined, map: Record<string, string>): string | undefined {
  if (!id) return id;
  return map[id] ?? id;
}

function applyIdMap(idMap: Record<string, string>, setters: IdMapSetters) {
  setters.setMindmaps((prev) =>
    prev.map((mm) => ({ ...mm, id: remap(mm.id, idMap) ?? mm.id })),
  );
  setters.setNodes((prev) =>
    prev.map((n) => ({
      ...n,
      id: remap(n.id, idMap) ?? n.id,
      mindmapId: remap(n.mindmapId, idMap) ?? n.mindmapId,
      parentId: n.parentId ? (remap(n.parentId, idMap) ?? n.parentId) : n.parentId,
    })),
  );
  setters.setAssignments((prev) =>
    prev.map((a) => ({
      ...a,
      id: remap(a.id, idMap) ?? a.id,
      targetMindmapId: remap(a.targetMindmapId, idMap) ?? a.targetMindmapId,
      targetSkeletonNodeId: remap(a.targetSkeletonNodeId, idMap) ?? a.targetSkeletonNodeId,
      resultNodeId: a.resultNodeId ? (remap(a.resultNodeId, idMap) ?? a.resultNodeId) : a.resultNodeId,
      assignerMirrorNodeId: a.assignerMirrorNodeId
        ? (remap(a.assignerMirrorNodeId, idMap) ?? a.assignerMirrorNodeId)
        : a.assignerMirrorNodeId,
    })),
  );
  setters.setFollows((prev) =>
    prev.map((f) => ({
      ...f,
      id: remap(f.id, idMap) ?? f.id,
      targetNodeId: remap(f.targetNodeId, idMap) ?? f.targetNodeId,
      granteeMirrorNodeId: f.granteeMirrorNodeId
        ? (remap(f.granteeMirrorNodeId, idMap) ?? f.granteeMirrorNodeId)
        : f.granteeMirrorNodeId,
    })),
  );
  setters.setShares((prev) =>
    prev.map((s) => ({
      ...s,
      id: remap(s.id, idMap) ?? s.id,
      nodeId: remap(s.nodeId, idMap) ?? s.nodeId,
    })),
  );
  setters.setLogs((prev) =>
    prev.map((l) => ({
      ...l,
      id: remap(l.id, idMap) ?? l.id,
      nodeId: remap(l.nodeId, idMap) ?? l.nodeId,
    })),
  );
  setters.setNotifications((prev) =>
    prev.map((n) => ({
      ...n,
      id: remap(n.id, idMap) ?? n.id,
      refNodeId: n.refNodeId ? (remap(n.refNodeId, idMap) ?? n.refNodeId) : n.refNodeId,
      refAssignmentId: n.refAssignmentId
        ? (remap(n.refAssignmentId, idMap) ?? n.refAssignmentId)
        : n.refAssignmentId,
      refFollowGrantId: n.refFollowGrantId
        ? (remap(n.refFollowGrantId, idMap) ?? n.refFollowGrantId)
        : n.refFollowGrantId,
      refReportId: n.refReportId
        ? (remap(n.refReportId, idMap) ?? n.refReportId)
        : n.refReportId,
    })),
  );
  setters.setRelationships((prev) =>
    prev.map((r) => ({
      ...r,
      id: remap(r.id, idMap) ?? r.id,
      mindmapId: remap(r.mindmapId, idMap) ?? r.mindmapId,
      fromId: remap(r.fromId, idMap) ?? r.fromId,
      toId: remap(r.toId, idMap) ?? r.toId,
    })),
  );
  setters.setCalendarSyncs((prev) =>
    prev.map((c) => ({
      ...c,
      id: remap(c.id, idMap) ?? c.id,
      nodeId: remap(c.nodeId, idMap) ?? c.nodeId,
    })),
  );
  setters.setMentions((prev) =>
    prev.map((m) => ({
      ...m,
      id: remap(m.id, idMap) ?? m.id,
      nodeId: remap(m.nodeId, idMap) ?? m.nodeId,
    })),
  );
  setters.setWorkReports((prev) =>
    prev.map((r) => ({
      ...r,
      id: remap(r.id, idMap) ?? r.id,
    })),
  );
}
