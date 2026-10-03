"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
    Crown,
    Eye,
    Layers,
    Pencil,
    Plus,
    RefreshCw,
    Search,
    Trash2,
    Users,
} from "lucide-react";

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
import { ACTION_TONE } from "@/lib/action-tones";
import { cn } from "@/lib/utils";

/**
 * 会员管理（静态外壳：**仅样式，未接任何接口**）
 *
 * 接口情况：目前没找到后端接口。
 *  - 已线上探活 8 个候选路径，全部 404：
 *    /pro/admin/memberships · /pro/admin/members · /pro/admin/vip · /pro/admin/subscriptions ·
 *    /pro/admin/plans · /pro/admin/membership-plans · /pro/admin/member-levels · /pro/admin/user-memberships
 *  - 对照组：/pro/admin/donations 与 /pro/admin/orders 都是 401（= 路径存在、只是未登录），
 *    所以上面 8 个 404 是真的没有这个模块，不是鉴权问题。
 *  - 字段暂按官方前端类型定义 membership.ts 写（MembershipPlan / UserMembership），等接口确认后再接。
 *
 * 本组件不发任何网络请求：所有按钮只 toast.info("…待接入")，筛选/搜索/分页均为本地占位。
 */

/** 会员方案（字段名对齐官方类型 MembershipPlan；可选项是因为接口未确认） */
interface MembershipPlan {
    name?: string;
    price?: number;
    original_price?: number;
    duration_days?: number;
    status?: number | string;
    sort_order?: number;
    created_at?: string;
}

/** 用户会员（字段名对齐官方类型 UserMembership） */
interface UserMembership {
    user_id?: number;
    plan_id?: number;
    plan_name?: string;
    is_member?: boolean;
    start_time?: string;
    expire_time?: string;
    is_expired?: boolean;
}

/**
 * 占位数据源：接口接入后换成接口返回的 list 即可，下面的行渲染已按字段写好
 * （这样字段名有类型约束，接口一对上就能直接用）。
 */
const PLANS: MembershipPlan[] = [];
const MEMBERS: UserMembership[] = [];

