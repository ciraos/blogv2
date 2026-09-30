"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, Ban, KeyRound, Pencil, Plus, RotateCcw, Search, Trash2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/pagination-controls";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { createAdminUserApi } from "@/lib/api";
import { resolveAssetUrl, cn } from "@/lib/utils";
import { ACTION_TONE } from "@/lib/action-tones";
import type { AdminUser, AdminUserListData, UserGroup } from "@/types/users";

const PAGE_SIZE = 10;

/**
 * 列表行栅格（桌面端）：用户信息 / 用户组 / 状态 / 最后登录 / 创建时间 / 操作
 * 主列用 minmax(0,1fr) 承载「昵称 + @用户名 · 邮箱」，窄了才能 truncate 生效。
 */
const ROW_GRID =
    "sm:grid-cols-[minmax(0,1fr)_110px_96px_150px_150px_168px]";

/** 新增/编辑表单初始值（新增弹窗打开时重置，避免残留上一人选中的用户数据；默认状态为「正常」） */
const EMPTY_FORM = { username: "", email: "", nickname: "", password: "", userGroupID: "", status: "1" };

interface Query {
    page: number;
    pageSize: number;
    keyword: string;
    status: string;
    groupID: string;
}

const INITIAL_QUERY: Query = { page: 1, pageSize: PAGE_SIZE, keyword: "", status: "", groupID: "" };

const STATUS_OPTIONS = [
    { value: "", label: "全部状态" },
    { value: "1", label: "正常" },
    { value: "2", label: "未激活" },
    { value: "3", label: "已封禁" },
];

/** 表单里设置用户状态用的选项（去掉「全部状态」） */
const FORM_STATUS_OPTIONS = STATUS_OPTIONS.filter((o) => o.value !== "");

