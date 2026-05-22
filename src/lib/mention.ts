import type { User } from "@/types";

export interface ParsedMention {
  /** 匹配到的用户 id */
  userId: string;
  /** 在原字符串里的位置（@ 起始处）*/
  start: number;
  /** 在原字符串里的位置（@姓名 末尾的下一位）*/
  end: number;
  /** 匹配到的"@姓名"原文（含 @）*/
  raw: string;
  /** 匹配到的姓名 */
  name: string;
}

/**
 * 把一段文本里的 @姓名 解析成 ParsedMention 列表。
 * 简化做法：用候选用户名做精确前缀匹配（中文 / 英文都支持）。
 *
 * @ 后允许接：
 * - 任意非空白字符直至下一个空白 / 标点
 * - 但要求开头能匹配某个已知 user.name
 *
 * 不会重复匹配同一个用户多次（由调用方决定是否去重）。
 */
export function parseMentions(text: string, users: User[]): ParsedMention[] {
  if (!text) return [];
  const out: ParsedMention[] = [];
  // 把姓名按长度倒序，避免短名字（"李"）匹配到长名字（"李研发"）
  const sorted = [...users].sort((a, b) => b.name.length - a.name.length);
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch !== "@") {
      i++;
      continue;
    }
    const after = text.slice(i + 1);
    const matched = sorted.find((u) => after.startsWith(u.name));
    if (matched) {
      out.push({
        userId: matched.id,
        start: i,
        end: i + 1 + matched.name.length,
        raw: text.slice(i, i + 1 + matched.name.length),
        name: matched.name,
      });
      i += 1 + matched.name.length;
    } else {
      i++;
    }
  }
  return out;
}

/** 取去重后的 userId 列表（按出现顺序）。*/
export function uniqueMentionUserIds(text: string, users: User[]): string[] {
  const arr = parseMentions(text, users);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of arr) {
    if (!seen.has(m.userId)) {
      seen.add(m.userId);
      out.push(m.userId);
    }
  }
  return out;
}

/**
 * 把 "...@JOJO 这个..." 这样的字符串拆成 token 列表，方便渲染时把命中的部分上紫色。
 * - 命中者：{ kind: "mention", userId, raw }
 * - 其余： { kind: "text", text }
 */
export type MentionToken =
  | { kind: "text"; text: string }
  | { kind: "mention"; userId: string; raw: string; name: string };

export function tokenizeMentions(
  text: string,
  users: User[],
): MentionToken[] {
  const ms = parseMentions(text, users);
  if (ms.length === 0) return [{ kind: "text", text }];
  const out: MentionToken[] = [];
  let cursor = 0;
  for (const m of ms) {
    if (m.start > cursor) {
      out.push({ kind: "text", text: text.slice(cursor, m.start) });
    }
    out.push({
      kind: "mention",
      userId: m.userId,
      raw: m.raw,
      name: m.name,
    });
    cursor = m.end;
  }
  if (cursor < text.length) {
    out.push({ kind: "text", text: text.slice(cursor) });
  }
  return out;
}

/**
 * 检测光标处是否正在输入 @xxx（用于触发 MentionPicker 浮层）。
 * 返回触发时的查询串与 @ 的位置；否则返回 null。
 */
export function detectActiveMention(
  text: string,
  caret: number,
): { query: string; atIndex: number } | null {
  if (!text || caret <= 0) return null;
  // 向前找 @，最多回溯 32 个字符；遇到空白则中断
  let i = caret - 1;
  let limit = 0;
  while (i >= 0 && limit < 32) {
    const ch = text[i]!;
    if (ch === "@") {
      const query = text.slice(i + 1, caret);
      // 已经包含空格：不算
      if (/\s/.test(query)) return null;
      return { query, atIndex: i };
    }
    if (/\s/.test(ch)) return null;
    i--;
    limit++;
  }
  return null;
}