/** 时间戳（接口未定，先按 ISO 字符串格式化；解析失败显示 —） */
function formatDateTime(value?: string): string {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 金额展示（保留两位小数） */
function money(value: unknown): string {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

/** 方案状态：1=上架 0/其他=下架（枚举以接口为准，先按常见约定展示） */
function planStatusBadge(status?: number | string) {
    if (status === 1 || status === "1" || status === "active") {
        return { label: "上架", cls: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400" };
    }
    return { label: "下架", cls: "bg-muted text-muted-foreground" };
}

/** 是否会员徽章 */
function memberBadge(isMember?: boolean) {
    return isMember
        ? { label: "是", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" }
        : { label: "否", cls: "bg-muted text-muted-foreground" };
}

/** 会员状态徽章：is_expired → 已过期 / 有效 */
function expiredBadge(isExpired?: boolean) {
    return isExpired
        ? { label: "已过期", cls: "bg-muted text-muted-foreground" }
        : { label: "有效", cls: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400" };
}

/**
 * 统计磁贴（数值待接口，统一显示 —）。
 * 颜色写在这里而不是和基础类拼在一起：两个 text-* 类同时存在时胜负取决于样式表顺序，
 * 不是一个颜色盖另一个，所以基础类里不放颜色。
 */
const STATS = [
    { label: "方案数", cls: "text-muted-foreground/70" },
    { label: "有效会员", cls: "text-green-600 dark:text-green-400" },
    { label: "已过期", cls: "text-orange-600 dark:text-orange-400" },
    { label: "本月新增", cls: "text-primary" },
] as const;

/** 方案 Tab 状态筛选（枚举待接口确认） */
const PLAN_STATUS_OPTIONS = [
    { value: "1", label: "上架" },
    { value: "0", label: "下架" },
];

/** 会员 Tab 状态筛选（对应 UserMembership.is_expired） */
const MEMBER_STATUS_OPTIONS = [
    { value: "active", label: "有效" },
    { value: "expired", label: "已过期" },
];

/**
 * 会员管理外壳：Tab（会员方案 / 会员列表）互斥 → 同一时刻只有一个 admin-scroll，
 * 表头吸顶、分页固定在卡片底部。
 */
export function MembershipsManager() {
    const [tab, setTab] = useState<"plans" | "members">("plans");
    // 筛选 / 搜索：纯本地 state，只影响空态文案与控件外观，不发请求
    const [planStatus, setPlanStatus] = useState("all");
    const [planKeyword, setPlanKeyword] = useState("");
    const [memberStatus, setMemberStatus] = useState("all");
    const [memberKeyword, setMemberKeyword] = useState("");

    // 移动端(<640px)：grid-cols-1 让每个单元格竖排成卡片；≥640px 恢复表格式列布局。
    // min-w 只写在 sm: 以上 —— 窄屏若也撑宽，卡片会被拉出横向滚动。
    const planGrid = "sm:grid-cols-[minmax(0,1fr)_150px_92px_88px_64px_88px]";
    const planMinW = "sm:min-w-[720px]";
    const memberGrid = "sm:grid-cols-[110px_minmax(0,1fr)_80px_140px_140px_80px_72px]";
    const memberMinW = "sm:min-w-[880px]";

    return (
        // admin-card：吃掉剩余高度，列表在卡片内部滚动，不顶高整页
        <div className="admin-card">
            {/* ===== 统计磁贴：固定在卡片顶部（shrink-0），不随列表滚动 ===== */}
            <div className="grid shrink-0 grid-cols-2 gap-2 border-b p-3 md:grid-cols-4">
                {STATS.map((s) => (
                    <div key={s.label} className="rounded-lg border bg-muted/40 px-3 py-2">
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                        <p className={cn("text-lg font-semibold tabular-nums", s.cls)}>—</p>
                    </div>
                ))}
            </div>

            {/* ===== Tab + 工具（固定在卡片顶部，不随内容滚动） ===== */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b p-3">
                <div className="flex items-center overflow-hidden rounded-xl border bg-card shadow-sm">
                    <button
                        type="button"
                        onClick={() => setTab("plans")}
                        className={cn(
                            "flex h-9 items-center gap-1.5 px-3 text-xs transition-colors",
                            tab === "plans" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-primary"
                        )}
                    >
                        <Crown className="size-3.5" />
                        会员方案
                    </button>
                    <span className="h-5 w-px bg-border" />
                    <button
                        type="button"
                        onClick={() => setTab("members")}
                        className={cn(
                            "flex h-9 items-center gap-1.5 px-3 text-xs transition-colors",
                            tab === "members" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-primary"
                        )}
                    >
                        <Users className="size-3.5" />
                        会员列表
                    </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {tab === "plans" ? (
                        <>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                状态
                                <Select value={planStatus} onValueChange={setPlanStatus}>
                                    <SelectTrigger className="h-9 w-24 rounded-xl text-xs">
                                        <SelectValue placeholder="全部" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">全部</SelectItem>
                                        {PLAN_STATUS_OPTIONS.map((o) => (
                                            <SelectItem key={o.value} value={o.value}>
                                                {o.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={planKeyword}
                                    onChange={(e) => setPlanKeyword(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") toast.info("方案搜索待接入");
                                    }}
                                    placeholder="搜索方案名称…"
                                    className="h-9 w-40 rounded-xl pl-8 text-xs"
                                />
                            </div>
                            <Button
                                variant="outline"
                                size="icon-sm"
                                aria-label="刷新"
                                title="刷新"
                                className="size-9 rounded-xl"
                                onClick={() => toast.info("刷新待接入")}
                            >
                                <RefreshCw className="size-4" />
                            </Button>
                            <Button
                                size="sm"
                                className="h-9 rounded-xl text-xs"
                                onClick={() => toast.info("新增方案待接入")}
                            >
                                <Plus className="size-3.5" />
                                新增方案
                            </Button>
                        </>
                    ) : (
                        <>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                状态
                                <Select value={memberStatus} onValueChange={setMemberStatus}>
                                    <SelectTrigger className="h-9 w-24 rounded-xl text-xs">
                                        <SelectValue placeholder="全部" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">全部</SelectItem>
                                        {MEMBER_STATUS_OPTIONS.map((o) => (
                                            <SelectItem key={o.value} value={o.value}>
                                                {o.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={memberKeyword}
                                    onChange={(e) => setMemberKeyword(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") toast.info("会员搜索待接入");
                                    }}
                                    placeholder="按用户 ID / 方案搜索…"
                                    className="h-9 w-44 rounded-xl pl-8 text-xs"
                                />
                            </div>
                            <Button
                                variant="outline"
                                size="icon-sm"
                                aria-label="刷新"
                                title="刷新"
                                className="size-9 rounded-xl"
                                onClick={() => toast.info("刷新待接入")}
                            >
                                <RefreshCw className="size-4" />
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* ===== Tab ①：会员方案 ===== */}
            {tab === "plans" && (
                <>
                    {/* 唯一的滚动区：表头吸顶，工具栏与分页都不动 */}
                    <div className="admin-scroll">
                        <div
                            className={`admin-sticky-head hidden items-center gap-3 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground sm:grid ${planMinW} ${planGrid}`}
                        >
                            <span>方案名称</span>
                            <span>价格</span>
                            <span className="text-center">时长</span>
                            <span className="text-center">状态</span>
                            <span className="text-center">排序</span>
                            <span className="text-right">操作</span>
                        </div>

                        {PLANS.length === 0 ? (
                            <div className="flex min-h-56 flex-col items-center justify-center gap-1.5 px-4 py-12 text-sm text-muted-foreground">
                                <Layers className="size-8 opacity-40" />
                                <span>
                                    {planStatus !== "all" || planKeyword ? "没有匹配的会员方案" : "暂无会员方案数据"}
                                </span>
                                <span className="text-xs text-muted-foreground/70">接口接入后显示</span>
                            </div>
                        ) : (
                            PLANS.map((plan, index) => {
                                const badge = planStatusBadge(plan.status);
                                const struck =
                                    plan.original_price !== undefined &&
                                    Number(plan.original_price) > Number(plan.price ?? 0);
                                return (
                                    <div
                                        key={`${plan.name ?? "plan"}-${index}`}
                                        className={`grid grid-cols-1 items-center gap-x-3 gap-y-2 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/40 sm:gap-y-1 ${planMinW} ${planGrid}`}
                                    >
                                        <div className="min-w-0">
                                            <div className="truncate font-medium text-foreground">
                                                {plan.name || "—"}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {formatDateTime(plan.created_at)}
                                            </div>
                                        </div>
                                        <div className="flex items-baseline gap-1.5">
                                            <span className="font-semibold tabular-nums text-primary">
                                                ¥{money(plan.price)}
                                            </span>
                                            {struck && (
                                                <span className="text-xs tabular-nums text-muted-foreground line-through">
                                                    ¥{money(plan.original_price)}
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-xs tabular-nums text-muted-foreground sm:text-center">
                                            <span className="mr-1 sm:hidden">时长</span>
                                            {plan.duration_days ?? 0} 天
                                        </div>
                                        <div className="sm:text-center">
                                            <span
                                                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}
                                            >
                                                {badge.label}
                                            </span>
                                        </div>
                                        <div className="text-xs tabular-nums text-muted-foreground sm:text-center">
                                            <span className="mr-1 sm:hidden">排序</span>
                                            {plan.sort_order ?? 0}
                                        </div>
                                        <div className="flex items-center gap-1 sm:justify-end">
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                aria-label="编辑方案"
                                                title="编辑"
                                                className={ACTION_TONE.edit}
                                                onClick={() => toast.info("编辑方案待接入")}
                                            >
                                                <Pencil className="size-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                aria-label="删除方案"
                                                title="删除"
                                                className={ACTION_TONE.delete}
                                                onClick={() => toast.info("删除方案待接入")}
                                            >
                                                <Trash2 className="size-4" />
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* 分页：固定在卡片底部；接口未接入，始终禁用 */}
                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
                        <span>共 0 个方案 · 第 1 / 1 页</span>
                        <PaginationControls page={1} totalPages={1} disabled onPageChange={() => {}} />
                    </div>
                </>
            )}

            {/* ===== Tab ②：会员列表 ===== */}
            {tab === "members" && (
                <>
                    <div className="admin-scroll">
                        <div
                            className={`admin-sticky-head hidden items-center gap-3 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground sm:grid ${memberMinW} ${memberGrid}`}
                        >
                            <span>用户</span>
                            <span>方案</span>
                            <span className="text-center">是否会员</span>
                            <span>开始时间</span>
                            <span>到期时间</span>
                            <span className="text-center">状态</span>
                            <span className="text-right">操作</span>
                        </div>

                        {MEMBERS.length === 0 ? (
                            <div className="flex min-h-56 flex-col items-center justify-center gap-1.5 px-4 py-12 text-sm text-muted-foreground">
                                <Users className="size-8 opacity-40" />
                                <span>
                                    {memberStatus !== "all" || memberKeyword ? "没有匹配的会员" : "暂无会员数据"}
                                </span>
                                <span className="text-xs text-muted-foreground/70">接口接入后显示</span>
                            </div>
                        ) : (
                            MEMBERS.map((member, index) => {
                                const memberTag = memberBadge(member.is_member);
                                const expiredTag = expiredBadge(member.is_expired);
                                return (
                                    <div
                                        key={`${member.user_id ?? "user"}-${member.plan_id ?? index}`}
                                        className={`grid grid-cols-1 items-center gap-x-3 gap-y-2 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/40 sm:gap-y-1 ${memberMinW} ${memberGrid}`}
                                    >
                                        <div className="min-w-0">
                                            <span className="font-mono text-xs text-muted-foreground">
                                                <span className="mr-1 font-sans sm:hidden">用户</span>
                                                {member.user_id ?? "—"}
                                            </span>
                                        </div>
                                        <div className="min-w-0 truncate font-medium text-foreground">
                                            {member.plan_name || "—"}
                                        </div>
                                        <div className="sm:text-center">
                                            <span
                                                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${memberTag.cls}`}
                                            >
                                                {memberTag.label}
                                            </span>
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            <span className="mr-1 sm:hidden">开始</span>
                                            {formatDateTime(member.start_time)}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            <span className="mr-1 sm:hidden">到期</span>
                                            {formatDateTime(member.expire_time)}
                                        </div>
                                        <div className="sm:text-center">
                                            <span
                                                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${expiredTag.cls}`}
                                            >
                                                {expiredTag.label}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1 sm:justify-end">
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                aria-label="查看会员"
                                                title="查看"
                                                className={ACTION_TONE.view}
                                                onClick={() => toast.info("查看会员详情待接入")}
                                            >
                                                <Eye className="size-4" />
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
                        <span>共 0 位会员 · 第 1 / 1 页</span>
                        <PaginationControls page={1} totalPages={1} disabled onPageChange={() => {}} />
                    </div>
                </>
            )}
        </div>
    );
}
