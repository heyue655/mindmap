"use client";

import { useMemo, useState } from "react";
import { FileText, Sparkles, Send, UserCheck } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useStore } from "@/store/StoreProvider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getDirectSolidManagerId, getUserById } from "@/lib/org";
import {
  collectReportInsights,
  getReportPeriod,
  type ReportPeriod,
} from "@/lib/reportInsights";
import { buildReportDraftMarkdown } from "@/lib/reportDraft";
import { newId } from "@/lib/id";
import type {
  AppNotification,
  UserId,
  WorkReport,
  WorkReportKind,
} from "@/types";
import { toast } from "@/store/toast";

const KIND_LABEL: Record<WorkReportKind, string> = {
  weekly: "周报",
  monthly: "月报",
  quarterly: "季报",
};

export default function ReportsPage() {
  const {
    currentUser,
    currentUserId,
    users,
    mindmaps,
    nodes,
    logs,
    assignments,
    relations,
    setNotifications,
    workReports,
    setWorkReports,
  } = useStore();

  const [kind, setKind] = useState<WorkReportKind>("weekly");
  const [period, setPeriod] = useState<ReportPeriod>(() =>
    getReportPeriod("weekly"),
  );
  const [content, setContent] = useState("");
  const [stats, setStats] = useState<WorkReport["summaryStats"]>();
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [ccIds, setCcIds] = useState<Set<UserId>>(new Set());
  const [submitToId, setSubmitToId] = useState<UserId | null>(null);

  const managerId = useMemo(
    () =>
      currentUserId
        ? getDirectSolidManagerId(currentUserId, relations)
        : null,
    [currentUserId, relations],
  );

  const manager = managerId ? getUserById(users, managerId) : undefined;

  if (!currentUser || !currentUserId) return null;

  const myReports = useMemo(
    () =>
      workReports
        .filter((r) => r.authorId === currentUserId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [workReports, currentUserId],
  );

  const kindReports = useMemo(
    () => myReports.filter((r) => r.kind === kind),
    [myReports, kind],
  );

  const onKindChange = (k: string) => {
    const nk = k as WorkReportKind;
    setKind(nk);
    setPeriod(getReportPeriod(nk));
    setActiveDraftId(null);
    setContent("");
    setStats(undefined);
  };

  const runGenerate = () => {
    const { stats: st, highlights } = collectReportInsights(
      currentUserId,
      period,
      { mindmaps, nodes, logs, assignments },
    );
    const md = buildReportDraftMarkdown({
      authorName: currentUser.name,
      kind,
      period,
      stats: st,
      highlights,
    });
    setStats(st);
    setContent(md);
    const now = new Date().toISOString();
    const existing = activeDraftId
      ? workReports.find((r) => r.id === activeDraftId)
      : null;
    if (existing && existing.status === "draft") {
      setWorkReports((prev) =>
        prev.map((r) =>
          r.id === existing.id
            ? {
                ...r,
                contentMarkdown: md,
                summaryStats: st,
                periodLabel: period.label,
                periodStart: period.start,
                periodEnd: period.end,
                updatedAt: now,
              }
            : r,
        ),
      );
    } else {
      const id = newId("wr");
      const row: WorkReport = {
        id,
        authorId: currentUserId,
        kind,
        periodLabel: period.label,
        periodStart: period.start,
        periodEnd: period.end,
        contentMarkdown: md,
        summaryStats: st,
        status: "draft",
        ccUserIds: [...ccIds],
        createdAt: now,
        updatedAt: now,
      };
      setWorkReports((prev) => [row, ...prev]);
      setActiveDraftId(id);
    }
  };

  const loadReport = (r: WorkReport) => {
    setKind(r.kind);
    setPeriod({
      start: r.periodStart,
      end: r.periodEnd,
      label: r.periodLabel,
    });
    setContent(r.contentMarkdown);
    setStats(r.summaryStats);
    setActiveDraftId(r.id);
    setCcIds(new Set(r.ccUserIds));
    setSubmitToId(r.submitToUserId ?? managerId);
  };

  const saveDraftEdits = () => {
    if (!activeDraftId) return;
    const now = new Date().toISOString();
    setWorkReports((prev) =>
      prev.map((r) =>
        r.id === activeDraftId
          ? {
              ...r,
              contentMarkdown: content,
              ccUserIds: [...ccIds],
              submitToUserId: submitToId ?? undefined,
              updatedAt: now,
            }
          : r,
      ),
    );
  };

  const submitReport = () => {
    const target = submitToId ?? managerId;
    if (!target) {
      toast.error("未找到直属上级：请在组织关系中配置实线汇报，或手动选择提交对象。");
      return;
    }
    if (!content.trim()) {
      toast.error("请先生成或填写报告正文。");
      return;
    }
    const now = new Date().toISOString();
    let reportId = activeDraftId;
    if (!reportId) {
      reportId = newId("wr");
      const row: WorkReport = {
        id: reportId,
        authorId: currentUserId,
        kind,
        periodLabel: period.label,
        periodStart: period.start,
        periodEnd: period.end,
        contentMarkdown: content,
        summaryStats: stats,
        status: "submitted",
        submittedAt: now,
        submitToUserId: target,
        ccUserIds: [...ccIds],
        createdAt: now,
        updatedAt: now,
      };
      setWorkReports((prev) => [row, ...prev]);
    } else {
      setWorkReports((prev) =>
        prev.map((r) =>
          r.id === reportId
            ? {
                ...r,
                contentMarkdown: content,
                status: "submitted" as const,
                submittedAt: now,
                submitToUserId: target,
                ccUserIds: [...ccIds],
                updatedAt: now,
              }
            : r,
        ),
      );
    }

    const title = `${currentUser.name} 提交了${KIND_LABEL[kind]}`;
    const ccNames = [...ccIds]
      .map((id) => getUserById(users, id)?.name)
      .filter(Boolean)
      .join("、");
    const bodyPreview =
      content.slice(0, 280) + (content.length > 280 ? "…" : "");

    const notifs: AppNotification[] = [
      {
        id: newId("n"),
        recipientId: target,
        actorId: currentUserId,
        kind: "report_submitted",
        title,
        body: `${period.label}\n\n${bodyPreview}`,
        refReportId: reportId!,
        createdAt: now,
      },
    ];
    for (const uid of ccIds) {
      if (uid === target) continue;
      notifs.push({
        id: newId("n"),
        recipientId: uid,
        actorId: currentUserId,
        kind: "report_shared",
        title: `${currentUser.name} 在汇报中 @ 了你`,
        body: `${KIND_LABEL[kind]} · ${period.label}\n\n${bodyPreview}`,
        refReportId: reportId!,
        createdAt: now,
      });
    }
    setNotifications((prev) => [...notifs, ...prev]);
    toast.success(
      `已提交给 ${getUserById(users, target)?.name ?? "上级"}${ccNames ? `，并已通知 @ ${ccNames}` : ""}。`,
    );
  };

  const toggleCc = (uid: UserId) => {
    setCcIds((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <PageHeader
        title="工作汇报"
        description="根据导图与任务活动生成周报 / 月报 / 季报，提交上级并 @ 同事"
      />
      <div className="flex-1 p-4 md:p-6 max-w-6xl mx-auto w-full space-y-4">
        <Tabs value={kind} onValueChange={onKindChange}>
          <TabsList>
            <TabsTrigger value="weekly">周报</TabsTrigger>
            <TabsTrigger value="monthly">月报</TabsTrigger>
            <TabsTrigger value="quarterly">季报</TabsTrigger>
          </TabsList>
          <TabsContent value={kind} className="mt-4 space-y-4">
            <div className="rounded-lg border border-border bg-white p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <span>
                  当前统计周期：<strong>{period.label}</strong>
                </span>
                <Badge variant="outline" className="text-[10px]">
                  基于上一完整周/月/季度
                </Badge>
              </div>
              <p className="text-xs text-slate-500">
                演示版根据您名下导图的节点更新、任务完成、日志与派任务记录自动汇总；正文为模板生成，可对接大模型后替换为真实
                AI 输出。
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="gap-1.5"
                  onClick={() => {
                    setPeriod(getReportPeriod(kind));
                    runGenerate();
                  }}
                >
                  <Sparkles className="h-4 w-4" />
                  AI 生成草稿
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={saveDraftEdits}
                  disabled={!activeDraftId}
                >
                  保存修改
                </Button>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="md:col-span-1 space-y-2">
                <Label className="text-xs text-muted-foreground">
                  我的{kind === "weekly" ? "周" : kind === "monthly" ? "月" : "季"}报记录
                </Label>
                <div className="rounded-lg border border-border bg-white max-h-64 overflow-y-auto">
                  {kindReports.length === 0 ? (
                    <div className="p-3 text-xs text-slate-400">
                      暂无记录，点击「AI 生成草稿」
                    </div>
                  ) : (
                    <ul className="divide-y divide-border">
                      {kindReports.map((r) => (
                        <li key={r.id}>
                          <button
                            type="button"
                            className={cn(
                              "w-full text-left px-3 py-2 text-xs hover:bg-slate-50",
                              activeDraftId === r.id && "bg-orange-50",
                            )}
                            onClick={() => loadReport(r)}
                          >
                            <div className="font-medium text-slate-800 truncate">
                              {r.periodLabel}
                            </div>
                            <div className="flex gap-1 mt-0.5">
                              <Badge
                                variant={
                                  r.status === "submitted"
                                    ? "default"
                                    : "secondary"
                                }
                                className="text-[10px] h-5"
                              >
                                {r.status === "submitted" ? "已提交" : "草稿"}
                              </Badge>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="md:col-span-2 space-y-3">
                <Label>报告正文（Markdown）</Label>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="min-h-[280px] font-mono text-sm"
                  placeholder="点击「AI 生成草稿」或从左侧选择历史记录…"
                />
                {stats && (
                  <div className="text-[11px] text-slate-500 flex flex-wrap gap-3">
                    <span>节点更新 {stats.nodesTouched}</span>
                    <span>完成任务 {stats.tasksCompleted}</span>
                    <span>进行中 {stats.tasksInProgress}</span>
                    <span>协作 {stats.assignmentsInvolved}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-white p-4 space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <Send className="h-4 w-4 text-brand-orange" />
                提交与分享
              </div>
              <div className="space-y-2">
                <Label className="text-xs">提交给（直属实线上级）</Label>
                <div className="flex flex-wrap gap-2">
                  {users
                    .filter((u) => u.id !== currentUserId)
                    .map((u) => {
                      const isMgr = managerId === u.id;
                      const selected = (submitToId ?? managerId) === u.id;
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => setSubmitToId(u.id)}
                          className={cn(
                            "text-xs px-2 py-1 rounded-md border",
                            selected
                              ? "border-brand-orange bg-orange-50 text-brand-ink"
                              : "border-border text-slate-600 hover:bg-slate-50",
                          )}
                        >
                          {u.name}
                          {isMgr && (
                            <UserCheck className="inline h-3 w-3 ml-0.5 opacity-70" />
                          )}
                        </button>
                      );
                    })}
                </div>
                {!manager && (
                  <p className="text-[11px] text-amber-700">
                    未检测到实线上级，请手动点选提交对象。
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-xs">@ 同时通知的同事（可多选）</Label>
                <div className="flex flex-wrap gap-2">
                  {users
                    .filter((u) => u.id !== currentUserId)
                    .map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggleCc(u.id)}
                        className={cn(
                          "text-xs px-2 py-1 rounded-md border",
                          ccIds.has(u.id)
                            ? "border-purple-300 bg-purple-50 text-purple-900"
                            : "border-border text-slate-600 hover:bg-slate-50",
                        )}
                      >
                        @{u.name}
                      </button>
                    ))}
                </div>
              </div>
              <Button
                type="button"
                className="gap-1.5"
                onClick={submitReport}
              >
                <FileText className="h-4 w-4" />
                提交汇报并发送通知
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
