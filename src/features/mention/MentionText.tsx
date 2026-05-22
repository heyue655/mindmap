import type { User } from "@/types";
import { tokenizeMentions } from "@/lib/mention";
import { cn } from "@/lib/utils";

interface Props {
  text: string;
  users: User[];
  className?: string;
  /** 命中的 @姓名 chip 用什么色调，默认紫色 */
  tone?: "purple" | "blue" | "amber";
}

/**
 * 把含 @姓名 的文本渲染成"普通文本 + 紫色芯片"的混合形式。
 * 用于节点标题、描述、日志正文。
 */
export default function MentionText({
  text,
  users,
  className,
  tone = "purple",
}: Props) {
  const tokens = tokenizeMentions(text, users);
  const chipCls =
    tone === "blue"
      ? "bg-blue-50 text-blue-700 border-blue-200"
      : tone === "amber"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-purple-50 text-purple-700 border-purple-200";
  return (
    <span className={className}>
      {tokens.map((t, i) => {
        if (t.kind === "text") return <span key={i}>{t.text}</span>;
        return (
          <span
            key={i}
            className={cn(
              "inline-flex items-center px-1 rounded text-[0.85em] border",
              "font-medium whitespace-nowrap leading-tight",
              chipCls,
            )}
            title={`已 @${t.name}（${getJobTitle(users, t.userId)}）`}
          >
            @{t.name}
          </span>
        );
      })}
    </span>
  );
}

function getJobTitle(users: User[], userId: string): string {
  return users.find((u) => u.id === userId)?.jobTitle ?? "";
}