function formatTime(iso?: string): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function StatusBadge({ status }: { status: number }) {
    const map: Record<number, { text: string; cls: string }> = {
        1: { text: "正常", cls: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400" },
        2: { text: "未激活", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" },
        3: { text: "已封禁", cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400" },
    };
    const m = map[status] ?? { text: String(status), cls: "bg-muted text-muted-foreground" };
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${m.cls}`}>
            {m.text}
        </span>
    );
}

/** 轻量弹窗（admin 没有 dialog 组件） */
function Modal({
    open,
    title,
    onClose,
    children,
}: {
    open: boolean;
    title: string;
    onClose: () => void;
    children: React.ReactNode;
}) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
            <div
                className="w-full max-w-md rounded-xl border bg-card p-5 shadow-xl"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-base font-semibold">{title}</h3>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="关闭"
                        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        ✕
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
            {children}
        </label>
    );
}

/** 管理员用户管理：列表 + 搜索/筛选 + 新增/编辑/重置密码/封禁/删除 */
export function UserManagement() {
    const [query, setQuery] = useState<Query>(INITIAL_QUERY);
    const [data, setData] = useState<AdminUserListData | null>(null);
    const [groups, setGroups] = useState<UserGroup[]>([]);
    const [loading, setLoading] = useState(true);

    // 弹窗状态
    const [createOpen, setCreateOpen] = useState(false);
    const [editUser, setEditUser] = useState<AdminUser | null>(null);
    const [resetUser, setResetUser] = useState<AdminUser | null>(null);
    const [confirm, setConfirm] = useState<{ type: "ban" | "unban" | "delete"; user: AdminUser } | null>(null);

    // 新增/编辑/重置密码表单
    const [form, setForm] = useState(EMPTY_FORM);
    const [newPassword, setNewPassword] = useState("");

    /** 按条件加载用户列表（loading 由调用方控制） */
    const load = useCallback(async (q: Query) => {
        try {
            const qs = new URLSearchParams();
            qs.set("page", String(q.page));
            qs.set("pageSize", String(q.pageSize));
            if (q.keyword.trim()) qs.set("keyword", q.keyword.trim());
            if (q.status) qs.set("status", q.status);
            if (q.groupID) qs.set("groupID", q.groupID);
            const res = await fetch(`/api/admin/users?${qs.toString()}`);
            const json = (await res.json()) as { code: number; message: string; data: AdminUserListData };
            if (!res.ok || json.code !== 200) throw new Error(json.message || "获取用户列表失败");
            setData(json.data);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "获取用户列表失败");
        } finally {
            setLoading(false);
        }
    }, []);

    /** 初始加载：用户组 + 第一页 */
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const gres = await fetch("/api/admin/user-groups");
                const gjson = (await gres.json()) as { code: number; data: UserGroup[] };
                if (!cancelled && gres.ok && gjson.code === 200) setGroups(gjson.data);
            } catch {
                // 用户组加载失败不阻塞列表
            }
            if (!cancelled) await load(INITIAL_QUERY);
        })();
        return () => {
            cancelled = true;
        };
    }, [load]);

    /** 应用筛选（重置页码为 1） */
    const applyFilters = (next: Query) => {
        setQuery(next);
        setLoading(true);
        void load(next);
    };

    /** 通用请求封装（带错误提示） */
    const mutate = useCallback(async (url: string, init: RequestInit, successMsg: string): Promise<boolean> => {
        try {
            const res = await fetch(url, init);
            const json = (await res.json()) as { code: number; message: string };
            if (!res.ok || json.code !== 200) throw new Error(json.message || "操作失败");
            toast.success(successMsg);
            return true;
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "操作失败");
            return false;
        }
    }, []);

    const refresh = () => {
        setLoading(true);
        void load(query);
    };

    // ===================== 操作 =====================

    const handleCreate = async () => {
        if (!form.username || !form.email || !form.password || !form.userGroupID) {
            toast.error("请填写用户名、邮箱、密码和用户组");
            return;
        }
        try {
            await createAdminUserApi({
                username: form.username,
                email: form.email,
                password: form.password,
                nickname: form.nickname,
                userGroupID: form.userGroupID,
                status: Number(form.status) || 1,
            });
            toast.success("创建成功");
            setCreateOpen(false);
            setForm(EMPTY_FORM);
            refresh();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "创建失败");
        }
    };

    const handleEdit = async () => {
        if (!editUser) return;
        const body = {
            username: form.username,
            email: form.email,
            nickname: form.nickname,
            userGroupID: form.userGroupID,
            status: Number(form.status) || undefined,
        };
        const ok = await mutate(
            `/api/admin/users/${editUser.id}`,
            { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
            "保存成功"
        );
        if (ok) {
            setEditUser(null);
            refresh();
        }
    };

    const handleResetPassword = async () => {
        if (!resetUser) return;
        if (!newPassword || newPassword.length < 6) {
            toast.error("新密码至少 6 位");
            return;
        }
        const ok = await mutate(
            `/api/admin/users/${resetUser.id}/reset-password`,
            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newPassword }) },
            "密码已重置"
        );
        if (ok) {
            setResetUser(null);
            setNewPassword("");
        }
    };

    const handleBan = async () => {
        if (!confirm) return;
        const nextStatus = confirm.type === "ban" ? 3 : 1;
        const ok = await mutate(
            `/api/admin/users/${confirm.user.id}/status`,
            { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: nextStatus }) },
            confirm.type === "ban" ? "已封禁" : "已解封"
        );
        if (ok) {
            setConfirm(null);
            refresh();
        }
    };

    const handleDelete = async () => {
        if (!confirm) return;
        const ok = await mutate(`/api/admin/users/${confirm.user.id}`, { method: "DELETE" }, "已删除");
        if (ok) {
            setConfirm(null);
            refresh();
        }
    };

    const openEdit = (user: AdminUser) => {
        setEditUser(user);
        setForm({
            username: user.username || "",
            email: user.email || "",
            nickname: user.nickname || "",
            password: "",
            userGroupID: user.userGroupID || "",
            status: String(user.status ?? 1),
        });
    };

    const totalPages = data ? Math.max(1, Math.ceil(data.total / query.pageSize)) : 1;

    return (
        <div className="space-y-4">
            {/* ===== 工具栏：搜索 + 状态下拉 + 用户组下拉 + 新增/重置 ===== */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        className="w-56 pl-8"
                        placeholder="搜索用户名 / 昵称 / 邮箱"
                        value={query.keyword}
                        onChange={(e) => setQuery((q) => ({ ...q, keyword: e.target.value }))}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") applyFilters({ ...query, page: 1 });
                        }}
                    />
                </div>

                <Select
                    value={query.status}
                    onValueChange={(v) => applyFilters({ ...query, status: v, page: 1 })}
                >
                    <SelectTrigger className="w-32">
                        <SelectValue placeholder="状态" />
                    </SelectTrigger>
                    <SelectContent>
                        {STATUS_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value || "all"} value={opt.value}>
                                {opt.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Select
                    value={query.groupID}
                    onValueChange={(v) => applyFilters({ ...query, groupID: v, page: 1 })}
                >
                    <SelectTrigger className="w-44">
                        <SelectValue placeholder="用户组" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="">全部用户组</SelectItem>
                        {groups.map((g) => (
                            <SelectItem key={g.id} value={g.id}>
                                {g.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <div className="ml-auto flex items-center gap-2">
                    <Button onClick={() => { setForm(EMPTY_FORM); setCreateOpen(true); }}>
                        <Plus className="size-4" />
                        新增用户
                    </Button>
                    <Button variant="outline" onClick={() => applyFilters(INITIAL_QUERY)}>
                        <RotateCcw className="size-4" />
                        重置
                    </Button>
                </div>
            </div>

            {/* ===== 用户列表：<640px 单列堆叠卡片，≥640px 表格式栅格 ===== */}
            <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
                {/* 表头：移动端隐藏，≥sm 才以 grid 显示；min-w 只在 sm 以上生效，窄屏不会撑出横向滚动 */}
                <div
                    className={cn(
                        "hidden min-w-[900px] items-center gap-3 border-b bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground sm:grid",
                        ROW_GRID
                    )}
                >
                    <span>用户信息</span>
                    <span>用户组</span>
                    <span>状态</span>
                    <span>最后登录</span>
                    <span>创建时间</span>
                    <span className="text-right">操作</span>
                </div>

                {/* 行容器：只有 ≥sm 才有 min-w，窄屏不撑宽，卡片不会被拉出横向滚动 */}
                <div className="sm:min-w-[900px]">
                    {loading ? (
                        <div className="py-10 text-center text-sm text-muted-foreground">加载中…</div>
                    ) : !data || data.users.length === 0 ? (
                        <div className="py-10 text-center text-sm text-muted-foreground">暂无用户</div>
                    ) : (
                        data.users.map((user) => (
                            <div
                                key={user.id}
                                className={cn(
                                    "grid grid-cols-1 gap-x-3 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/40 sm:items-center sm:gap-y-1",
                                    ROW_GRID
                                )}
                            >
                                {/* 用户信息（主列）：手机上头像与文字并排，不会互相压叠 */}
                                <div className="flex min-w-0 items-center gap-3">
                                    <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                                        {user.avatar ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={resolveAssetUrl(user.avatar) ?? ""}
                                                alt=""
                                                className="h-full w-full object-cover"
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).style.display = "none";
                                                }}
                                            />
                                        ) : (
                                            (user.nickname || user.username || "U").charAt(0).toUpperCase()
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-medium">
                                            {user.nickname || user.username}
                                        </div>
                                        <div className="truncate text-xs text-muted-foreground">
                                            @{user.username}
                                            {user.email && <span className="ml-1">· {user.email}</span>}
                                        </div>
                                    </div>
                                </div>

                                {/* 用户组：手机上补「角色」字样，代替被隐藏的表头 */}
                                <span className="flex items-center gap-1.5 text-sm">
                                    <span className="shrink-0 text-xs text-muted-foreground sm:hidden">角色</span>
                                    <span className="truncate">{user.userGroup?.name ?? "—"}</span>
                                </span>

                                {/* 状态 */}
                                <span className="flex items-center gap-1.5">
                                    <span className="shrink-0 text-xs text-muted-foreground sm:hidden">状态</span>
                                    <StatusBadge status={user.status} />
                                </span>

                                {/* 最后登录 */}
                                <span className="flex items-baseline gap-1.5 whitespace-nowrap text-sm text-muted-foreground">
                                    <span className="shrink-0 text-xs sm:hidden">最后登录</span>
                                    <span>{formatTime(user.lastLoginAt)}</span>
                                </span>

                                {/* 创建时间 */}
                                <span className="flex items-baseline gap-1.5 whitespace-nowrap text-sm text-muted-foreground">
                                    <span className="shrink-0 text-xs sm:hidden">创建</span>
                                    <span>{formatTime(user.created_at)}</span>
                                </span>

                                {/* 操作：手机上靠左跟在标签后面，≥sm 靠右对齐 */}
                                <div className="flex items-center gap-1 sm:justify-end">
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button variant="ghost" size="icon" aria-label="编辑" className={cn("size-8", ACTION_TONE.edit)} onClick={() => openEdit(user)}>
                                                <Pencil className="size-4" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>编辑</TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button variant="ghost" size="icon" aria-label="重置密码" className={cn("size-8", ACTION_TONE.key)} onClick={() => setResetUser(user)}>
                                                <KeyRound className="size-4" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>重置密码</TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                aria-label={user.status === 3 ? "解封" : "封禁"}
                                                className={cn("size-8", user.status === 3 ? ACTION_TONE.approve : ACTION_TONE.block)}
                                                onClick={() => setConfirm({ type: user.status === 3 ? "unban" : "ban", user })}
                                            >
                                                <Ban className="size-4" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>{user.status === 3 ? "解封" : "封禁"}</TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                aria-label="删除"
                                                className={cn("size-8", ACTION_TONE.delete)}
                                                onClick={() => setConfirm({ type: "delete", user })}
                                            >
                                                <Trash2 className="size-4" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>删除</TooltipContent>
                                    </Tooltip>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* ===== 分页 ===== */}
            {data && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                        共 {data.total} 条 · 第 {data.page} / {totalPages} 页
                    </span>
                    <PaginationControls
                        page={query.page}
                        totalPages={totalPages}
                        onPageChange={(p) => applyFilters({ ...query, page: p })}
                    />
                </div>
            )}

            {/* ===== 新增用户弹窗 ===== */}
            <Modal open={createOpen} title="新增用户" onClose={() => setCreateOpen(false)}>
                <div className="space-y-3">
                    <Field label="用户名（必填）">
                        <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="3-50 字符" />
                    </Field>
                    <Field label="邮箱（必填）">
                        <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="user@example.com" />
                    </Field>
                    <Field label="昵称">
                        <Input value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
                    </Field>
                    <Field label="密码（必填，至少 6 位）">
                        <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                    </Field>
                    <Field label="用户组（必填）">
                        <Select value={form.userGroupID} onValueChange={(v) => setForm({ ...form, userGroupID: v })}>
                            <SelectTrigger>
                                <SelectValue placeholder="选择用户组" />
                            </SelectTrigger>
                            <SelectContent>
                                {groups.map((g) => (
                                    <SelectItem key={g.id} value={g.id}>
                                        {g.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                    <Field label="状态">
                        <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                            <SelectTrigger>
                                <SelectValue placeholder="选择状态" />
                            </SelectTrigger>
                            <SelectContent>
                                {FORM_STATUS_OPTIONS.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>
                            取消
                        </Button>
                        <Button onClick={handleCreate}>创建</Button>
                    </div>
                </div>
            </Modal>

            {/* ===== 编辑用户弹窗 ===== */}
            <Modal open={!!editUser} title={`编辑用户：${editUser?.nickname || editUser?.username || ""}`} onClose={() => setEditUser(null)}>
                <div className="space-y-3">
                    <Field label="用户名">
                        <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
                    </Field>
                    <Field label="邮箱">
                        <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                    </Field>
                    <Field label="昵称">
                        <Input value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                        <label className="block">
                            <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                <Users className="size-3.5" />
                                用户组
                            </span>
                            <Select value={form.userGroupID} onValueChange={(v) => setForm({ ...form, userGroupID: v })}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="选择用户组" />
                                </SelectTrigger>
                                <SelectContent>
                                    {groups.map((g) => (
                                        <SelectItem key={g.id} value={g.id}>
                                            {g.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </label>
                        <label className="block">
                            <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                <BadgeCheck className="size-3.5" />
                                状态
                            </span>
                            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="选择状态" />
                                </SelectTrigger>
                                <SelectContent>
                                    {FORM_STATUS_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </label>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setEditUser(null)}>
                            取消
                        </Button>
                        <Button onClick={handleEdit}>保存</Button>
                    </div>
                </div>
            </Modal>

            {/* ===== 重置密码弹窗 ===== */}
            <Modal open={!!resetUser} title={`重置密码：${resetUser?.nickname || resetUser?.username || ""}`} onClose={() => setResetUser(null)}>
                <div className="space-y-3">
                    <Field label="新密码（至少 6 位）">
                        <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                    </Field>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setResetUser(null)}>
                            取消
                        </Button>
                        <Button onClick={handleResetPassword}>重置</Button>
                    </div>
                </div>
            </Modal>

            {/* ===== 确认弹窗（封禁/解封/删除） ===== */}
            <Modal
                open={!!confirm}
                title={confirm ? (confirm.type === "delete" ? "删除用户" : confirm.type === "ban" ? "封禁用户" : "解封用户") : ""}
                onClose={() => setConfirm(null)}
            >
                <p className="text-sm text-muted-foreground">
                    {confirm ? (
                        confirm.type === "delete"
                            ? `确定删除用户「${confirm.user.nickname || confirm.user.username}」吗？该操作不可恢复。`
                            : confirm.type === "ban"
                                ? `确定封禁用户「${confirm.user.nickname || confirm.user.username}」吗？封禁后无法登录。`
                                : `确定解封用户「${confirm.user.nickname || confirm.user.username}」吗？`
                    ) : (
                        ""
                    )}
                </p>
                <div className="flex justify-end gap-2 pt-4">
                    <Button variant="outline" onClick={() => setConfirm(null)}>
                        取消
                    </Button>
                    <Button
                        variant={confirm?.type === "delete" ? "destructive" : "default"}
                        onClick={confirm?.type === "delete" ? handleDelete : handleBan}
                    >
                        确定
                    </Button>
                </div>
            </Modal>
        </div>
    );
}
