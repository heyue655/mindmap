"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
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
import { UserPlus, Pencil, Ban, CheckCircle2, RefreshCw, Search, ChevronLeft, ChevronRight, X, GitMerge, AlertTriangle } from "lucide-react";
import type { DingtalkUserCandidate } from "@/lib/dingtalk";

interface AdminUser {
  id: string;
  employeeNo: string;
  name: string;
  email: string;
  avatar?: string;
  departmentId: string;
  jobTitle: string;
  status: string;
  isAdmin: boolean;
  managerId?: string;
  managerName?: string;
  managerJobTitle?: string;
  managerSource?: string;
  pendingManagerId?: string;
  pendingManagerName?: string;
  dingtalkUserId?: string;
}

interface Dept {
  id: string;
  name: string;
  parentId?: string;
}

function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getApiToken()}` };
}

/** 渲染用户头像 */
function UserAvatar({ avatar, name, className }: { avatar?: string; name: string; className?: string }) {
  if (!avatar) return null;
  if (avatar.startsWith("http")) {
    return (
      <img
        src={avatar}
        alt={name}
        className={className ?? "w-5 h-5 rounded-full inline-block mr-1 object-cover align-text-bottom"}
      />
    );
  }
  return <span className="mr-1">{avatar}</span>;
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
          {[10, 20, 50, 100].map((s) => (
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

/** 部门树选择器：点击触发弹层，可输入名字模糊搜索，按层级展示 */
function DeptPicker({
  depts,
  value,
  onChange,
}: {
  depts: Dept[];
  value: string;
  onChange: (id: string, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // 构建树形结构
  type DeptNode = Dept & { children: DeptNode[]; depth: number };

  const tree = useMemo(() => {
    function build(parentId: string | undefined, depth: number): DeptNode[] {
      return depts
        .filter(d => d.parentId === parentId)
        .map(d => ({ ...d, depth, children: build(d.id, depth + 1) }));
    }
    return build(undefined, 0);
  }, [depts]);

  // 默认折叠深度 >= 2 的节点
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const s = new Set<string>();
    function mark(nodes: DeptNode[]) {
      for (const n of nodes) {
        if (n.depth >= 2 && n.children.length > 0) s.add(n.id);
        mark(n.children);
      }
    }
    mark(tree);
    setCollapsed(s);
  }, [tree]);

  // 弹框关闭时重置搜索
  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  function toggleCollapse(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function flatten(nodes: DeptNode[]): DeptNode[] {
    const result: DeptNode[] = [];
    for (const n of nodes) {
      result.push(n);
      if (!collapsed.has(n.id)) result.push(...flatten(n.children));
    }
    return result;
  }

  const selectedDept = depts.find(d => d.id === value);
  const keyword = search.trim().toLowerCase();

  const searchResults = useMemo(() => {
    if (!keyword) return [];
    const matched = depts.filter(d => d.name.toLowerCase().includes(keyword));
    const ids = new Set<string>();
    function addAncestors(id: string) {
      ids.add(id);
      const d = depts.find(x => x.id === id);
      if (d?.parentId) addAncestors(d.parentId);
    }
    matched.forEach(d => addAncestors(d.id));
    function buildFull(parentId: string | undefined, depth: number): DeptNode[] {
      return depts.filter(d => d.parentId === parentId)
        .map(d => ({ ...d, depth, children: buildFull(d.id, depth + 1) }));
    }
    function collectVisible(nodes: DeptNode[]): (DeptNode & { isMatch: boolean })[] {
      const res: (DeptNode & { isMatch: boolean })[] = [];
      for (const n of nodes) {
        if (ids.has(n.id)) {
          res.push({ ...n, isMatch: matched.some(m => m.id === n.id) });
          res.push(...collectVisible(n.children));
        }
      }
      return res;
    }
    return collectVisible(buildFull(undefined, 0));
  }, [keyword, depts]);

  const treeList = useMemo(() => flatten(tree), [tree, collapsed]);

  function handleSelect(d: Dept) {
    onChange(d.id, d.name);
    setOpen(false);
  }

  type DisplayItem = DeptNode & { isMatch?: boolean };
  const displayList: DisplayItem[] = keyword ? searchResults : treeList;

  return (
    <>
      {/* 触发按钮 */}
      <button
        type="button"
        className="w-full flex items-center justify-between border border-input rounded-md px-3 py-2 text-sm bg-background hover:bg-slate-50 text-left"
        onClick={() => setOpen(true)}
      >
        <span className={`truncate ${selectedDept ? "text-brand-ink font-medium" : "text-muted-foreground"}`}>
          {selectedDept ? selectedDept.name : "请选择部门"}
        </span>
        <svg className="h-4 w-4 text-slate-400 shrink-0 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 居中弹框 */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[420px] max-w-[95vw] flex flex-col gap-0 p-0 overflow-hidden" style={{ maxHeight: "70vh" }}>
          <DialogHeader className="px-4 pt-4 pb-3 border-b border-slate-100 shrink-0">
            <DialogTitle className="text-base">选择部门</DialogTitle>
          </DialogHeader>

          {/* 搜索框 */}
          <div className="px-3 py-2.5 border-b border-slate-100 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <input
                autoFocus
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-input rounded-md bg-background outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
                placeholder="输入部门名称搜索…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* 树形 / 搜索列表 */}
          <div className="overflow-y-auto flex-1 py-1">
            {displayList.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-slate-400">未找到匹配的部门</div>
            ) : (
              displayList.map(d => {
                const hasChildren = d.children.length > 0;
                const isCollapsed = collapsed.has(d.id);
                const isSelected = d.id === value;
                const isMatch = !!d.isMatch;
                const indent = d.depth * 16;
                return (
                  <div
                    key={d.id}
                    className={`flex items-center text-sm hover:bg-slate-50 cursor-pointer
                      ${isSelected ? "bg-brand-orange/5" : ""}
                      ${keyword && isMatch ? "bg-amber-50/60" : ""}`}
                    style={{ paddingLeft: 8 + indent }}
                    onClick={() => handleSelect(d)}
                  >
                    <span
                      className={`shrink-0 flex items-center justify-center w-5 h-5 mr-0.5 rounded
                        ${hasChildren && !keyword ? "hover:bg-slate-200 text-slate-400" : "text-transparent pointer-events-none"}`}
                      onClick={hasChildren && !keyword ? e => toggleCollapse(d.id, e) : undefined}
                    >
                      {hasChildren && !keyword && (
                        <svg className={`h-3 w-3 transition-transform ${isCollapsed ? "" : "rotate-90"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </span>
                    <span className={`py-2.5 pr-3 flex-1 min-w-0 whitespace-normal break-words leading-snug
                      ${isSelected ? "text-brand-ink font-medium" : "text-slate-700"}
                      ${keyword && isMatch ? "font-medium text-brand-ink" : ""}
                      ${keyword && !isMatch ? "text-slate-400" : ""}`}
                    >
                      {d.name}
                    </span>
                    {isSelected && (
                      <svg className="mr-3 h-3.5 w-3.5 text-brand-orange shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** 直接上级搜索选择器：输入名字模糊搜索，回车或点击选中，禁止预加载全量数据 */
function ManagerPicker({
  value,
  displayName,
  displayJobTitle,
  excludeId,
  onChange,
}: {
  value: string;
  displayName?: string;
  displayJobTitle?: string;
  excludeId?: string;
  onChange: (id: string, name: string, jobTitle: string) => void;
}) {
  const [inputVal, setInputVal] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; employeeNo: string; jobTitle: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function doSearch(q: string) {
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    setLoading(true);
    fetch(
      `/api/admin/users?keyword=${encodeURIComponent(q.trim())}&status=active&pageSize=10`,
      { headers: { "Content-Type": "application/json", Authorization: `Bearer ${getApiToken()}` } },
    )
      .then(r => r.json() as Promise<{ users?: AdminUser[] }>)
      .then(d => {
        const list = (d.users ?? [])
          .filter(u => u.id !== excludeId)
          .map(u => ({ id: u.id, name: u.name, employeeNo: u.employeeNo, jobTitle: u.jobTitle }));
        setResults(list);
        setActiveIdx(0);
        setOpen(list.length > 0);
      })
      .catch(() => { /* 静默 */ })
      .finally(() => setLoading(false));
  }

  function handleInputChange(v: string) {
    setInputVal(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(v), 300);
  }

  function selectUser(u: { id: string; name: string; jobTitle: string }) {
    onChange(u.id, u.name, u.jobTitle);
    setInputVal("");
    setResults([]);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (results[activeIdx]) selectUser(results[activeIdx]); }
    else if (e.key === "Escape") { setOpen(false); }
  }

  // 已选中状态
  if (value && !inputVal) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 border border-input rounded-md bg-background text-sm">
        <span className="flex-1 min-w-0">
          <span className="font-medium text-brand-ink">{displayName ?? value}</span>
          {displayJobTitle && displayJobTitle !== "待设置" && <span className="text-xs text-slate-500 ml-1">· {displayJobTitle}</span>}
        </span>
        <button
          type="button"
          className="text-slate-400 hover:text-destructive shrink-0"
          onClick={() => onChange("", "", "")}
          title="清除"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-8 text-sm"
          placeholder="输入姓名搜索上级…"
          value={inputVal}
          onChange={e => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
        />
        {loading && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">搜索中…</span>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-white shadow-md overflow-hidden">
          {results.map((u, idx) => (
            <button
              key={u.id}
              type="button"
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 ${idx === activeIdx ? "bg-slate-50" : ""}`}
              onMouseEnter={() => setActiveIdx(idx)}
              onClick={() => selectUser(u)}
            >
              <span className="flex-1 min-w-0">
                <span className="font-medium text-brand-ink">{u.name}</span>
                <span className="text-xs text-slate-500 ml-1">（{u.employeeNo}）</span>
              </span>
              <span className="text-xs text-slate-400 truncate max-w-[100px]">{u.jobTitle}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminUsersPage() {
  const router = useRouter();
  const { currentUser, refreshWorkspace } = useStore();

  // ── 表格数据（服务端分页） ────────────────────────────────────
  const [tableUsers, setTableUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDeptId, setFilterDeptId] = useState("");
  const [tableLoading, setTableLoading] = useState(true);

  // 关键词输入（防抖用）
  const [keywordInput, setKeywordInput] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 下拉框数据（仅部门） ──────────────────────────────────────
  const [depts, setDepts] = useState<Dept[]>([]);
  const [dropdownLoading, setDropdownLoading] = useState(true);

  // 新建/编辑对话框
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null);
  const [form, setForm] = useState({
    employeeNo: "", name: "", email: "", avatar: "",
    departmentId: "", jobTitle: "", managerId: "", managerName: "", managerJobTitle: "", dingtalkUserId: "",
    isAdmin: false,
  });
  const [saving, setSaving] = useState(false);

  // 钉钉搜索状态
  const [dtSearching, setDtSearching] = useState(false);
  const [dtCandidates, setDtCandidates] = useState<DingtalkUserCandidate[]>([]);
  const [dtSelected, setDtSelected] = useState<DingtalkUserCandidate | null>(null);

  // 禁用确认
  const [disableTarget, setDisableTarget] = useState<AdminUser | null>(null);

  // 同步用户状态
  const [syncingUsers, setSyncingUsers] = useState(false);
  const [syncUsersConfirm, setSyncUsersConfirm] = useState(false);

  // 同步上级关系状态
  const [syncingManagers, setSyncingManagers] = useState(false);
  const [syncManagersConfirm, setSyncManagersConfirm] = useState(false);

  // 上级冲突状态
  const [conflictUsers, setConflictUsers] = useState<AdminUser[]>([]);
  const [conflictCount, setConflictCount] = useState(0);
  const [showConflicts, setShowConflicts] = useState(false);
  const [conflictLoading, setConflictLoading] = useState(false);
  // 每个冲突用户的解决动作：accept=接受钉钉建议, keep=保持手动设置
  const [conflictActions, setConflictActions] = useState<Record<string, "accept" | "keep">>({});
  const [resolvingConflicts, setResolvingConflicts] = useState(false);

  // ── 权限检查 ─────────────────────────────────────────────────
  useEffect(() => {
    if (currentUser && !currentUser.isAdmin) {
      router.replace("/mindmap");
    }
  }, [currentUser, router]);

  // ── 加载部门下拉数据（仅一次） ───────────────────────────────
  const fetchDropdownData = useCallback(async () => {
    setDropdownLoading(true);
    try {
      const dRes = await fetch("/api/admin/departments", { headers: authHeaders() });
      const dJson = await dRes.json() as { departments?: Dept[]; error?: string };
      if (!dRes.ok) throw new Error(dJson.error ?? "加载部门失败");
      setDepts(dJson.departments ?? []);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDropdownLoading(false);
    }
  }, []);

  // ── 加载表格数据（分页） ─────────────────────────────────────
  const fetchTableData = useCallback(async (
    p: number,
    ps: number,
    kw: string,
    status: string,
    deptId: string,
  ) => {
    setTableLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(p));
      params.set("pageSize", String(ps));
      if (kw) params.set("keyword", kw);
      if (status) params.set("status", status);
      if (deptId) params.set("deptId", deptId);

      const r = await fetch(`/api/admin/users?${params.toString()}`, { headers: authHeaders() });
      const d = await r.json() as { users?: AdminUser[]; total?: number; error?: string };
      if (!r.ok) throw new Error(d.error ?? "加载失败");
      setTableUsers(d.users ?? []);
      setTotal(d.total ?? 0);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTableLoading(false);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    void fetchDropdownData();
    void fetchConflictCount();
  }, [fetchDropdownData]);

  useEffect(() => {
    void fetchTableData(page, pageSize, keyword, filterStatus, filterDeptId);
  }, [fetchTableData, page, pageSize, keyword, filterStatus, filterDeptId]);

  // 关键词防抖（500ms）
  function handleKeywordChange(v: string) {
    setKeywordInput(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setKeyword(v);
      setPage(1);
    }, 500);
  }

  // 过滤器变化时重置页码
  function handleFilterStatus(v: string) {
    setFilterStatus(v);
    setPage(1);
  }
  function handleFilterDept(v: string) {
    setFilterDeptId(v);
    setPage(1);
  }
  function handlePageSizeChange(s: number) {
    setPageSize(s);
    setPage(1);
  }

  function resetDtSearch() {
    setDtSearching(false);
    setDtCandidates([]);
    setDtSelected(null);
  }

  function openCreate() {
    setEditTarget(null);
    setForm({
      employeeNo: "", name: "", email: "", avatar: "",
      departmentId: depts[0]?.id ?? "", jobTitle: "",
      managerId: "", managerName: "", managerJobTitle: "", dingtalkUserId: "",
      isAdmin: false,
    });
    resetDtSearch();
    setShowForm(true);
  }

  function openEdit(u: AdminUser) {
    setEditTarget(u);
    setForm({
      employeeNo: u.employeeNo, name: u.name, email: u.email, avatar: u.avatar ?? "",
      departmentId: u.departmentId, jobTitle: u.jobTitle,
      managerId: u.managerId ?? "", managerName: u.managerName ?? "", managerJobTitle: u.managerJobTitle ?? "",
      dingtalkUserId: u.dingtalkUserId ?? "",
      isAdmin: u.isAdmin,
    });
    setDtCandidates([]);
    setDtSelected(null);
    setShowForm(true);
  }

  async function doSearch(name: string): Promise<DingtalkUserCandidate[]> {
    const keyword = name.trim();
    if (!keyword) return [];
    setDtSearching(true);
    setDtCandidates([]);
    try {
      const r = await fetch(
        `/api/admin/dingtalk/search?name=${encodeURIComponent(keyword)}`,
        { headers: authHeaders() },
      );
      const d = await r.json() as { candidates?: DingtalkUserCandidate[]; error?: string };
      if (!r.ok) throw new Error(d.error ?? "搜索失败");
      const list = d.candidates ?? [];
      setDtCandidates(list);
      if (list.length === 0) toast.info("未找到该姓名的钉钉用户");
      return list;
    } catch (e) {
      toast.error((e as Error).message);
      return [];
    } finally {
      setDtSearching(false);
    }
  }

  /** 根据钉钉 managerUserId 查询 DB 中对应用户，回填直接上级表单字段 */
  async function resolveManagerFromDingtalk(managerDingUserId: string) {
    try {
      const r = await fetch(
        `/api/admin/users?dingtalkUserId=${encodeURIComponent(managerDingUserId)}&pageSize=1`,
        { headers: authHeaders() },
      );
      const d = await r.json() as { users?: AdminUser[] };
      const mgr = d.users?.[0];
      if (mgr) {
        setForm(f => ({
          ...f,
          managerId: mgr.id,
          managerName: mgr.name,
          managerJobTitle: mgr.jobTitle,
        }));
      }
    } catch {
      // 静默：上级解析失败不阻断流程
    }
  }

  async function handleNameBlur() {
    if (!showForm) return;
    const name = form.name.trim();
    if (!name) { setDtCandidates([]); setDtSelected(null); return; }
    const list = await doSearch(name);
    if (list.length > 0) {
      const first = list[0];
      setDtSelected(first);
      setForm(f => ({
        ...f,
        name: first.name,
        email: first.email || f.email,
        avatar: first.avatar || f.avatar,
        dingtalkUserId: first.userid,
        ...(editTarget === null && first.jobNumber ? { employeeNo: first.jobNumber } : {}),
      }));
      // 自动回填直接上级
      if (first.managerUserId && !form.managerId) {
        void resolveManagerFromDingtalk(first.managerUserId);
      }
    }
  }

  function selectDtCandidate(c: DingtalkUserCandidate) {
    setDtSelected(c);
    setForm(f => ({
      ...f,
      name: c.name,
      dingtalkUserId: c.userid,
      email: c.email || f.email,
      avatar: c.avatar || f.avatar,
      ...(editTarget === null && c.jobNumber ? { employeeNo: c.jobNumber } : {}),
    }));
    // 若候选人有上级钉钉 ID，且当前尚未手动设置上级，则自动回填
    if (c.managerUserId && !form.managerId) {
      void resolveManagerFromDingtalk(c.managerUserId);
    }
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error("姓名不能为空"); return; }
    if (!form.departmentId) { toast.error("请选择部门"); return; }
    if (!form.jobTitle.trim()) { toast.error("职位不能为空"); return; }
    if (!editTarget && !form.employeeNo.trim()) { toast.error("工号不能为空"); return; }

    setSaving(true);
    try {
      if (editTarget) {
        const r = await fetch(`/api/admin/users/${editTarget.id}`, {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify({
            name: form.name,
            email: form.email,
            avatar: form.avatar,
            departmentId: form.departmentId,
            jobTitle: form.jobTitle,
            managerId: form.managerId || null,
            dingtalkUserId: form.dingtalkUserId.trim() || null,
            isAdmin: form.isAdmin,
          }),
        });
        const d = await r.json() as { user?: AdminUser; error?: string };
        if (!r.ok) throw new Error(d.error ?? "更新失败");
        toast.success("用户信息已更新");
        void refreshWorkspace();
        // 刷新当前页
        void fetchTableData(page, pageSize, keyword, filterStatus, filterDeptId);
        void fetchDropdownData();
      } else {
        const r = await fetch("/api/admin/users", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            employeeNo: form.employeeNo,
            name: form.name,
            email: form.email,
            avatar: form.avatar,
            departmentId: form.departmentId,
            jobTitle: form.jobTitle,
            managerId: form.managerId || undefined,
            dingtalkUserId: form.dingtalkUserId.trim() || undefined,
          }),
        });
        const d = await r.json() as { user?: AdminUser; error?: string };
        if (!r.ok) throw new Error(d.error ?? "创建失败");
        toast.success(`用户 ${form.name} 创建成功，初始密码为工号，首次登录须修改密码`);
        if (form.managerId) void refreshWorkspace();
        void fetchTableData(page, pageSize, keyword, filterStatus, filterDeptId);
        void fetchDropdownData();
      }
      setShowForm(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDisable() {
    if (!disableTarget) return;
    try {
      const r = await fetch(`/api/admin/users/${disableTarget.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const d = await r.json() as { ok?: boolean; error?: string };
      if (!r.ok) throw new Error(d.error ?? "操作失败");
      toast.success(`用户 ${disableTarget.name} 已禁用`);
      void fetchTableData(page, pageSize, keyword, filterStatus, filterDeptId);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDisableTarget(null);
    }
  }

  async function handleEnable(u: AdminUser) {
    try {
      const r = await fetch(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ status: "active" }),
      });
      const d = await r.json() as { user?: AdminUser; error?: string };
      if (!r.ok) throw new Error(d.error ?? "操作失败");
      toast.success(`用户 ${u.name} 已启用`);
      void fetchTableData(page, pageSize, keyword, filterStatus, filterDeptId);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleSyncManagers() {
    setSyncingManagers(true);
    try {
      const r = await fetch("/api/admin/dingtalk/sync-manager-relations", {
        method: "POST",
        headers: authHeaders(),
      });
      const d = await r.json() as {
        processed?: number; updated?: number; conflicts?: number; skipped?: number; error?: string;
      };
      if (!r.ok) throw new Error(d.error ?? "同步失败");
      toast.success(
        `上级关系同步完成：处理 ${d.processed} 人，更新 ${d.updated}，冲突 ${d.conflicts}，跳过 ${d.skipped}`,
      );
      // 刷新冲突数
      void fetchConflictCount();
      void fetchTableData(page, pageSize, keyword, filterStatus, filterDeptId);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSyncingManagers(false);
      setSyncManagersConfirm(false);
    }
  }

  async function fetchConflictCount() {
    try {
      const r = await fetch("/api/admin/users?hasPendingManager=true&pageSize=1", { headers: authHeaders() });
      const d = await r.json() as { total?: number };
      setConflictCount(d.total ?? 0);
    } catch {
      // 静默
    }
  }

  async function openConflictDialog() {
    setShowConflicts(true);
    setConflictLoading(true);
    setConflictActions({});
    try {
      const r = await fetch("/api/admin/users?hasPendingManager=true&pageSize=100", { headers: authHeaders() });
      const d = await r.json() as { users?: AdminUser[]; total?: number; error?: string };
      if (!r.ok) throw new Error(d.error ?? "加载失败");
      setConflictUsers(d.users ?? []);
      setConflictCount(d.total ?? 0);
      // 默认全部 accept
      const defaults: Record<string, "accept" | "keep"> = {};
      (d.users ?? []).forEach(u => { defaults[u.id] = "accept"; });
      setConflictActions(defaults);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setConflictLoading(false);
    }
  }

  async function handleResolveConflicts() {
    setResolvingConflicts(true);
    try {
      const actions = Object.entries(conflictActions).map(([userId, action]) => ({ userId, action }));
      const r = await fetch("/api/admin/dingtalk/resolve-manager-conflicts", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ actions }),
      });
      const d = await r.json() as { resolved?: number; error?: string };
      if (!r.ok) throw new Error(d.error ?? "处理失败");
      toast.success(`已处理 ${d.resolved} 条上级关系冲突`);
      setShowConflicts(false);
      setConflictUsers([]);
      setConflictCount(0);
      void fetchTableData(page, pageSize, keyword, filterStatus, filterDeptId);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setResolvingConflicts(false);
    }
  }

  function deptName(id: string) {
    return depts.find(d => d.id === id)?.name ?? id;
  }

  async function handleSyncUsers() {
    setSyncingUsers(true);
    try {
      const r = await fetch("/api/admin/dingtalk/sync-users", {
        method: "POST",
        headers: authHeaders(),
      });
      const d = await r.json() as {
        ok?: boolean; total?: number; created?: number;
        updated?: number; disabled?: number; error?: string;
      };
      if (!r.ok) throw new Error(d.error ?? "同步失败");
      toast.success(
        `同步完成：共 ${d.total} 人，新增 ${d.created}，更新 ${d.updated}，禁用 ${d.disabled}`,
      );
      void fetchTableData(page, pageSize, keyword, filterStatus, filterDeptId);
      void fetchDropdownData();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSyncingUsers(false);
      setSyncUsersConfirm(false);
    }
  }

  return (
    <>
      <PageHeader
        title="用户管理"
        description="管理系统用户账号，新建用户初始密码为工号"
        right={
          <div className="flex items-center gap-2">
            {conflictCount > 0 && (
              <Button variant="outline" size="sm" onClick={() => void openConflictDialog()} className="relative text-amber-700 border-amber-300 hover:bg-amber-50">
                <AlertTriangle className="h-4 w-4 mr-1 text-amber-500" />
                上级冲突
                <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold h-4 min-w-[16px] px-1">
                  {conflictCount}
                </span>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setSyncManagersConfirm(true)} disabled={syncingManagers}>
              <GitMerge className={`h-4 w-4 mr-1 ${syncingManagers ? "animate-spin" : ""}`} />
              同步上级关系
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSyncUsersConfirm(true)} disabled={syncingUsers}>
              <RefreshCw className={`h-4 w-4 mr-1 ${syncingUsers ? "animate-spin" : ""}`} />
              同步钉钉人员
            </Button>
            <Button onClick={openCreate} size="sm" disabled={dropdownLoading}>
              <UserPlus className="h-4 w-4 mr-1" />
              新建用户
            </Button>
          </div>
        }
      />

      <div className="flex-1 p-6 overflow-hidden flex flex-col gap-4">
        {/* 搜索 & 过滤栏 */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-sm"
              placeholder="搜索姓名、工号、职位…"
              value={keywordInput}
              onChange={(e) => handleKeywordChange(e.target.value)}
            />
          </div>
          <select
            className="border border-input rounded-md px-3 py-1.5 text-sm bg-background h-8"
            value={filterStatus}
            onChange={(e) => handleFilterStatus(e.target.value)}
          >
            <option value="">全部状态</option>
            <option value="active">正常</option>
            <option value="disabled">已禁用</option>
          </select>
          <select
            className="border border-input rounded-md px-3 py-1.5 text-sm bg-background h-8"
            value={filterDeptId}
            onChange={(e) => handleFilterDept(e.target.value)}
          >
            <option value="">全部部门</option>
            {depts.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        {/* 表格 */}
        <div className="flex-1 bg-white rounded-lg border border-border overflow-y-auto overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-border sticky top-0 z-10">
              <tr>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">工号</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">姓名</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">部门</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">职位</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">状态</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">角色</th>
                <th className="text-right px-4 py-3 text-muted-foreground font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tableLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">加载中…</td>
                </tr>
              ) : tableUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    {keyword || filterStatus || filterDeptId ? "未找到匹配的用户" : "暂无用户，请点击右上角新建"}
                  </td>
                </tr>
              ) : (
                tableUsers.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{u.employeeNo}</td>
                    <td className="px-4 py-3 font-medium text-brand-ink">
                      <UserAvatar avatar={u.avatar} name={u.name} />
                      {u.name}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{deptName(u.departmentId)}</td>
                    <td className="px-4 py-3 text-slate-600">{u.jobTitle}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${u.status === "active" ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                        {u.status === "active" ? "正常" : "已禁用"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {u.isAdmin && (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700">管理员</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(u)} title="编辑">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {u.status === "active" ? (
                          <Button variant="ghost" size="sm" onClick={() => setDisableTarget(u)} title="禁用" disabled={u.id === currentUser?.id}>
                            <Ban className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => handleEnable(u)} title="启用">
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <PaginationBar
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={handlePageSizeChange}
          />
        </div>
      </div>

      {/* 新建/编辑对话框 */}
      <Dialog open={showForm} onOpenChange={(open) => { setShowForm(open); if (!open) resetDtSearch(); }}>
        <DialogContent className="w-[780px] max-w-[95vw] min-h-[600px] max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? "编辑用户" : "新建用户"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">

            {/* 姓名 */}
            <div className="space-y-1.5">
              <Label>姓名 <span className="text-destructive">*</span></Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                onBlur={() => void handleNameBlur()}
                placeholder="真实姓名"
                autoFocus
              />
            </div>

            {/* 钉钉候选人卡片 */}
            {dtSearching && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="animate-spin inline-block w-3 h-3 border border-current border-t-transparent rounded-full" />
                正在搜索钉钉账号…
              </div>
            )}
            {!dtSearching && dtCandidates.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">找到 {dtCandidates.length} 个匹配账号，请确认选择：</p>
                <div className="flex flex-wrap gap-2">
                  {dtCandidates.map(c => (
                    <button
                      key={c.userid}
                      type="button"
                      onClick={() => selectDtCandidate(c)}
                      className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 w-[72px] cursor-pointer transition-all ${
                        dtSelected?.userid === c.userid
                          ? "border-blue-500 bg-blue-50 shadow-sm"
                          : "border-border bg-white hover:border-slate-400 hover:bg-slate-50"
                      }`}
                    >
                      {c.avatar ? (
                        <img src={c.avatar} alt={c.name} className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 text-sm font-medium">
                          {c.name.slice(-1)}
                        </div>
                      )}
                      <span className="text-xs font-medium w-full text-center truncate leading-tight">{c.name}</span>
                      <span className="text-[10px] text-muted-foreground font-mono w-full text-center truncate leading-tight">{c.jobNumber || "—"}</span>
                    </button>
                  ))}
                </div>
                {dtSelected && (
                  <p className="text-xs text-green-700 bg-green-50 rounded px-2 py-1.5 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    已选择：{dtSelected.name}（工号 {dtSelected.jobNumber}）
                  </p>
                )}
              </div>
            )}
            {!dtSearching && dtCandidates.length === 0 && editTarget && form.dingtalkUserId && (
              <p className="text-xs text-muted-foreground bg-slate-50 rounded px-2 py-1.5 border border-border">
                当前已绑定：<span className="font-mono">{form.dingtalkUserId}</span>
              </p>
            )}

            {/* 工号 + 邮箱 */}
            {!editTarget && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>工号 <span className="text-destructive">*</span></Label>
                  <Input
                    value={form.employeeNo}
                    onChange={e => setForm(f => ({ ...f, employeeNo: e.target.value }))}
                    placeholder="工号"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>邮箱</Label>
                  <Input
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="邮箱（可留空）"
                    type="email"
                  />
                </div>
              </div>
            )}
            {editTarget && (
              <div className="space-y-1.5">
                <Label>邮箱</Label>
                <Input
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="邮箱"
                  type="email"
                />
              </div>
            )}

            {/* 部门 + 职位 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>部门 <span className="text-destructive">*</span></Label>
                <DeptPicker
                  depts={depts}
                  value={form.departmentId}
                  onChange={(id) => setForm(f => ({ ...f, departmentId: id }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>职位 <span className="text-destructive">*</span></Label>
                <Input
                  value={form.jobTitle}
                  onChange={e => setForm(f => ({ ...f, jobTitle: e.target.value }))}
                  placeholder="如 产品经理"
                />
              </div>
            </div>

            {/* 直接上级 */}
            <div className="space-y-1.5">
              <Label>直接上级</Label>
              <ManagerPicker
                value={form.managerId}
                displayName={form.managerName}
                displayJobTitle={form.managerJobTitle}
                excludeId={editTarget?.id}
                onChange={(id, name, jobTitle) =>
                  setForm(f => ({ ...f, managerId: id, managerName: name, managerJobTitle: jobTitle }))
                }
              />
            </div>

            {/* 管理员权限（仅编辑模式） */}
            {editTarget && (
              <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">管理员权限</Label>
                  <p className="text-xs text-muted-foreground">
                    {editTarget.id === currentUser?.id
                      ? "不能修改自己的管理员权限"
                      : "开启后该用户可访问用户管理和部门管理"}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.isAdmin}
                  disabled={editTarget.id === currentUser?.id}
                  onClick={() => setForm(f => ({ ...f, isAdmin: !f.isAdmin }))}
                  className={[
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    form.isAdmin ? "bg-primary" : "bg-input",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform",
                      form.isAdmin ? "translate-x-5" : "translate-x-0",
                    ].join(" ")}
                  />
                </button>
              </div>
            )}

            {/* 新建提示 */}
            {!editTarget && (
              <p className="text-xs text-muted-foreground bg-slate-50 rounded p-2">
                新建用户初始密码为 <span className="font-mono font-semibold">工号</span>，请告知用户登录后及时修改。
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>取消</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "保存中…" : "保存"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 禁用确认对话框 */}
      <ConfirmDialog
        open={!!disableTarget}
        title="禁用用户"
        description={`确定要禁用用户「${disableTarget?.name}」吗？禁用后该用户将无法登录。`}
        confirmLabel="禁用"
        destructive
        onConfirm={handleDisable}
        onCancel={() => setDisableTarget(null)}
      />

      {/* 同步钉钉人员确认对话框 */}
      <ConfirmDialog
        open={syncUsersConfirm}
        title="同步钉钉人员"
        description="将从钉钉拉取全量用户并同步到数据库。已有绑定关系的用户会更新信息，新人员自动创建账号（密码=工号，首登需修改）。不在钉钉中的已绑定用户将被自动禁用（管理员除外）。确认继续？"
        confirmLabel={syncingUsers ? "同步中…" : "确认同步"}
        onConfirm={handleSyncUsers}
        onCancel={() => setSyncUsersConfirm(false)}
      />

      {/* 同步上级关系确认对话框 */}
      <ConfirmDialog
        open={syncManagersConfirm}
        title="同步上级关系"
        description="将从钉钉逐一拉取用户的上级关系并同步。若与手动设置的上级不同，会记录为冲突待您确认，不会自动覆盖。此操作可能需要数分钟。确认继续？"
        confirmLabel={syncingManagers ? "同步中…" : "确认同步"}
        onConfirm={handleSyncManagers}
        onCancel={() => setSyncManagersConfirm(false)}
      />

      {/* 上级冲突处理对话框 */}
      <Dialog open={showConflicts} onOpenChange={setShowConflicts}>
        <DialogContent className="w-[860px] max-w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              上级关系冲突（共 {conflictCount} 条）
            </DialogTitle>
          </DialogHeader>

          {conflictLoading ? (
            <div className="py-10 text-center text-muted-foreground">加载中…</div>
          ) : conflictUsers.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">暂无冲突</div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-3">
                以下用户的手动设置上级与钉钉系统中的上级不一致，请逐一选择处理方式：
              </p>
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-border">
                    <tr>
                      <th className="text-left px-3 py-2.5 text-muted-foreground font-medium">员工</th>
                      <th className="text-left px-3 py-2.5 text-muted-foreground font-medium">当前上级（手动）</th>
                      <th className="text-left px-3 py-2.5 text-muted-foreground font-medium">钉钉建议上级</th>
                      <th className="text-center px-3 py-2.5 text-muted-foreground font-medium w-[180px]">处理方式</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {conflictUsers.map(u => (
                      <tr key={u.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-brand-ink">{u.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{u.employeeNo}</div>
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">
                          {u.managerName ?? <span className="text-slate-400">未设置</span>}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">
                          {u.pendingManagerName ?? <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-center gap-2">
                            <label className="flex items-center gap-1 cursor-pointer text-xs">
                              <input
                                type="radio"
                                name={`conflict-${u.id}`}
                                value="accept"
                                checked={conflictActions[u.id] === "accept"}
                                onChange={() => setConflictActions(a => ({ ...a, [u.id]: "accept" }))}
                                className="accent-brand-orange"
                              />
                              接受钉钉
                            </label>
                            <label className="flex items-center gap-1 cursor-pointer text-xs">
                              <input
                                type="radio"
                                name={`conflict-${u.id}`}
                                value="keep"
                                checked={conflictActions[u.id] === "keep"}
                                onChange={() => setConflictActions(a => ({ ...a, [u.id]: "keep" }))}
                                className="accent-brand-orange"
                              />
                              保持当前
                            </label>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* 全选按钮 */}
              <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                <button
                  type="button"
                  className="underline hover:text-brand-ink"
                  onClick={() => {
                    const all: Record<string, "accept" | "keep"> = {};
                    conflictUsers.forEach(u => { all[u.id] = "accept"; });
                    setConflictActions(all);
                  }}
                >
                  全部接受钉钉
                </button>
                <button
                  type="button"
                  className="underline hover:text-brand-ink"
                  onClick={() => {
                    const all: Record<string, "accept" | "keep"> = {};
                    conflictUsers.forEach(u => { all[u.id] = "keep"; });
                    setConflictActions(all);
                  }}
                >
                  全部保持当前
                </button>
              </div>
            </>
          )}

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowConflicts(false)} disabled={resolvingConflicts}>取消</Button>
            <Button
              onClick={() => void handleResolveConflicts()}
              disabled={resolvingConflicts || conflictUsers.length === 0}
            >
              {resolvingConflicts ? "处理中…" : "确认处理"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
