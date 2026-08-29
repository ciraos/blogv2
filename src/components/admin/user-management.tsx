"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Ban, ChevronLeft, ChevronRight, KeyRound, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { resolveAssetUrl } from "@/lib/utils";
import type { AdminUser, AdminUserListData, UserGroup } from "@/types/users";

const PAGE_SIZE = 10;

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
    const [form, setForm] = useState({ username: "", email: "", nickname: "", password: "", userGroupID: "" });
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
        const ok = await mutate(
            "/api/admin/users",
            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) },
            "创建成功"
        );
        if (ok) {
            setCreateOpen(false);
            setForm({ username: "", email: "", nickname: "", password: "", userGroupID: "" });
            refresh();
        }
    };

    const handleEdit = async () => {
        if (!editUser) return;
        const body = {
            username: form.username,
            email: form.email,
            nickname: form.nickname,
            userGroupID: form.userGroupID,
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
                    <Button onClick={() => setCreateOpen(true)}>
                        <Plus className="size-4" />
                        新增用户
                    </Button>
                    <Button variant="outline" onClick={() => applyFilters(INITIAL_QUERY)}>
                        <RotateCcw className="size-4" />
                        重置
                    </Button>
                </div>
            </div>

            {/* ===== 用户表格 ===== */}
            <div className="rounded-xl border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>用户信息</TableHead>
                            <TableHead>用户组</TableHead>
                            <TableHead>状态</TableHead>
                            <TableHead>最后登录</TableHead>
                            <TableHead>创建时间</TableHead>
                            <TableHead className="text-right">操作</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                                    加载中…
                                </TableCell>
                            </TableRow>
                        ) : !data || data.users.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                                    暂无用户
                                </TableCell>
                            </TableRow>
                        ) : (
                            data.users.map((user) => (
                                <TableRow key={user.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-3">
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
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-sm">{user.userGroup?.name ?? "—"}</span>
                                    </TableCell>
                                    <TableCell>
                                        <StatusBadge status={user.status} />
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                                        {formatTime(user.lastLoginAt)}
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                                        {formatTime(user.created_at)}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center justify-end gap-0.5">
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(user)}>
                                                        <Pencil className="size-4" />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>编辑</TooltipContent>
                                            </Tooltip>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="size-8" onClick={() => setResetUser(user)}>
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
                                                        className="size-8 text-amber-600 hover:text-amber-600"
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
                                                        className="size-8 text-destructive hover:text-destructive"
                                                        onClick={() => setConfirm({ type: "delete", user })}
                                                    >
                                                        <Trash2 className="size-4" />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>删除</TooltipContent>
                                            </Tooltip>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* ===== 分页 ===== */}
            {data && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                        共 {data.total} 条 · 第 {data.page} / {totalPages} 页
                    </span>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={query.page <= 1}
                            onClick={() => applyFilters({ ...query, page: query.page - 1 })}
                        >
                            <ChevronLeft className="size-4" />
                            上一页
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={query.page >= totalPages}
                            onClick={() => applyFilters({ ...query, page: query.page + 1 })}
                        >
                            下一页
                            <ChevronRight className="size-4" />
                        </Button>
                    </div>
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
                    <Field label="用户组">
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
