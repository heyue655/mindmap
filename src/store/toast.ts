/**
 * 规范 3-1：全局 Toast 消息系统
 *
 * 使用方式：
 *   import { toast } from '@/store/toast';
 *   toast.success('操作成功');
 *   toast.error('操作失败');
 *   toast.info('提示信息');
 *
 * 在根 layout 中挂载 <ToastProvider /> 即可启用。
 */

export type ToastType = "success" | "error" | "info";

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}

/** 内部注册的 UI 处理函数（由 ToastProvider 挂载） */
let _handler: ((msg: ToastMessage) => void) | null = null;

/**
 * 由 ToastProvider 调用，注册实际的 UI 渲染函数
 */
export function registerToastHandler(handler: (msg: ToastMessage) => void): void {
  _handler = handler;
}

function show(message: string, type: ToastType): void {
  const id = Math.random().toString(36).slice(2);
  _handler?.({ id, message, type });
}

/**
 * 全局 Toast 对象，可在任意模块（包括非 React 环境）调用
 */
export const toast = {
  /** 操作成功提示（绿色） */
  success(message: string): void {
    show(message, "success");
  },
  /** 操作失败 / 错误提示（红色） */
  error(message: string): void {
    show(message, "error");
  },
  /** 中性提示信息（蓝色） */
  info(message: string): void {
    show(message, "info");
  },
};
