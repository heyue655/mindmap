import { useEffect, useMemo, useState } from "react";
import { Check, X, Users, ChevronDown, Search } from "lucide-react";
import { toast } from "@/store/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/store/StoreProvider";
import {
  getDirectReports,
  getAllAssignTargets,
  getAllDescendantsByManagerId,
  isRelationActive,
} from "@/lib/org";
import { newId } from "@/lib/id";
import { mindmapForAssigneeBucket } from "@/lib/mindmapResolve";
import { cn } from "@/lib/utils";
import type {
  AppNotification,
  Assignment,
  Node,
  NodeId,
  Priority,
  TimeBucketKind,
  UserId,
} from "@/types";

// 返回今天的 YYYY-MM-DD 字符串（本地时区）
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Props {
  open: boolean;
  onClose: () => void;
  // 可选：预填充目标人/目标骨架节点（用于"在某人导图上右键派任务到这里"场景）
  presetAssigneeId?: UserId;
  presetTargetSkeletonId?: NodeId;
  // 可选：预填充任务标题和截止日期（来自当前选中节点）
  presetNode?: Node;
}

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: "P0", label: "P0 · 最高" },
  { value: "P1", label: "P1 · 高" },
  { value: "P2", label: "P2 · 中" },
  { value: "P3", label: "P3 · 低" },
];

type BucketSelection = {
  kind: Extract<TimeBucketKind, "quarter" | "month">;
  // value 比如 "2026Q1" / "2026-05"
  value: string;
};

// 当前月份的桶值，例如 "2026-05"
function currentMonthBucket(): BucketSelection {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return { kind: "month", value: `${y}-${m}` };
}

