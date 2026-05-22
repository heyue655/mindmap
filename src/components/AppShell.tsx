"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  GitBranch,
  Inbox,
  Bell,
  Settings,
  Users as UsersIcon,
  LogOut,
  FileBarChart2,
  UserCog,
  FolderTree,
} from "lucide-react";
import { useStore } from "@/store/StoreProvider";
import { getApiToken, setApiToken, useRemoteWorkspaceApi } from "@/lib/api/workspaceApi";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isManager } from "@/lib/org";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  managerOnly?: boolean;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { to: "/mindmap", label: "我的导图", icon: GitBranch },
  { to: "/team", label: "团队视图", icon: UsersIcon, managerOnly: true },
  { to: "/inbox", label: "待我处理", icon: Inbox },
  { to: "/reports", label: "工作汇报", icon: FileBarChart2 },
  { to: "/notifications", label: "通知中心", icon: Bell },
  { to: "/settings", label: "个人设置", icon: Settings },
  { to: "/admin/users", label: "用户管理", icon: UserCog, adminOnly: true },
  { to: "/admin/departments", label: "部门管理", icon: FolderTree, adminOnly: true },
];

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    currentUser,
    currentUserId,
    users,
    relations,
    notifications,
    assignments,
    follows,
    setCurrentUserId,
    workspaceHydrated,
  } = useStore();
  const useApi = useRemoteWorkspaceApi();

  // 未挂载前（SSR 阶段）不访问 localStorage / location，避免 ReferenceError
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // 重定向逻辑统一放在 useEffect，不在 render 里调用 router
  useEffect(() => {
    if (!mounted) return;
    if (useApi && !getApiToken()) {
      router.replace("/");
      return;
    }
    // workspace 尚未加载完成时，currentUser 可能是 null 的瞬态，不触发重定向
    if (useApi && !workspaceHydrated) return;
    if (!currentUserId || !currentUser) {
      router.replace("/");
      return;
    }
    // 首次登录需要重置密码，强制跳转（已在 /reset-password 则不再重定向）
    if (currentUser.mustResetPassword && pathname !== "/reset-password") {
      router.replace("/reset-password");
    }
  }, [mounted, useApi, workspaceHydrated, currentUserId, currentUser, pathname, router]);

  // ── 所有 hook 必须在任何条件 return 之前无条件调用 ──────────────
  // 兜底：合并 OrgRelation + User.managerId 两个来源，防止历史数据 OrgRelation 缺失
  const userIsManager =
    isManager(currentUserId ?? "", relations) ||
    users.some((u) => u.managerId === (currentUserId ?? ""));

  const pendingAssignments = useMemo(
    () => assignments.filter((a) => a.assigneeId === currentUserId && a.state === "pending").length,
    [assignments, currentUserId],
  );
  const negotiatingForMe = useMemo(
    () => assignments.filter((a) => a.assignerId === currentUserId && a.state === "negotiating").length,
    [assignments, currentUserId],
  );
  const pendingFollows = useMemo(
    () => follows.filter((f) => f.granteeId === currentUserId && f.state === "pending").length,
    [follows, currentUserId],
  );
  const inboxCount = pendingAssignments + negotiatingForMe + pendingFollows;

  const unreadCount = useMemo(
    () => notifications.filter((n) => n.recipientId === currentUserId && !n.readAt).length,
    [notifications, currentUserId],
  );

  const handleLogout = () => {
    if (useApi) setApiToken(null);
    setCurrentUserId(null);
    router.push("/");
  };
  // ────────────────────────────────────────────────────────────────

  // SSR / hydration 阶段：返回空占位，防止 location/localStorage 访问
  if (!mounted) {
    return <div className="min-h-screen bg-slate-50" />;
  }

  // token 不存在（重定向由 useEffect 处理，此处直接不渲染）
  if (useApi && !getApiToken()) {
    return null;
  }

  // workspace 未就绪（含登录后异步 state 提交前的瞬态），先展示加载页
  if (useApi && getApiToken() && !workspaceHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600 text-sm">
        正在从服务器加载工作区…
      </div>
    );
  }

  // 用户未找到（重定向由 useEffect 处理，此处直接不渲染）
  if (!currentUserId || !currentUser) {
    return null;
  }

  // 需要重置密码时，仅渲染全屏内容区，不渲染侧边栏
  if (currentUser.mustResetPassword) {
    return (
      <div className="h-screen overflow-hidden bg-slate-50 flex flex-col">
        <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-slate-50 flex">
      {/* 侧边栏 */}
      <aside className="w-60 bg-white border-r border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-orange flex items-center justify-center">
              <span className="text-white text-sm font-bold">M</span>
            </div>
            <span className="font-semibold text-brand-ink">导图任务</span>
          </div>
        </div>

        <nav className="flex-1 p-2 space-y-0.5">
          {navItems.map((item) => {
            if (item.managerOnly && !userIsManager) return null;
            // 管理员判断：使用 currentUser.isAdmin（数据库权限字段）
            if (item.adminOnly && !currentUser.isAdmin) return null;

            const showInboxBadge = item.to === "/inbox" && inboxCount > 0;
            const showNotifBadge = item.to === "/notifications" && unreadCount > 0;
            return (
              <Link
                key={item.to}
                href={item.to}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm font-medium",
                  pathname === item.to
                    ? "bg-brand-ink text-white"
                    : "text-slate-700 hover:bg-slate-100",
                )}
              >
                <span className="flex items-center gap-2">
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </span>
                {showInboxBadge && (
                  <Badge variant="destructive" className="h-5 px-1.5">
                    {inboxCount}
                  </Badge>
                )}
                {showNotifBadge && (
                  <Badge variant="destructive" className="h-5 px-1.5">
                    {unreadCount}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-3 mb-2">
            <Avatar size="sm">{currentUser.avatar}</Avatar>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-brand-ink truncate">
                {currentUser.name}
              </div>
              <div className="text-[11px] text-muted-foreground truncate">
                {currentUser.jobTitle}
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={handleLogout}
          >
            <LogOut className="h-3.5 w-3.5" />
            切换身份
          </Button>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
