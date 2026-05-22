"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/store/StoreProvider";
import { getApiToken } from "@/lib/api/workspaceApi";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/store/toast";
import { KeyRound } from "lucide-react";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { refreshWorkspace, currentUser } = useStore();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 6) {
      toast.error("新密码长度不能少于 6 位");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("两次输入的密码不一致");
      return;
    }
    if (currentUser && newPassword === currentUser.employeeNo) {
      toast.error("新密码不能与工号相同");
      return;
    }

    setLoading(true);
    try {
      const token = getApiToken();
      const r = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newPassword }),
      });
      const data = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok) throw new Error(data.error ?? "重置密码失败");

      toast.success("密码已重置，正在跳转…");
      // 刷新工作区，使 currentUser.mustResetPassword 变为 false
      await refreshWorkspace();
      router.replace("/mindmap");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "重置密码失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-brand-orange flex items-center justify-center shadow">
            <KeyRound className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-brand-ink">设置新密码</h1>
          <p className="text-sm text-slate-500 mt-1">
            您当前使用的是初始密码，请立即设置新密码后继续使用。
          </p>
        </div>

        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="newPassword">新密码</Label>
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder="至少 6 位"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">确认新密码</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder="再次输入新密码"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  disabled={loading}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "保存中…" : "确认设置"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
