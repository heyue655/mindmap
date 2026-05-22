import type { ReportPeriod } from "./reportInsights";
import type { WorkReportKind, WorkReportSummaryStats } from "@/types";

const KIND_LABEL: Record<WorkReportKind, string> = {
  weekly: "周报",
  monthly: "月报",
  quarterly: "季报",
};

/**
 * 根据导图/任务汇总生成报告正文（演示环境：规则模板 + 自然语言组织，可后续替换为真实 LLM）。
 */
export function buildReportDraftMarkdown(args: {
  authorName: string;
  kind: WorkReportKind;
  period: ReportPeriod;
  stats: WorkReportSummaryStats;
  highlights: string[];
}): string {
  const { authorName, kind, period, stats, highlights } = args;
  const kt = KIND_LABEL[kind];

  const lines: string[] = [
    `# ${authorName} · ${kt}`,
    `**统计周期**：${period.label}`,
    `**生成说明**：由系统根据您在统计周期内的导图节点更新、任务状态与协作记录自动汇总（演示版为模板生成，可对接大模型 API）。`,
    "",
    "## 一、总体概览",
    `- 导图节点有更新的数量：**${stats.nodesTouched}**`,
    `- 本期新产生的任务节点：**${stats.newTasks}**`,
    `- 本期标记完成的任务：**${stats.tasksCompleted}**`,
    `- 当前进行中的任务：**${stats.tasksInProgress}**`,
    `- 任务日志条数：**${stats.logsAdded}**`,
    `- 与您相关的派任务/协作事件：**${stats.assignmentsInvolved}**`,
    "",
    "## 二、重点事项",
  ];

  if (highlights.length === 0) {
    lines.push(
      "（本周期内可量化亮点较少，建议在导图中更新任务进度或补充日志，以便下期报告更丰富。）",
    );
  } else {
    for (const h of highlights) {
      lines.push(`- ${h}`);
    }
  }

  lines.push(
    "",
    "## 三、协作与风险",
    "- 请结合团队待办与关注任务，在下方自由补充需上级协调的事项。",
    "",
    "## 四、下期计划",
    "- （可编辑）列出下一周期 2–4 条可验收目标。",
    "",
    "---",
    "*本报告可在「工作汇报」页继续编辑后提交给上级，并 @ 相关同事。*",
  );

  return lines.join("\n");
}
