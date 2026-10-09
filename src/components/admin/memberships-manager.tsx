"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import {
    Crown,
    Eye,
    Layers,
    Pencil,
    Plus,
    Power,
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
import {
    createAdminMembershipPlanApi,
    deleteAdminMembershipPlanApi,
    getAdminMembershipMembersApi,
    getAdminMembershipPlansApi,
    updateAdminMembershipPlanApi,
    type CreatePlanRequest,
    type MembershipPlan,
    type UserMembership,
} from "@/lib/api-membership";

/**
 * 会员管理 —— 已接真接口（PRO 模块）。
 *
 * 远端接口（权威来源：官方前端快照 scripts/theme/theme-anheyu-next-main/src/lib/api/membership.ts）：
 *   GET    /pro/admin/membership/plans        L19-21   套餐列表（响应 { list }，无分页）
 *   GET    /pro/admin/membership/plans/{id}   L26-28   套餐详情（本页未用，官方也只用于详情弹窗）
 *   POST   /pro/admin/membership/plans        L33-35   新增套餐
 *   PUT    /pro/admin/membership/plans/{id}   L40-42   更新套餐（切状态 / 改排序也走它）
 *   DELETE /pro/admin/membership/plans/{id}   L47-49   删除套餐
 *   GET    /pro/admin/membership/members      L54-56   会员列表（page / page_size / status=active|expired）
 *
 * 浏览器端不直连后端（无 CORS + 需鉴权），全部经同源代理 /api/admin/membership/* 转发
 * （见 src/app/api/admin/membership/）。写操作都要点二次确认，本轮未对线上实测。
 *
 * ⚠️ 价格单位是**分**（官方 PlanEditDialog.tsx L91 的 label「价格（分）」、L113 预览里 /100），
 *    所以表单按元输入/展示，提交前 ×100 折回分。
 * ⚠️ 套餐 status：1=启用 2=停用（官方 use-memberships-page.ts L170）。
 */

const PLAN_PAGE_SIZE = 10;
const MEMBER_PAGE_SIZE = 10;

/** 套餐状态（1=启用 2=停用，官方 use-memberships-page.ts L170） */
const PLAN_STATUS_OPTIONS = [
    { value: "1", label: "启用" },
    { value: "2", label: "停用" },
];

/** 会员筛选（对应 UserMembership.is_expired / 远端 status 参数，官方 ListMembersRequest） */
const MEMBER_STATUS_OPTIONS = [
    { value: "active", label: "有效" },
    { value: "expired", label: "已过期" },
];

