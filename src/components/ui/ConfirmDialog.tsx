"use client";

/**
 * 规范 3-1：确认对话框组件，替代 window.confirm()
 *
 * 使用方式：
 *   const [open, setOpen] = useState(false);
 *   <ConfirmDialog
 *     open={open}
 *     title="确认删除"
 *     description="此操作不可撤销，删除后数据无法恢复。"
 *     confirmLabel="确认删除"
 *     destructive
 *     onConfirm={() => { doDelete(); setOpen(false); }}
 *     onCancel={() => setOpen(false)}
 *   />
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  /** 是否显示 */
  open: boolean;
  /** 对话框标题 */
  title: string;
  /** 对话框描述（可选） */
  description?: string;
  /** 确认按钮文字，默认"确认" */
  confirmLabel?: string;
  /** 取消按钮文字，默认"取消" */
  cancelLabel?: string;
  /** 是否为危险操作（确认按钮显示红色） */
  destructive?: boolean;
  /** 点击确认按钮的回调 */
  onConfirm: () => void;
  /** 点击取消或关闭对话框的回调 */
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && (
            <DialogDescription>{description}</DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
