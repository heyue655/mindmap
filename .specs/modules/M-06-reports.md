# M-06 工作汇报

**状态：ACTIVE**

## 概述

根据导图节点活动自动汇总统计数据，生成周报/月报/季报草稿，支持提交给上级并 @ 同事。

## 数据模型

### work_reports 表

| 字段 | 说明 |
|------|------|
| id | INT 自增主键 |
| authorId | 作者用户 ID |
| kind | weekly / monthly / quarterly |
| periodLabel | 周期描述（如"2026-W20"） |
| periodStart / periodEnd | 统计周期起止日期 |
| contentMarkdown | 报告正文（Markdown） |
| summaryStats | JSON：统计摘要（节点更新数、任务完成数等） |
| status | draft / submitted |
| submittedAt | 提交时间 |
| submitToUserId | 提交目标用户 ID |
| ccUserIds | JSON：抄送用户 ID 列表 |

## API 接口

通过 `GET/PUT /api/workspace`（M-02）整体同步；暂无独立汇报接口。

## 业务逻辑

- `collectReportInsights`（`src/lib/reportInsights.ts`）：统计周期内节点变更、任务完成、日志条目等
- `buildReportDraftMarkdown`（`src/lib/reportDraft.ts`）：根据统计生成 Markdown 草稿（可替换为 AI 接口）
- 提交后向 `submitToUserId` 发送 `report_submitted` 通知，向 `ccUserIds` 发送 `report_shared` 通知

## 前端组件

- `src/pages/ReportsPage.tsx`：汇报主页，含生成草稿、编辑、提交逻辑

## 变更记录

| 日期 | 编号 | 变更内容 | 原始需求 |
|------|------|----------|----------|
| 2026-05-19 | T-06-001 | ReportsPage 迁移，window.alert → toast | 规范 3-1 |
