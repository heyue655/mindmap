import type {
  AppNotification,
  MentionEvent,
  MentionKind,
  Node,
  NodeShare,
  User,
} from "@/types";
import { newId } from "./id";

/**
 * 当用户提交一段含 @ 的文本时调用：
 * - 对每个新出现的 mention（之前的同节点同人同 kind 都已处理过的不重发）：
 *   - 创建一条 MentionEvent
 *   - 给被 @ 的人发一条通知（mentioned_assign / mentioned_discuss）
 *   - 如果对方 dingtalkBound，标记 dingtalkPushedAt（mock 推钉成功）
 *
 * @returns 新增的 mention 事件 + 新增的通知
 */
export function buildMentionsForSubmit(args: {
  node: Node;
  byUser: User;
  kind: MentionKind;
  text: string;
  /** 已知的所有用户（用来根据 mentionedUserId 取昵称 / 钉钉绑定状态）*/
  users: User[];
  /** 之前在这个节点上的 mention 历史，用于过滤重复 */
  prevMentions: MentionEvent[];
  /** 之前已存在的分享，避免重复创建分享 */
  prevShares: NodeShare[];
  /** 解析出来的 userIds（去重后） */
  mentionedUserIds: string[];
  /** 当前时间 */
  nowISO: string;
}): {
  mentionEvents: MentionEvent[];
  notifications: AppNotification[];
  /** 自动给被 @ 的人补一条 NodeShare（如果还没有），让对方在团队视图能读到 */
  newShares: NodeShare[];
} {
  const {
    node,
    byUser,
    kind,
    text,
    users,
    prevMentions,
    prevShares,
    mentionedUserIds,
    nowISO,
  } = args;
  const events: MentionEvent[] = [];
  const notifs: AppNotification[] = [];
  const shares: NodeShare[] = [];

  for (const mid of mentionedUserIds) {
    if (mid === byUser.id) continue; // 不给自己发
    // 重复检查：同节点 + 同人 + 同 kind 已存在则跳过
    const dup = prevMentions.some(
      (m) =>
        m.nodeId === node.id &&
        m.mentionedUserId === mid &&
        m.kind === kind &&
        // 5 分钟内的同人同 kind mention 视为重复，不再重复推送
        Math.abs(
          new Date(m.createdAt).getTime() - new Date(nowISO).getTime(),
        ) <
          5 * 60 * 1000,
    );
    if (dup) continue;

    const mentionedUser = users.find((u) => u.id === mid);
    const dingtalkPushed = mentionedUser?.dingtalkBound
      ? nowISO
      : undefined;

    events.push({
      id: newId("m"),
      nodeId: node.id,
      byUserId: byUser.id,
      mentionedUserId: mid,
      kind,
      text,
      createdAt: nowISO,
      dingtalkPushedAt: dingtalkPushed,
    });

    notifs.push({
      id: newId("n"),
      recipientId: mid,
      actorId: byUser.id,
      kind: kind === "assign" ? "mentioned_assign" : "mentioned_discuss",
      title:
        kind === "assign"
          ? `${byUser.name} @ 你接下一个任务`
          : `${byUser.name} 在评论里 @ 了你`,
      body: text.length > 60 ? `${text.slice(0, 57)}...` : text,
      refNodeId: node.id,
      createdAt: nowISO,
      dingtalkPushedAt: dingtalkPushed,
    });

    // 自动分享：如果对方对本节点暂没有任何"未撤销"的分享，创建一条
    const alreadyShared =
      prevShares.some(
        (s) =>
          !s.revokedAt && s.audienceId === mid && s.nodeId === node.id,
      ) ||
      shares.some(
        (s) => s.audienceId === mid && s.nodeId === node.id,
      );
    if (!alreadyShared) {
      shares.push({
        id: newId("s"),
        sharerId: byUser.id,
        audienceId: mid,
        nodeId: node.id,
        createdAt: nowISO,
      });
    }
  }

  return {
    mentionEvents: events,
    notifications: notifs,
    newShares: shares,
  };
}
