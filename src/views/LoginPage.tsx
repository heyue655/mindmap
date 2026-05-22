"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/store/StoreProvider";
import { apiLogin, setApiToken } from "@/lib/api/workspaceApi";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/store/toast";

export default function LoginPage() {
  const router = useRouter();
  const { setCurrentUserId, refreshWorkspace, currentUser, workspaceHydrated } =
    useStore();

  const [employeeNo, setEmployeeNo] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  // 登录流程触发后设为 true；等 React 提交完所有 state 再跳转，避免竞态
  const [loginPending, setLoginPending] = useState(false);

  useEffect(() => {
    if (loginPending && workspaceHydrated && currentUser !== null) {
      setLoginPending(false);
      if (currentUser.mustResetPassword) {
        router.push("/reset-password");
      } else {
        router.push("/mindmap");
      }
    }
  }, [loginPending, workspaceHydrated, currentUser, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const eno = employeeNo.trim();
    if (!eno) {
      toast.error("请输入工号");
      return;
    }
    if (!password) {
      toast.error("请输入密码");
      return;
    }

    setLoading(true);
    try {
      const { token, user } = await apiLogin(eno, password);
      setApiToken(token);
      setCurrentUserId(String(user.id));
      await refreshWorkspace();
      // 不直接 push，改为标记 pending，让 useEffect 等 React state 全部提交后再跳转
      setLoginPending(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-ink via-brand-ink to-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-brand-orange flex items-center justify-center shadow-lg">
            <span className="text-white text-2xl font-bold">M</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">
            思维导图任务管理
          </h1>
          <p className="text-sm text-slate-400">请输入工号和密码登录</p>
        </div>

        {/* 登录表单 */}
        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="employeeNo"
                  className="block text-sm font-medium text-slate-700 mb-1"
                >
                  工号
                </label>
                <input
                  id="employeeNo"
                  type="text"
                  autoComplete="username"
                  placeholder="请输入工号"
                  value={employeeNo}
                  onChange={(e) => setEmployeeNo(e.target.value)}
                  disabled={loading}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-orange disabled:opacity-50"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-slate-700 mb-1"
                >
                  密码
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="请输入密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-orange disabled:opacity-50"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-md bg-brand-orange px-4 py-2 text-sm font-semibold text-white shadow hover:bg-brand-orange/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "登录中..." : "登录"}
              </button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
