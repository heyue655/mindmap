"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { toast } from "@/store/toast";
import { getApiToken } from "@/lib/api/workspaceApi";
import { useStore } from "@/store/StoreProvider";
import { FolderPlus, Pencil, Trash2, RefreshCw, Search, ChevronLeft, ChevronRight } from "lucide-react";

interface Dept {
  id: string;
  name: string;
  parentId?: string;
}

function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getApiToken()}` };
}

/** 构造部门路径全名 */
function buildPath(id: string, depts: Dept[]): string {
  const dept = depts.find(d => d.id === id);
  if (!dept) return id;
  if (!dept.parentId) return dept.name;
  return `${buildPath(dept.parentId, depts)} / ${dept.name}`;
}

/** 分页栏 */
function PaginationBar({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        <span>共 {total} 条</span>
        <select
          className="border border-input rounded px-2 py-1 text-xs bg-background"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
        >
          {[10, 20, 50].map((s) => (
            <option key={s} value={s}>每页 {s} 条</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="px-2 text-xs">第 {page} / {totalPages} 页</span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default function AdminDepartmentsPage() {
  const router = useRouter();
  const { currentUser } = useStore();

  const [depts, setDepts] = useState<Dept[]>([]);
  const [loading, setLoading] = useState(true);

  // 搜索 & 分页（客户端）
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Dept | null>(null);
  const [form, setForm] = useState({ name: "", parentId: "" });
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Dept | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncConfirm, setSyncConfirm] = useState(false);

  useEffect(() => {
    if (currentUser && !currentUser.isAdmin) {
      router.replace("/mindmap");
    }
  }, [currentUser, router]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/departments", { headers: authHeaders() });
      const d = await r.json() as { departments?: Dept[]; error?: string };
      if (!r.ok) throw new Error(d.error ?? "加载失败");
      setDepts(d.departments ?? []);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  // 关键词过滤 + 分页
  const filtered = keyword.trim()
    ? depts.filter(d =>
        d.name.toLowerCase().includes(keyword.trim().toLowerCase()) ||
        buildPath(d.id, depts).toLowerCase().includes(keyword.trim().toLowerCase()),
      )
    : depts;
  const totalFiltered = filtered.length;
  const pagedDepts = filtered.slice((page - 1) * pageSize, page * pageSize);

  function handleKeywordChange(v: string) {
    setKeyword(v);
    setPage(1);
  }
  function handlePageSizeChange(s: number) {
    setPageSize(s);
    setPage(1);
  }

  function openCreate() {
    setEditTarget(null);
    setForm({ name: "", parentId: "" });
    setShowForm(true);
  }

  function openEdit(d: Dept) {
    setEditTarget(d);
    setForm({ name: d.name, parentId: d.parentId ?? "" });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error("部门名称不能为空"); return; }
    setSaving(true);
    try {
      const body = { name: form.name, parentId: form.parentId || undefined };
      if (editTarget) {
        const r = await fetch(`/api/admin/departments/${editTarget.id}`, {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify(body),
        });
        const d = await r.json() as { department?: Dept; error?: string };
        if (!r.ok) throw new Error(d.error ?? "更新失败");
        setDepts(prev => prev.map(dept => dept.id === editTarget.id ? (d.department ?? dept) : dept));
        toast.success("部门已更新");
      } else {
        const r = await fetch("/api/admin/departments", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify(body),
        });
        const d = await r.json() as { department?: Dept; error?: string };
        if (!r.ok) throw new Error(d.error ?? "创建失败");
        setDepts(prev => [...prev, d.department!]);
        toast.success(`部门「${form.name}」创建成功`);
      }
      setShowForm(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      const r = await fetch(`/api/admin/departments/${deleteTarget.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const d = await r.json() as { ok?: boolean; error?: string };
      if (!r.ok) throw new Error(d.error ?? "删除失败");
      setDepts(prev => prev.filter(dept => dept.id !== deleteTarget.id));
      toast.success(`部门「${deleteTarget.name}」已删除`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeleteTarget(null);
    }
  }

  async function handleSyncDepts() {
    setSyncing(true);
    try {
      const r = await fetch("/api/admin/dingtalk/sync-departments", {
        method: "POST",
        headers: authHeaders(),
      });
      const d = await r.json() as { ok?: boolean; total?: number; created?: number; updated?: number; error?: string };
      if (!r.ok) throw new Error(d.error ?? "同步失败");
      toast.success(`同步完成：共 ${d.total} 个部门，新增 ${d.created}，更新 ${d.updated}`);
      void fetchData();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSyncing(false);
      setSyncConfirm(false);
    }
  }

  return (
    <>
      <PageHeader
        title="部门管理"
        description="维护公司组织架构，部门下有用户时不可删除"
        right={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSyncConfirm(true)} disabled={syncing}>
              <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} />
              同步钉钉组织架构
            </Button>
            <Button onClick={openCreate} size="sm">
              <FolderPlus className="h-4 w-4 mr-1" />
              新建部门
            </Button>
          </div>
        }
      />

      <div className="flex-1 p-6 overflow-hidden flex flex-col gap-4">
        {/* 搜索栏 */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-sm"
              placeholder="搜索部门名称或路径…"
              value={keyword}
              onChange={(e) => handleKeywordChange(e.target.value)}
            />
          </div>
        </div>

        {/* 表格 */}
        {loading ? (
          <div className="text-sm text-muted-foreground">加载中…</div>
        ) : (
          <div className="flex-1 bg-white rounded-lg border border-border overflow-y-auto overflow-x-auto">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-border sticky top-0 z-10">
                <tr>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">部门名称</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">层级路径</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pagedDepts.map(d => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-brand-ink">{d.name}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{buildPath(d.id, depts)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(d)} title="编辑">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(d)} title="删除">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {pagedDepts.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">
                      {keyword ? "未找到匹配的部门" : "暂无部门，请点击右上角新建"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
            <PaginationBar
              page={page}
              pageSize={pageSize}
              total={totalFiltered}
              onPageChange={setPage}
              onPageSizeChange={handlePageSizeChange}
            />
          </div>
        )}
      </div>

      {/* 新建/编辑对话框 */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editTarget ? "编辑部门" : "新建部门"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>部门名称 <span className="text-destructive">*</span></Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="如 研发中心" />
            </div>
            <div className="space-y-1.5">
              <Label>父部门（可选）</Label>
              <select
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
                value={form.parentId}
                onChange={e => setForm(f => ({ ...f, parentId: e.target.value }))}
              >
                <option value="">无（顶级部门）</option>
                {depts
                  .filter(d => !editTarget || d.id !== editTarget.id)
                  .map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>取消</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "保存中…" : "保存"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="删除部门"
        description={`确定要删除部门「${deleteTarget?.name}」吗？部门下有用户或子部门时将拒绝删除。`}
        confirmLabel="删除"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* 同步钉钉组织架构确认 */}
      <ConfirmDialog
        open={syncConfirm}
        title="同步钉钉组织架构"
        description="将从钉钉拉取全量部门树并 upsert 到数据库。已有 dingDeptId 的部门会更新名称和层级，新部门会自动创建。此操作不删除手动创建的部门。确认继续？"
        confirmLabel={syncing ? "同步中…" : "确认同步"}
        onConfirm={handleSyncDepts}
        onCancel={() => setSyncConfirm(false)}
      />
    </>
  );
}
