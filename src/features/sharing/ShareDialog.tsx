import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { useStore } from "@/store/StoreProvider";
import { getAllSolidAncestors, getAllAncestorsByManagerId, getUserById } from "@/lib/org";
import { newId } from "@/lib/id";
import type { AppNotification, NodeId, NodeShare, UserId } from "@/types";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface Props {
  open: boolean;
  nodeId: NodeId | null;
  onClose: () => void;
}

export default function ShareDialog({ open, nodeId, onClose }: Props) {
  const {
    currentUser,
    currentUserId,
    users,
    relations,
    nodes,
    shares,
    setShares,
    setNotifications,
  } = useStore();

  const node = nodes.find((n) => n.id === nodeId);

  const ancestors = useMemo(() => {
    if (!currentUserId) return [];
    const fromRelations = getAllSolidAncestors(currentUserId, relations);
    const fromManagerId = getAllAncestorsByManagerId(currentUserId, users);
    const merged = Array.from(new Set([...fromRelations, ...fromManagerId]));
    return merged
      .map((id) => getUserById(users, id))
      .filter((u): u is NonNullable<typeof u> => !!u);
  }, [currentUserId, relations, users]);

  // 已分享给谁
  const existingAudienceIds = useMemo(() => {
    if (!nodeId) return new Set<UserId>();
    return new Set(
      shares
        .filter((s) => s.nodeId === nodeId && !s.revokedAt)
        .map((s) => s.audienceId),
    );
  }, [shares, nodeId]);

  const [selected, setSelected] = useState<Set<UserId>>(new Set());

  useEffect(() => {
    if (open) setSelected(new Set());
  }, [open]);

  const toggle = (id: UserId) => {
    if (existingAudienceIds.has(id)) return; // 已分享的不能再操作
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = () => {
    if (!currentUser || !node) return;
    const nowISO = new Date().toISOString();
    const newShares: NodeShare[] = Array.from(selected).map((aid) => ({
      id: newId("ns"),
      sharerId: currentUser.id,
      audienceId: aid,
      nodeId: node.id,
      createdAt: nowISO,
    }));
    if (newShares.length === 0) {
      onClose();
      return;
    }
    setShares((prev) => [...prev, ...newShares]);

    const notifs: AppNotification[] = newShares.map((s) => ({
      id: newId("n"),
      recipientId: s.audienceId,
      actorId: currentUser.id,
      kind: "node_shared",
      title: `${currentUser.name} 分享了任务给你`,
      body: node.title,
      refNodeId: node.id,
      createdAt: nowISO,
    }));
    setNotifications((prev) => [...notifs, ...prev]);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>分享给上级</DialogTitle>
          <DialogDescription>
            主动把这条任务暴露给所选上级。分享后他们能在「团队视图」里看到这条任务的进度和日志，
            <strong>无需经过审批</strong>。
          </DialogDescription>
        </DialogHeader>

        {node && (
          <div className="rounded-md bg-slate-50 px-3 py-2 text-sm">
            <div className="font-medium text-brand-ink">{node.title}</div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs">选择上级</Label>
          {ancestors.length === 0 ? (
            <div className="text-xs text-slate-400 py-3 text-center">
              你没有上级（已经是最高层了）
            </div>
          ) : (
            ancestors.map((u) => {
              const already = existingAudienceIds.has(u.id);
              const checked = selected.has(u.id);
              return (
                <button
                  key={u.id}
                  onClick={() => toggle(u.id)}
                  disabled={already}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded-md border text-left text-sm",
                    already
                      ? "bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed"
                      : checked
                        ? "bg-brand-orange/10 border-brand-orange text-brand-ink"
                        : "bg-white border-border hover:bg-slate-50 text-slate-700",
                  )}
                >
                  <Avatar size="sm">{u.avatar}</Avatar>
                  <span className="flex-1 min-w-0">
                    <div className="truncate font-medium">{u.name}</div>
                    <div className="text-[10px] text-slate-500 truncate">
                      {u.jobTitle}
                    </div>
                  </span>
                  {already && (
                    <span className="text-[10px] text-slate-400">已分享</span>
                  )}
                  {checked && !already && (
                    <Check className="h-4 w-4 text-brand-orange" />
                  )}
                </button>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button disabled={selected.size === 0} onClick={handleSubmit}>
            分享给 {selected.size} 人
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