export default function AssignDialog({
  open,
  onClose,
  presetAssigneeId,
  presetTargetSkeletonId,
  presetNode,
}: Props) {
  const {
    currentUser,
    currentUserId,
    users,
    relations,
    mindmaps,
    nodes,
    setAssignments,
    setNotifications,
  } = useStore();

  // ---------- 收件人多选 ----------
  const [assigneeIds, setAssigneeIds] = useState<Set<UserId>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 直接下属、间接下属
  // 合并 OrgRelation 路径 + User.managerId 链，兜底历史数据 OrgRelation 缺失的情况
  const directReportIds = useMemo<UserId[]>(() => {
    if (!currentUserId) return [];
    const fromRelations = getDirectReports(currentUserId, relations)
      .filter((r) => r.relationType === "solid" && isRelationActive(r))
      .map((r) => r.subordinateId);
    const fromManagerId = users
      .filter((u) => u.managerId === currentUserId)
      .map((u) => u.id);
    return [...new Set([...fromRelations, ...fromManagerId])];
  }, [currentUserId, relations, users]);

  const allReportIds = useMemo<UserId[]>(() => {
    if (!currentUserId) return [];
    const fromRelations = getAllAssignTargets(currentUserId, relations);
    const fromManagerId = getAllDescendantsByManagerId(currentUserId, users);
    return [...new Set([...fromRelations, ...fromManagerId])];
  }, [currentUserId, relations, users]);

  const indirectReportIds = useMemo<UserId[]>(() => {
    const direct = new Set(directReportIds);
    return allReportIds.filter((id) => !direct.has(id));
  }, [directReportIds, allReportIds]);

  // ---------- 时间桶 ----------
  // bucket 由截止日期自动推断，此处仅维护 state 用于 resolveSkeletonForAssignee 校验
  // 默认当月，会被 deadline→bucket effect 同步覆盖
  const [bucket, setBucket] = useState<BucketSelection | null>(() =>
    currentMonthBucket(),
  );

  // ---------- 任务字段 ----------
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [priority, setPriority] = useState<Priority>("P2");

  // ---------- 重置 ----------
  useEffect(() => {
    if (!open) return;
    // 处理 presets
    if (presetAssigneeId) {
      setAssigneeIds(new Set([presetAssigneeId]));
    } else {
      setAssigneeIds(new Set());
    }
    // bucket 默认值：优先用 presetTargetSkeletonId 对应的桶，否则由截止日期推断（见 deadline→bucket 同步 effect）
    if (presetTargetSkeletonId) {
      const sk = nodes.find((n) => n.id === presetTargetSkeletonId);
      if (
        sk &&
        sk.nodeType === "skeleton" &&
        (sk.timeBucketKind === "quarter" || sk.timeBucketKind === "month") &&
        sk.timeBucketValue
      ) {
        setBucket({ kind: sk.timeBucketKind, value: sk.timeBucketValue });
      }
    }
    // 预填标题：任务节点取 title，普通节点同样取 title
    setTitle(presetNode?.title ?? "");
    // 预填截止日期：任务节点取 task.deadline，否则默认今天
    const initialDeadline = presetNode?.task?.deadline ?? todayISO();
    setDeadline(initialDeadline);
    // 根据截止日期同步初始 bucket（无 presetTargetSkeletonId 时生效）
    if (!presetTargetSkeletonId) {
      const yr = parseInt(initialDeadline.slice(0, 4));
      const mo = initialDeadline.slice(5, 7);
      if (!isNaN(yr) && mo) {
        setBucket({ kind: "month", value: `${yr}-${mo}` });
      }
    }
    setPriority(presetNode?.task?.priority ?? "P2");
    setDescription("");
    setSearchQ("");
    setPickerOpen(false);
  }, [open, presetAssigneeId, presetTargetSkeletonId, presetNode, nodes]);

  // deadline 变化时自动将 bucket 同步到对应月份
  useEffect(() => {
    if (!open) return;
    if (deadline && deadline.length >= 7) {
      const yr = parseInt(deadline.slice(0, 4));
      const mo = deadline.slice(5, 7);
      if (!isNaN(yr) && mo) {
        setBucket({ kind: "month", value: `${yr}-${mo}` });
      }
    } else if (!deadline) {
      const cm = currentMonthBucket();
      setBucket(cm);
    }
  }, [deadline, open]);

  // ---------- 派发 ----------
  const canSubmit = !!(assigneeIds.size > 0 && bucket && title.trim());

  // 在每个 assignee 的 mindmap 中查找对应的骨架节点
  const resolveSkeletonForAssignee = (
    assigneeId: UserId,
    sel: BucketSelection,
  ): Node | null => {
    const mm = mindmapForAssigneeBucket(mindmaps, assigneeId, sel, nodes);
    if (!mm) return null;
    return (
      nodes.find(
        (n) =>
          n.mindmapId === mm.id &&
          n.nodeType === "skeleton" &&
          n.timeBucketKind === sel.kind &&
          n.timeBucketValue === sel.value &&
          !n.isDeleted,
      ) ?? null
    );
  };

  const handleSubmit = () => {
    if (!currentUser || !canSubmit || !bucket || isSubmitting) return;
    setIsSubmitting(true);

    // ── 构建指派记录 ──────────────────────────────────────────────────────
    // 无论下属是否已有导图/骨架节点，均无条件创建 assignment。
    // targetMindmapId / targetSkeletonNodeId 能解析到就填，解析不到留 undefined。
    // 下属登录时服务端 reconciliation 会自动补填。
    const nowISO = new Date().toISOString();
    const newAssignments: Assignment[] = [];
    const newNotifs: AppNotification[] = [];

    for (const aid of assigneeIds) {
      const mm = mindmapForAssigneeBucket(mindmaps, aid, bucket, nodes);
      const sk =
        !mm
          ? undefined
          : (nodes.find(
              (n) =>
                n.mindmapId === mm.id &&
                n.nodeType === "skeleton" &&
                n.timeBucketKind === bucket.kind &&
                n.timeBucketValue === bucket.value &&
                !n.isDeleted,
            ) ?? undefined);

      const assignment: Assignment = {
        id: newId("asg"),
        assignerId: currentUser.id,
        assigneeId: aid,
        targetMindmapId: mm?.id,
        targetSkeletonNodeId: sk?.id,
        timeBucketKind: bucket.kind,
        timeBucketValue: bucket.value,
        proposedTitle: title.trim(),
        proposedDescription: description.trim() || undefined,
        proposedDeadline: deadline || undefined,
        proposedPriority: priority,
        state: "pending",
        // 若上级选中的是自己导图里的普通节点（无 task / taskPeer），记录其 id，
        // 下级接受后直接升级该节点而非新建副本，避免重复节点
        assignerSourceNodeId:
          presetNode && !presetNode.task && !presetNode.taskPeer
            ? presetNode.id
            : undefined,
        createdAt: nowISO,
      };
      newAssignments.push(assignment);
      const u = users.find((x) => x.id === aid);
      newNotifs.push({
        id: newId("n"),
        recipientId: aid,
        actorId: currentUser.id,
        kind: "assignment_received",
        title: `${currentUser.name} 派给你一个新任务`,
        body: `${assignment.proposedTitle}${
          assignment.proposedDeadline
            ? ` · ${assignment.proposedDeadline}`
            : ""
        }`,
        refAssignmentId: assignment.id,
        createdAt: nowISO,
      });
      void u; // u 仅用于 debug，lint 消除
    }

    if (newAssignments.length === 0) {
      toast.error("请至少选择一位下属。");
      setIsSubmitting(false);
      return;
    }

    setAssignments((prev) => [...prev, ...newAssignments]);
    setNotifications((prev) => [...newNotifs, ...prev]);

    setIsSubmitting(false);
    onClose();
    setTimeout(() => {
      const successNames = newAssignments
        .map((a) => users.find((u) => u.id === a.assigneeId)?.name)
        .filter(Boolean)
        .join("、");
      toast.success(
        `已派给 ${newAssignments.length} 位下属：${successNames}。等他们在「待我处理」里接受或调整。`,
      );
    }, 0);
  };

  // ---------- 渲染 ----------
  const selectedUsers = Array.from(assigneeIds)
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is NonNullable<typeof u> => !!u);

  const filteredDirect = useMemo(
    () =>
      directReportIds
        .map((id) => users.find((u) => u.id === id))
        .filter((u): u is NonNullable<typeof u> => !!u)
        .filter((u) => matchesSearch(u.name, u.jobTitle, searchQ)),
    [directReportIds, users, searchQ],
  );
  const filteredIndirect = useMemo(
    () =>
      indirectReportIds
        .map((id) => users.find((u) => u.id === id))
        .filter((u): u is NonNullable<typeof u> => !!u)
        .filter((u) => matchesSearch(u.name, u.jobTitle, searchQ)),
    [indirectReportIds, users, searchQ],
  );

  const toggleUser = (id: UserId) => {
    setAssigneeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllDirect = () => {
    setAssigneeIds((prev) => {
      const next = new Set(prev);
      for (const id of directReportIds) next.add(id);
      return next;
    });
  };

  const selectAllIndirect = () => {
    setAssigneeIds((prev) => {
      const next = new Set(prev);
      for (const id of indirectReportIds) next.add(id);
      return next;
    });
  };

  const clearSelection = () => setAssigneeIds(new Set());

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl flex flex-col max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>派任务</DialogTitle>
          <DialogDescription>
            把任务派给一位或多位下级。每位下属会在他们各自的「待我处理」里看到这条任务，可独立接受或申请调整。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto flex-1 pr-1">
          {/* 任务标题（必填） */}
          <div>
            <Label className="text-xs mb-1 block">
              任务标题<span className="text-red-500 ml-0.5">*</span>
            </Label>
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                assigneeIds.size > 1
                  ? "下发给所有选中下属的同一任务标题"
                  : "一句话说明这个任务做什么"
              }
            />
          </div>

          {/* 描述 */}
          <div>
            <Label className="text-xs mb-1 block">描述（选填）</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="背景、验收标准、参考资料…"
              rows={3}
            />
          </div>

          {/* 截止日期 + 优先级 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1 block">截止日期</Label>
              <Input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs mb-1 block">优先级</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as Priority)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 收件人（必填，放最后） */}
          <div>
            <Label className="text-xs mb-1 block">
              指派给<span className="text-red-500 ml-0.5">*</span>
            </Label>

            <div
              className={cn(
                "rounded-md border border-input bg-background px-2 py-1.5 min-h-9 cursor-pointer flex items-center gap-1 flex-wrap",
                pickerOpen && "ring-2 ring-brand-orange/30 border-brand-orange",
              )}
              onClick={() => setPickerOpen((v) => !v)}
            >
              {selectedUsers.length === 0 ? (
                <span className="text-sm text-slate-400">
                  选择下属…（可多选）
                </span>
              ) : (
                selectedUsers.map((u) => (
                  <span
                    key={u.id}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-brand-orange/10 text-brand-ink text-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Avatar size="sm" className="h-5 w-5 text-[10px]">{u.avatar}</Avatar>
                    <span>{u.name}</span>
                    <button
                      className="hover:text-rose-600"
                      onClick={() => toggleUser(u.id)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))
              )}
              <span className="ml-auto text-slate-400">
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform",
                    pickerOpen && "rotate-180",
                  )}
                />
              </span>
            </div>

            {pickerOpen && (
              <div className="mt-1.5 rounded-md border border-border bg-white shadow-sm overflow-hidden">
                {/* 搜索 + 快捷 */}
                <div className="px-2 py-1.5 border-b border-slate-100 space-y-1.5">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <Input
                      className="pl-7 h-8 text-sm"
                      placeholder="按姓名 / 职位过滤"
                      value={searchQ}
                      onChange={(e) => setSearchQ(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      className="text-[11px] px-1.5 py-0.5 rounded border border-border hover:bg-slate-50"
                      onClick={selectAllDirect}
                    >
                      <Users className="inline h-3 w-3 mr-0.5" />
                      全选直接下属（{directReportIds.length}）
                    </button>
                    {indirectReportIds.length > 0 && (
                      <button
                        type="button"
                        className="text-[11px] px-1.5 py-0.5 rounded border border-border hover:bg-slate-50"
                        onClick={selectAllIndirect}
                      >
                        全选间接下属（{indirectReportIds.length}）
                      </button>
                    )}
                    {assigneeIds.size > 0 && (
                      <button
                        type="button"
                        className="text-[11px] px-1.5 py-0.5 rounded border border-border hover:bg-slate-50 text-rose-600"
                        onClick={clearSelection}
                      >
                        清空（{assigneeIds.size}）
                      </button>
                    )}
                  </div>
                </div>

                <div className="max-h-56 overflow-y-auto py-1">
                  {filteredDirect.length === 0 &&
                    filteredIndirect.length === 0 && (
                      <div className="px-3 py-4 text-center text-xs text-slate-400">
                        没有匹配的下属
                      </div>
                    )}

                  {filteredDirect.length > 0 && (
                    <SectionLabel
                      text="直接下属"
                      sub={`${filteredDirect.length}/${directReportIds.length}`}
                    />
                  )}
                  {filteredDirect.map((u) => (
                    <UserRow
                      key={u.id}
                      avatar={u.avatar ?? ""}
                      name={u.name}
                      jobTitle={u.jobTitle}
                      checked={assigneeIds.has(u.id)}
                      onClick={() => toggleUser(u.id)}
                      tag="直接"
                    />
                  ))}

                  {filteredIndirect.length > 0 && (
                    <SectionLabel
                      text="间接下属"
                      sub={`${filteredIndirect.length}/${indirectReportIds.length}`}
                    />
                  )}
                  {filteredIndirect.map((u) => (
                    <UserRow
                      key={u.id}
                      avatar={u.avatar ?? ""}
                      name={u.name}
                      jobTitle={u.jobTitle}
                      checked={assigneeIds.has(u.id)}
                      onClick={() => toggleUser(u.id)}
                      tag="间接"
                      tagCls="bg-slate-100 text-slate-500"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* bucket 可用性提示：bucket 由截止日期自动推断，提示哪些人缺少对应月份骨架 */}
            {bucket && assigneeIds.size > 0 && (
              <BucketAvailabilityHint
                assigneeIds={Array.from(assigneeIds)}
                bucket={bucket}
                resolveSkeletonForAssignee={resolveSkeletonForAssignee}
              />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button disabled={!canSubmit || isSubmitting} onClick={handleSubmit}>
            {isSubmitting ? "派送中…" : assigneeIds.size > 1
              ? `派给 ${assigneeIds.size} 人`
              : "派出"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- 子组件 ----------

function matchesSearch(name: string, jobTitle: string, q: string): boolean {
  if (!q.trim()) return true;
  const k = q.toLowerCase();
  return (
    name.toLowerCase().includes(k) || jobTitle.toLowerCase().includes(k)
  );
}

function SectionLabel({ text, sub }: { text: string; sub?: string }) {
  return (
    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 flex items-center gap-1">
      {text}
      {sub && <span className="font-normal text-slate-300">· {sub}</span>}
    </div>
  );
}

function UserRow({
  avatar,
  name,
  jobTitle,
  checked,
  onClick,
  tag,
  tagCls,
}: {
  avatar: string;
  name: string;
  jobTitle: string;
  checked: boolean;
  onClick: () => void;
  tag?: string;
  tagCls?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-slate-50",
        checked && "bg-brand-orange/5",
      )}
    >
      <Avatar size="sm" className="h-6 w-6 text-xs">
        {avatar}
      </Avatar>
      <span className="flex-1 min-w-0">
        <div className="truncate font-medium text-brand-ink text-sm">
          {name}
        </div>
        <div className="text-[11px] text-slate-500 truncate">{jobTitle}</div>
      </span>
      {tag && (
        <Badge
          variant="outline"
          className={cn("text-[10px] px-1 py-0", tagCls)}
        >
          {tag}
        </Badge>
      )}
      <span
        className={cn(
          "h-4 w-4 rounded border flex items-center justify-center shrink-0",
          checked
            ? "bg-brand-orange border-brand-orange text-white"
            : "border-slate-300 bg-white",
        )}
      >
        {checked && <Check className="h-3 w-3" />}
      </span>
    </button>
  );
}

function BucketAvailabilityHint({
  assigneeIds,
  bucket,
  resolveSkeletonForAssignee,
}: {
  assigneeIds: UserId[];
  bucket: BucketSelection;
  resolveSkeletonForAssignee: (
    id: UserId,
    sel: BucketSelection,
  ) => Node | null;
}) {
  const { users } = useStore();
  const missing = assigneeIds.filter(
    (id) => !resolveSkeletonForAssignee(id, bucket),
  );
  if (missing.length === 0) return null;
  const names = missing
    .map((id) => users.find((u) => u.id === id)?.name)
    .filter(Boolean)
    .join("、");
  return (
    <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
      {missing.length} 位下属的导图缺少该时间段，将被跳过：{names}
    </div>
  );
}
