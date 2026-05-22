import { users } from "./org";
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
  mindmaps,
} from "./initialData";
import type { WorkspaceSnapshot } from "../types/workspaceSnapshot";

export function getDefaultWorkspaceSnapshot(): WorkspaceSnapshot {
  return {
    users: structuredClone(users),
    mindmaps: structuredClone(mindmaps),
    nodes: structuredClone(initialNodes),
    assignments: structuredClone(initialAssignments),
    follows: structuredClone(initialFollows),
    shares: structuredClone(initialShares),
    logs: structuredClone(initialLogs),
    notifications: structuredClone(initialNotifications),
    relationships: structuredClone(initialRelationships),
    calendarSyncs: structuredClone(initialCalendarSyncs),
    mentions: structuredClone(initialMentions),
    workReports: structuredClone(initialWorkReports),
  };
}
