"use client";

/**
 * 规范 3-1：Toast UI 提供者组件
 *
 * 挂载在根 layout，监听 toast store 的消息并渲染 Radix Toast 通知。
 * 使用 registerToastHandler 注册 UI 更新函数。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { registerToastHandler, type ToastMessage } from "@/store/toast";

const TOAST_DURATION = 4000;

const TYPE_STYLES: Record<ToastMessage["type"], string> = {
  success: "border-green-200 bg-green-50 text-green-900",
  error: "border-red-200 bg-red-50 text-red-900",
  info: "border-blue-200 bg-blue-50 text-blue-900",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  // 避免 stale closure
  const setToastsRef = useRef(setToasts);
  setToastsRef.current = setToasts;

  const addToast = useCallback((msg: ToastMessage) => {
    setToastsRef.current((prev) => [...prev, msg]);
    // 4 秒后自动移除
    setTimeout(() => {
      setToastsRef.current((prev) => prev.filter((t) => t.id !== msg.id));
    }, TOAST_DURATION + 500);
  }, []);

  useEffect(() => {
    registerToastHandler(addToast);
  }, [addToast]);

  const dismiss = (id: string) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastPrimitive.Provider duration={TOAST_DURATION}>
      {children}
      {toasts.map((t) => (
        <ToastPrimitive.Root
          key={t.id}
          open
          onOpenChange={(open) => !open && dismiss(t.id)}
          className={cn(
            "flex items-center justify-between gap-3 rounded-lg border px-4 py-3 shadow-md",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[swipe=end]:animate-out data-[state=closed]:fade-out-80",
            "data-[state=open]:slide-in-from-top-full",
            "data-[state=closed]:slide-out-to-right-full",
            TYPE_STYLES[t.type],
          )}
        >
          <ToastPrimitive.Description className="text-sm font-medium">
            {t.message}
          </ToastPrimitive.Description>
          <ToastPrimitive.Close
            className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
            onClick={() => dismiss(t.id)}
          >
            <X className="h-4 w-4" />
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport className="fixed top-4 right-4 z-[100] flex max-w-[400px] flex-col gap-2" />
    </ToastPrimitive.Provider>
  );
}
