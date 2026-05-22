import { useEffect, useState } from "react";
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
import type { AdjustmentRequest, Assignment, UserId } from "@/types";
import { useStore } from "@/store/StoreProvider";
import { getAllAssignTargets } from "@/lib/org";
import { Avatar } from "@/components/ui/avatar";

type NegotiationKind = "deadline" | "transfer" | "split";

interface Props {
  open: boolean;
  assignment: Assignment | null;
  onClose: () => void;
  onSubmit: (req: AdjustmentRequest) => void;
}

export default function NegotiateDialog({
  open,
  assignment,
  onClose,
  onSubmit,
}: Props) {
  const { users, currentUserId, relations } = useStore();
  const [kind, setKind] = useState<NegotiationKind>("deadline");
  const [newDeadline, setNewDeadline] = useState("");
  const [transferTo, setTransferTo] = useState<UserId | "">("");
  const [splitTitles, setSplitTitles] = useState<string>("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open && assignment) {
      setKind("deadline");
      setNewDeadline(assignment.proposedDeadline ?? "");
      setTransferTo("");
      setSplitTitles("");
      setReason("");
    }
  }, [open, assignment]);

  if (!assignment) return null;

  // 转派候选人：当前用户的下属（同级转派暂不支持，简化为"派给自己的下属"）
  const transferCandidates = currentUserId
    ? getAllAssignTargets(currentUserId, relations)
        .map((id) => users.find((u) => u.id === id))
        .filter((u): u is NonNullable<typeof u> => !!u)
    : [];

  const canSubmit = (() => {
    if (kind === "deadline") return !!newDeadline;
    if (kind === "transfer") return !!transferTo;
    if (kind === "split") {
      const lines = splitTitles
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      return lines.length >= 2;
    }
    return false;
  })();

  const handleSubmit = () => {
    let req: AdjustmentRequest;
    if (kind === "deadline") {
      req = {
        kind: "deadline",
        newDeadline,
        reason: reason.trim() || undefined,
      };
    } else if (kind === "transfer") {
      req = {
        kind: "transfer",
        newAssigneeId: transferTo as UserId,
        reason: reason.trim() || undefined,
      };
    } else {
      const subtasks = splitTitles
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((title) => ({ title }));
      req = {
        kind: "split",
        subtasks,
        reason: reason.trim() || undefined,
      };
    }
    onSubmit(req);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>申请调整</DialogTitle>
          <DialogDescription>
            提议一个调整方案给上级，上级会决定是否采纳。调整不会"拒绝"任务，只是协商怎么做。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <div className="font-medium text-brand-ink mb-0.5">
              {assignment.proposedTitle}
            </div>
            原方案：
            {assignment.proposedDeadline ?? "无截止"} ·{" "}
            {assignment.proposedPriority}
          </div>

          <div>
            <Label className="text-xs mb-1 block">调整方案类型</Label>
            <Select
              value={kind}
              onValueChange={(v) => setKind(v as NegotiationKind)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deadline">改期（请求更晚截止）</SelectItem>
                <SelectItem value="split">拆分（拆成多个子任务）</SelectItem>
                <SelectItem value="transfer">转派（让我的下属来做）</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {kind === "deadline" && (
            <div>
              <Label className="text-xs mb-1 block">建议新截止日期</Label>
              <Input
                type="date"
                value={newDeadline}
                onChange={(e) => setNewDeadline(e.target.value)}
              />
            </div>
          )}

          {kind === "transfer" && (
            <div>
              <Label className="text-xs mb-1 block">转派给</Label>
              <Select
                value={transferTo}
                onValueChange={(v) => setTransferTo(v as UserId)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择我的下属…" />
                </SelectTrigger>
                <SelectContent>
                  {transferCandidates.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-slate-400">
                      你没有下属可以转派
                    </div>
                  ) : (
                    transferCandidates.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        <span className="inline-flex items-center gap-1.5">
                          <Avatar size="sm" className="h-5 w-5 text-[10px]">
                            {u.avatar}
                          </Avatar>
                          {u.name}
                        </span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {kind === "split" && (
            <div>
              <Label className="text-xs mb-1 block">
                拆分为多个子任务（每行一个标题，至少两条）
              </Label>
              <Textarea
                value={splitTitles}
                onChange={(e) => setSplitTitles(e.target.value)}
                rows={4}
                placeholder={"例如：\n方案调研\n方案评审\n落地实现"}
              />
            </div>
          )}

          <div>
            <Label className="text-xs mb-1 block">理由（选填）</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="说明为什么需要调整…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button disabled={!canSubmit} onClick={handleSubmit}>
            提交调整
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
