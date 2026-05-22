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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useStore } from "@/store/StoreProvider";
import { getAllSolidAncestors, getAllAncestorsByManagerId, getUserById } from "@/lib/org";
import { newId } from "@/lib/id";
import type {
  AppNotification,
  FollowGrant,
  FollowScope,
  NodeId,
  UserId,
} from "@/types";

interface Props {
  open: boolean;
  nodeId: NodeId | null;
  onClose: () => void;
}

function defaultExpire(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 3);
  return d.toISOString().slice(0, 10);
}

export default function RequestFollowDialog({ open, nodeId, onClose }: Props) {
  const {
    currentUser,
    currentUserId,
    users,
    relations,
    nodes,
    follows,
    setFollows,
    setNotifications,
  } = useStore();

  const node = nodes.find((n) => n.id === nodeId);

  const ancestors = useMemo(() => {
    if (!currentUserId) return [];
    // 合并两个来源：OrgRelation 实线记录 + User.managerId 链，去重
    const fromRelations = getAllSolidAncestors(currentUserId, relations);
    const fromManagerId = getAllAncestorsByManagerId(currentUserId, users);
    const merged = Array.from(new Set([...fromRelations, ...fromManagerId]));
    return merged
      .map((id) => getUserById(users, id))
      .filter((u): u is NonNullable<typeof u> => !!u);
  }, [currentUserId, relations, users]);

  const [granteeId, setGranteeId] = useState<UserId | "">("");
  const [scope, setScope] = useState<FollowScope>("single_task");
  const [expiresAt, setExpiresAt] = useState<string>(defaultExpire());
  const [reason, setReason] = useState<string>("");

  useEffect(() => {
    if (open) {
      setGranteeId(ancestors[0]?.id ?? "");
      setScope("single_task");
      setExpiresAt(defaultExpire());
      setReason("");
    }
  }, [open, ancestors]);

  // 检测是否已有 pending / granted 的同样关注请求
  const hasExisting = useMemo(() => {
    if (!nodeId || !granteeId) return false;
    return follows.some(
      (g) =>
        g.targetNodeId === nodeId &&
        g.granteeId === granteeId &&
        (g.state === "pending" || g.state === "granted"),
    );
  }, [follows, nodeId, granteeId]);

  const handleSubmit = () => {
    if (!currentUser || !node || !granteeId) return;
    const nowISO = new Date().toISOString();
    const expISO = new Date(expiresAt).toISOString();
    const grant: FollowGrant = {
      id: newId("fg"),
      requesterId: currentUser.id,
      granteeId,
      targetNodeId: node.id,
      scope,
      state: "pending",
      expiresAt: expISO,
      reason: reason.trim() || undefined,
      createdAt: nowISO,
    };
    setFollows((prev) => [...prev, grant]);

    const notif: AppNotification = {
      id: newId("n"),
      recipientId: granteeId,
      actorId: currentUser.id,
      kind: "follow_request_received",
      title: `${currentUser.name} 申请你关注一个任务`,
      body: node.title,
      refNodeId: node.id,
      refFollowGrantId: grant.id,
      createdAt: nowISO,
    };
    setNotifications((prev) => [notif, ...prev]);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>申请上级关注</DialogTitle>
          <DialogDescription>
            申请将这条任务（或子树）暴露给指定上级。<strong>需要对方同意</strong>，到期后自动失效。
          </DialogDescription>
        </DialogHeader>

        {node && (
          <div className="rounded-md bg-slate-50 px-3 py-2 text-sm">
            <div className="font-medium text-brand-ink">{node.title}</div>
          </div>
        )}

        <div className="grid gap-3 py-1">
          <div className="grid gap-1.5">
            <Label className="text-xs">关注人</Label>
            {ancestors.length === 0 ? (
              <div className="text-xs text-slate-400 py-1">
                你没有上级（已经是最高层了）
              </div>
            ) : (
              <Select
                value={granteeId}
                onValueChange={(v) => setGranteeId(v as UserId)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择上级" />
                </SelectTrigger>
                <SelectContent>
                  {ancestors.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} · {u.jobTitle}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">关注范围</Label>
            <Select
              value={scope}
              onValueChange={(v) => setScope(v as FollowScope)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single_task">仅这一条任务</SelectItem>
                <SelectItem value="subtree">这条及它的所有子任务</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">有效期至</Label>
            <Input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">说明（可选）</Label>
            <Textarea
              rows={3}
              placeholder="比如：希望领导关注这个跨部门项目的进度"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {hasExisting && (
            <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
              你已经向这位上级申请过关注这条任务，提交将创建新的申请。
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button disabled={!granteeId} onClick={handleSubmit}>
            提交申请
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