/** 时间戳（YYYY-MM-DD HH:MM，本地时区；数据是拉取后渲染的，不涉及水合一致性） */
function formatDateTime(value?: string): string {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 分（后端单位）→ 元字符串，用于展示与表单回填 */
function centsToYuan(value: unknown): string {
    const n = Number(value);
    if (!Number.isFinite(n)) return "";
    return (n / 100).toFixed(2);
}

/** 元（表单输入）→ 分（后端单位） */
function yuanToCents(value: string): number {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.round(n * 100);
}

/** 元展示（¥ 前缀由调用方给） */
function money(cents: unknown): string {
    const n = Number(cents);
    return Number.isFinite(n) ? (n / 100).toFixed(2) : "0.00";
}

/** 套餐状态徽章（1=启用 2=停用） */
function planStatusBadge(status?: number) {
    if (status === 1) {
        return { label: "启用", cls: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400" };
    }
    return { label: "停用", cls: "bg-muted text-muted-foreground" };
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

/** 弹窗里的「标签 + 值」小格 */
function Meta({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="min-w-0">
            <p className="text-muted-foreground">{label}</p>
            <p className="mt-0.5 truncate text-foreground">{value}</p>
        </div>
    );
}

/** 套餐编辑表单（金额字段都是「元」，提交前折成分） */
interface PlanForm {
    name: string;
    description: string;
    price: string;
    original_price: string;
    duration_days: string;
    status: string;
    sort_order: string;
}

const EMPTY_PLAN_FORM: PlanForm = {
    name: "",
    description: "",
    price: "",
    original_price: "",
    duration_days: "365",
    status: "1",
    sort_order: "",
};

/** 由已有套餐生成表单初值（分 → 元） */
function planToForm(plan: MembershipPlan): PlanForm {
    return {
        name: plan.name || "",
        description: plan.description || "",
        price: centsToYuan(plan.price),
        original_price: plan.original_price ? centsToYuan(plan.original_price) : "",
        duration_days: String(plan.duration_days || 365),
        status: String(plan.status ?? 1),
        sort_order: plan.sort_order === undefined || plan.sort_order === null ? "" : String(plan.sort_order),
    };
}

/** 套餐本地筛选：远端列表接口没有筛选参数，只能筛已加载的全量列表 */
function filterPlans(plans: MembershipPlan[], status: string, keyword: string): MembershipPlan[] {
    const needle = keyword.trim().toLowerCase();
    return plans.filter((p) => {
        if (status !== "all" && String(p.status ?? "") !== status) return false;
        if (!needle) return true;
        return (p.name || "").toLowerCase().includes(needle);
    });
}

/**
 * 会员管理：Tab（会员方案 / 会员列表）互斥 → 同一时刻只有一个 admin-scroll，
 * 表头吸顶、分页固定在卡片底部。两个 Tab 各自独立加载与分页。
 */
export function MembershipsManager() {
    const [tab, setTab] = useState<"plans" | "members">("plans");

    // ===== 会员方案 =====
    const [plans, setPlans] = useState<MembershipPlan[]>([]);
    const [plansLoading, setPlansLoading] = useState(true);
    const [planPage, setPlanPage] = useState(1);
    const [planStatus, setPlanStatus] = useState("all"); // 本地筛：套餐列表接口无分页/无筛选参数
    const [planKeyword, setPlanKeyword] = useState("");
    const [refreshKey, setRefreshKey] = useState(0);
    const [savingPlan, setSavingPlan] = useState(false);
    const [togglingId, setTogglingId] = useState<string | null>(null);

    // ===== 会员列表（服务端分页 + status 筛选） =====
    const [members, setMembers] = useState<UserMembership[]>([]);
    const [membersTotal, setMembersTotal] = useState(0);
    const [membersLoading, setMembersLoading] = useState(true);
    const [memberPage, setMemberPage] = useState(1);
    const [memberStatus, setMemberStatus] = useState("all");
    const [memberKeyword, setMemberKeyword] = useState("");

    // ===== 弹窗 =====
    const [editingPlan, setEditingPlan] = useState<MembershipPlan | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [detail, setDetail] = useState<UserMembership | null>(null);
    const [form, setForm] = useState<PlanForm>({ ...EMPTY_PLAN_FORM });

    // 拉取套餐列表（接口无分页，一次全量；排序仍按后端返回，官方前端也是本地按 sort_order 排）
    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(() => setPlansLoading(true), 0);
        getAdminMembershipPlansApi()
            .then((list) => {
                if (cancelled) return;
                setPlans([...list].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
            })
            .catch((e) => {
                if (!cancelled) toast.error(e instanceof Error ? e.message : "套餐列表加载失败");
            })
            .finally(() => {
                if (!cancelled) {
                    clearTimeout(timer);
                    setPlansLoading(false);
                }
            });
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [refreshKey]);

    // 拉取会员列表（服务端分页；status 变化时页面已手动回到第 1 页，见下面的 onValueChange）
    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(() => setMembersLoading(true), 0);
        getAdminMembershipMembersApi({
            page: memberPage,
            page_size: MEMBER_PAGE_SIZE,
            status: memberStatus === "all" ? undefined : (memberStatus as "active" | "expired"),
        })
            .then((data) => {
                if (cancelled) return;
                setMembers(data.list);
                setMembersTotal(data.total);
            })
            .catch((e) => {
                if (!cancelled) toast.error(e instanceof Error ? e.message : "会员列表加载失败");
            })
            .finally(() => {
                if (!cancelled) {
                    clearTimeout(timer);
                    setMembersLoading(false);
                }
            });
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [memberPage, memberStatus, refreshKey]);

    const closeDialog = useCallback(() => {
        setEditingPlan(null);
        setCreateOpen(false);
    }, []);

    /** 新增：排在最后（官方 use-memberships-page.ts L114 也是「最大排序 + 1」） */
    const openCreate = useCallback(() => {
        const maxSort = plans.reduce((max, p) => Math.max(max, p.sort_order || 0), 0);
        setEditingPlan(null);
        setForm({ ...EMPTY_PLAN_FORM, sort_order: String(maxSort + 1) });
        setCreateOpen(true);
    }, [plans]);

    const openEdit = useCallback((plan: MembershipPlan) => {
        setEditingPlan(plan);
        setForm(planToForm(plan));
        setCreateOpen(true);
    }, []);

    const handleSavePlan = async () => {
        const name = form.name.trim();
        const price = Number(form.price);
        const duration = Number(form.duration_days);
        if (!name) {
            toast.error("请填写套餐名称");
            return;
        }
        if (!Number.isFinite(price) || price < 0) {
            toast.error("请填写有效价格（元）");
            return;
        }
        if (!Number.isFinite(duration) || duration <= 0) {
            toast.error("请填写有效时长（天）");
            return;
        }

        // 原价留空 → 不传（官方 PlanEditDialog.tsx L155 同样的处理）
        const originalPrice = form.original_price.trim() === "" ? undefined : Number(form.original_price);
        if (originalPrice !== undefined && (!Number.isFinite(originalPrice) || originalPrice < 0)) {
            toast.error("请填写有效原价（元）");
            return;
        }

        const payload: CreatePlanRequest = {
            name,
            description: form.description.trim() || undefined,
            price: yuanToCents(form.price),
            original_price: originalPrice === undefined ? undefined : yuanToCents(form.original_price),
            duration_days: duration,
            status: Number(form.status) || 1,
        };
        const sortOrder = form.sort_order.trim() === "" ? undefined : Number(form.sort_order);
        if (sortOrder !== undefined && Number.isFinite(sortOrder)) payload.sort_order = sortOrder;

        setSavingPlan(true);
        try {
            if (editingPlan) {
                // 更新接口的 body 全字段可选（官方 UpdatePlanRequest），name 在编辑时基本不变，
                // 依然一起提交以免用户改过名字却没存上。
                await updateAdminMembershipPlanApi(editingPlan.id, payload);
                toast.success("套餐已更新");
            } else {
                await createAdminMembershipPlanApi(payload);
                toast.success("套餐已创建");
            }
            closeDialog();
            setRefreshKey((k) => k + 1);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : editingPlan ? "更新套餐失败" : "创建套餐失败");
        } finally {
            setSavingPlan(false);
        }
    };

    /** 启用/停用：PUT 只传 status（官方 use-memberships-page.ts L171 同款） */
    const handleTogglePlanStatus = async (plan: MembershipPlan) => {
        const nextStatus = plan.status === 1 ? 2 : 1;
        const action = nextStatus === 1 ? "启用" : "停用";
        if (!window.confirm(`确定${action}套餐「${plan.name}」吗？`)) return;
        setTogglingId(plan.id);
        try {
            await updateAdminMembershipPlanApi(plan.id, { status: nextStatus });
            setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, status: nextStatus } : p)));
            toast.success(`套餐已${action}`);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : `${action}套餐失败`);
        } finally {
            setTogglingId(null);
        }
    };

    const handleDeletePlan = async (plan: MembershipPlan) => {
        if (!window.confirm(`确定删除套餐「${plan.name}」吗？\n删除后不可恢复。`)) return;
        try {
            await deleteAdminMembershipPlanApi(plan.id);
            toast.success("套餐已删除");
            // 删掉当前页最后一条且后面没有内容时回退一页，避免停在空页
            const restCount = filterPlans(plans, planStatus, planKeyword).length - 1;
            const lastPage = Math.max(1, Math.ceil(restCount / PLAN_PAGE_SIZE));
            if (planPage > lastPage) setPlanPage(lastPage);
            else setRefreshKey((k) => k + 1);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "删除套餐失败");
        }
    };

    // ===== 本地筛选（套餐接口没给筛选参数，所以只筛已加载的全量列表） =====
    const filteredPlans = filterPlans(plans, planStatus, planKeyword);
    const planTotalPages = Math.max(1, Math.ceil(filteredPlans.length / PLAN_PAGE_SIZE));
    const planSafePage = Math.min(planPage, planTotalPages);
    const pagedPlans = filteredPlans.slice((planSafePage - 1) * PLAN_PAGE_SIZE, planSafePage * PLAN_PAGE_SIZE);

    // 会员接口同样没有 keyword 参数（官方 ListMembersRequest 只有 page/page_size/status），
    // 所以「搜索」是对当前页做本地过滤（用户 ID / 方案 ID / 方案名）。
    const memberTrimmedKeyword = memberKeyword.trim().toLowerCase();
    const visibleMembers = memberTrimmedKeyword
        ? members.filter((m) =>
              [String(m.user_id ?? ""), String(m.plan_id ?? ""), m.plan_name ?? ""]
                  .join(" ")
                  .toLowerCase()
                  .includes(memberTrimmedKeyword)
          )
        : members;

    const memberTotalPages = Math.max(1, Math.ceil(membersTotal / MEMBER_PAGE_SIZE));
    const enabledPlanCount = plans.filter((p) => p.status === 1).length;

    // 会员表里 plan_name 可能缺失，用已加载的套餐列表兜底
    const planNameById = new Map(plans.map((p) => [String(p.id), p.name]));

    // 移动端(<640px)：grid-cols-1 让每个单元格竖排成卡片；≥640px 恢复表格式列布局。
    // min-w 只写在 sm: 以上 —— 窄屏若也撑宽，卡片会被拉出横向滚动。
    const planGrid = "sm:grid-cols-[minmax(0,1fr)_160px_92px_88px_64px_124px]";
    const planMinW = "sm:min-w-[800px]";
    const memberGrid = "sm:grid-cols-[110px_minmax(0,1fr)_80px_140px_140px_80px_72px]";
    const memberMinW = "sm:min-w-[880px]";

    return (
        // admin-card：吃掉剩余高度，列表在卡片内部滚动，不顶高整页
        <div className="admin-card">
            {/* ===== 统计磁贴：固定在卡片顶部（shrink-0），不随列表滚动 ===== */}
            <div className="grid shrink-0 grid-cols-2 gap-2 border-b p-3 md:grid-cols-4">
                <div className="rounded-lg border bg-muted/40 px-3 py-2">
                    <p className="text-xs text-muted-foreground">套餐总数</p>
                    <p className="text-lg font-semibold tabular-nums text-muted-foreground/80">{plans.length}</p>
                </div>
                <div className="rounded-lg border bg-muted/40 px-3 py-2">
                    <p className="text-xs text-muted-foreground">启用中套餐</p>
                    <p className="text-lg font-semibold tabular-nums text-green-600 dark:text-green-400">
                        {enabledPlanCount}
                    </p>
                </div>
                <div className="rounded-lg border bg-muted/40 px-3 py-2">
                    <p className="text-xs text-muted-foreground">会员总数</p>
                    <p className="text-lg font-semibold tabular-nums text-primary">{membersTotal}</p>
                </div>
                <div className="rounded-lg border bg-muted/40 px-3 py-2">
                    <p className="text-xs text-muted-foreground">当前页会员</p>
                    <p className="text-lg font-semibold tabular-nums text-orange-600 dark:text-orange-400">
                        {members.length}
                    </p>
                </div>
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
                                <Select
                                    value={planStatus}
                                    onValueChange={(v) => {
                                        setPlanStatus(v);
                                        setPlanPage(1);
                                    }}
                                >
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
                                    onChange={(e) => {
                                        setPlanKeyword(e.target.value);
                                        setPlanPage(1);
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
                                onClick={() => setRefreshKey((k) => k + 1)}
                            >
                                <RefreshCw className="size-4" />
                            </Button>
                            <Button size="sm" className="h-9 rounded-xl text-xs" onClick={openCreate}>
                                <Plus className="size-3.5" />
                                新增方案
                            </Button>
                        </>
                    ) : (
                        <>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                状态
                                <Select
                                    value={memberStatus}
                                    onValueChange={(v) => {
                                        setMemberStatus(v);
                                        setMemberPage(1);
                                    }}
                                >
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
                                    placeholder="按用户 ID / 方案名过滤本页…"
                                    className="h-9 w-52 rounded-xl pl-8 text-xs"
                                />
                            </div>
                            <Button
                                variant="outline"
                                size="icon-sm"
                                aria-label="刷新"
                                title="刷新"
                                className="size-9 rounded-xl"
                                onClick={() => setRefreshKey((k) => k + 1)}
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
                            <span>价格（元）</span>
                            <span className="text-center">时长</span>
                            <span className="text-center">状态</span>
                            <span className="text-center">排序</span>
                            <span className="text-right">操作</span>
                        </div>

                        {plansLoading ? (
                            <div className="py-12 text-center text-sm text-muted-foreground">加载中…</div>
                        ) : pagedPlans.length === 0 ? (
                            <div className="flex min-h-56 flex-col items-center justify-center gap-1.5 px-4 py-12 text-sm text-muted-foreground">
                                <Layers className="size-8 opacity-40" />
                                <span>
                                    {planStatus !== "all" || planKeyword
                                        ? "没有匹配的会员方案"
                                        : "暂无会员方案，点击「新增方案」创建第一条"}
                                </span>
                            </div>
                        ) : (
                            pagedPlans.map((plan) => {
                                const badge = planStatusBadge(plan.status);
                                const struck =
                                    plan.original_price !== undefined && Number(plan.original_price) > Number(plan.price ?? 0);
                                return (
                                    <div
                                        key={plan.id}
                                        className={`grid grid-cols-1 items-center gap-x-3 gap-y-2 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/40 sm:gap-y-1 ${planMinW} ${planGrid}`}
                                    >
                                        <div className="min-w-0">
                                            <div className="truncate font-medium text-foreground">{plan.name || "—"}</div>
                                            <div className="truncate text-xs text-muted-foreground">
                                                {plan.description || formatDateTime(plan.created_at)}
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
                                                aria-label={plan.status === 1 ? "停用方案" : "启用方案"}
                                                title={plan.status === 1 ? "停用" : "启用"}
                                                disabled={togglingId === plan.id}
                                                className={plan.status === 1 ? ACTION_TONE.block : ACTION_TONE.approve}
                                                onClick={() => handleTogglePlanStatus(plan)}
                                            >
                                                <Power className="size-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                aria-label="编辑方案"
                                                title="编辑"
                                                className={ACTION_TONE.edit}
                                                onClick={() => openEdit(plan)}
                                            >
                                                <Pencil className="size-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                aria-label="删除方案"
                                                title="删除"
                                                className={ACTION_TONE.delete}
                                                onClick={() => handleDeletePlan(plan)}
                                            >
                                                <Trash2 className="size-4" />
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* 分页：固定在卡片底部；套餐接口无分页字段，按已加载列表本地分页 */}
                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
                        <span>
                            共 {filteredPlans.length} 个方案 · 第 {planSafePage} / {planTotalPages} 页
                        </span>
                        <PaginationControls
                            page={planSafePage}
                            totalPages={planTotalPages}
                            onPageChange={setPlanPage}
                            disabled={plansLoading}
                        />
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

                        {membersLoading ? (
                            <div className="py-12 text-center text-sm text-muted-foreground">加载中…</div>
                        ) : visibleMembers.length === 0 ? (
                            <div className="flex min-h-56 flex-col items-center justify-center gap-1.5 px-4 py-12 text-sm text-muted-foreground">
                                <Users className="size-8 opacity-40" />
                                <span>
                                    {memberStatus !== "all" || memberKeyword ? "没有匹配的会员" : "暂无会员数据"}
                                </span>
                            </div>
                        ) : (
                            visibleMembers.map((member, index) => {
                                const memberTag = memberBadge(member.is_member);
                                const expiredTag = expiredBadge(member.is_expired);
                                return (
                                    <div
                                        key={`${member.id ?? member.user_id}-${member.plan_id}-${index}`}
                                        className={`grid grid-cols-1 items-center gap-x-3 gap-y-2 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/40 sm:gap-y-1 ${memberMinW} ${memberGrid}`}
                                    >
                                        <div className="min-w-0">
                                            <span className="font-mono text-xs text-muted-foreground">
                                                <span className="mr-1 font-sans sm:hidden">用户</span>
                                                {member.user_id ?? "—"}
                                            </span>
                                        </div>
                                        <div className="min-w-0 truncate font-medium text-foreground">
                                            {member.plan_name || planNameById.get(String(member.plan_id)) || "—"}
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
                                                onClick={() => setDetail(member)}
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
                        <span>
                            共 {membersTotal} 位会员 · 第 {memberPage} / {memberTotalPages} 页
                        </span>
                        <PaginationControls
                            page={memberPage}
                            totalPages={memberTotalPages}
                            onPageChange={setMemberPage}
                            disabled={membersLoading}
                        />
                    </div>
                </>
            )}

            {/* ===== 新增 / 编辑方案弹窗 ===== */}
            {(editingPlan || createOpen) && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={closeDialog}>
                    <div
                        className="w-full max-w-xl rounded-xl border bg-card p-5 shadow-xl"
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-base font-semibold">
                                {editingPlan ? `编辑方案「${editingPlan.name}」` : "新增会员方案"}
                            </h3>
                            <button
                                type="button"
                                onClick={closeDialog}
                                aria-label="关闭"
                                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <label className="block">
                                    <span className="mb-1 block text-xs font-medium text-muted-foreground">方案名称（必填）</span>
                                    <Input
                                        value={form.name}
                                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                                        placeholder="如：年度会员"
                                    />
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-xs font-medium text-muted-foreground">状态</span>
                                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="选择状态" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {PLAN_STATUS_OPTIONS.map((o) => (
                                                <SelectItem key={o.value} value={o.value}>
                                                    {o.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </label>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <label className="block">
                                    <span className="mb-1 block text-xs font-medium text-muted-foreground">价格（元/必填）</span>
                                    <Input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={form.price}
                                        onChange={(e) => setForm({ ...form, price: e.target.value })}
                                        placeholder="99.00"
                                    />
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-xs font-medium text-muted-foreground">原价（元/可选）</span>
                                    <Input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={form.original_price}
                                        onChange={(e) => setForm({ ...form, original_price: e.target.value })}
                                        placeholder="留空则不显示"
                                    />
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-xs font-medium text-muted-foreground">时长（天）</span>
                                    <Input
                                        type="number"
                                        min={1}
                                        value={form.duration_days}
                                        onChange={(e) => setForm({ ...form, duration_days: e.target.value })}
                                    />
                                </label>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <label className="block">
                                    <span className="mb-1 block text-xs font-medium text-muted-foreground">排序值</span>
                                    <Input
                                        type="number"
                                        value={form.sort_order}
                                        onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                                        placeholder="越小越靠前"
                                    />
                                </label>
                                <div className="flex items-end pb-2 text-xs text-muted-foreground/80">
                                    预览：¥{(Number(form.price) || 0).toFixed(2)} / {form.duration_days || "0"} 天
                                </div>
                            </div>
                            <label className="block">
                                <span className="mb-1 block text-xs font-medium text-muted-foreground">方案描述</span>
                                <Input
                                    value={form.description}
                                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                                    placeholder="简要描述套餐权益"
                                />
                            </label>
                            <p className="text-xs text-muted-foreground/70">
                                价格按「元」填写，提交时换算成后端使用的「分」。
                            </p>
                            <div className="flex justify-end gap-2 pt-2">
                                <Button variant="outline" onClick={closeDialog}>
                                    取消
                                </Button>
                                <Button onClick={handleSavePlan} disabled={savingPlan}>
                                    {savingPlan ? "保存中…" : editingPlan ? "保存修改" : "创建方案"}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== 会员详情弹窗（只读：远端没有调整单个会员的端点，官方前端也只调列表） ===== */}
            {detail && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setDetail(null)}>
                    <div
                        className="w-full max-w-lg rounded-xl border bg-card p-5 shadow-xl"
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-base font-semibold">会员详情 · 用户 #{detail.user_id ?? "—"}</h3>
                            <button
                                type="button"
                                onClick={() => setDetail(null)}
                                aria-label="关闭"
                                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-3 text-xs">
                            <Meta label="会员记录 ID" value={detail.id ?? "—"} />
                            <Meta label="用户 ID" value={detail.user_id ?? "—"} />
                            <Meta
                                label="方案"
                                value={detail.plan_name || planNameById.get(String(detail.plan_id)) || "—"}
                            />
                            <Meta label="方案 ID" value={detail.plan_id ?? "—"} />
                            <Meta
                                label="是否会员"
                                value={
                                    <span
                                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${memberBadge(detail.is_member).cls}`}
                                    >
                                        {memberBadge(detail.is_member).label}
                                    </span>
                                }
                            />
                            <Meta
                                label="状态"
                                value={
                                    <span
                                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${expiredBadge(detail.is_expired).cls}`}
                                    >
                                        {expiredBadge(detail.is_expired).label}
                                    </span>
                                }
                            />
                            <Meta label="开始时间" value={formatDateTime(detail.start_time)} />
                            <Meta label="到期时间" value={formatDateTime(detail.expire_time)} />
                            <Meta label="创建时间" value={formatDateTime(detail.created_at)} />
                        </div>
                        <div className="mt-4 flex justify-end">
                            <Button variant="outline" onClick={() => setDetail(null)}>
                                关闭
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
