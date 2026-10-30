"use client";
import { useEffect, useState } from "react";
import {
    AlignLeft,
    ArrowDownAZ,
    ArrowUpAZ,
    ArrowUpDown,
    BadgeCheck,
    Camera,
    Check,
    FolderOpen,
    Globe,
    Image as ImageIcon,
    Loader2,
    Mail,
    Pencil,
    Rss,
    Tag,
    Trash2,
    Type,
    X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-provider";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/pagination-controls";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    batchDeleteAdminLinksApi,
    deleteAdminLinkApi,
    getAdminLinkCategoriesApi,
    getAdminLinkTagsApi,
    getAdminLinksApi,
    reviewAdminLinkApi,
    updateAdminLinkApi,
} from "@/lib/api";
import { cn, resolveAssetUrl } from "@/lib/utils";
import { ACTION_TONE } from "@/lib/action-tones";
import type { FriendLink, LinkCategory, LinkTag } from "@/types/links";

/** 与 FriendsFilters 联动的筛选条件 */
export interface FriendsFilterState {
    keyword: string;
    status: string;
    category: string;
    tag: string;
}

const PAGE_SIZES = [10, 20, 50];

/**
 * 列表行栅格：选择 / 网站信息 / 描述 / 分类标签 / 状态 / 操作。
 * 列宽沿用改造前 flex 布局里的固定值：描述 w-40=160px、分类标签 w-28=112px、状态 w-20=80px；
 * 网站信息原本是 flex-1，等价换算成 minmax(0,1fr)；选择列与其它后台管理页一致取 28px。
 * 操作列留 136px：待审行有 4 个 28px 图标按钮（通过 / 拒绝 / 编辑 / 删除），96px 会溢出。
 *
 * 窄屏**不拆成卡片**：表格整体保持 880px 宽、由 .admin-scroll 横向滚动，
 * 只有「操作」列 sticky 在右侧（见下面的 STICKY_ACTION_BASE），滚到哪都能点到编辑/删除。
 */
const ROW_GRID = "grid-cols-[28px_minmax(0,1fr)_160px_112px_80px_136px]";

/**
 * 右侧「操作」列的固定写法：sticky 到滚动容器右边缘，永远可见。
 * 左侧一条分隔线把「固定列」和「可滚动区」分开。
 * 表头与行内单元格都要自带**不透明底色**（行 bg-card / 表头 bg-muted），
 * 否则横向滚动时被它盖住的列会从底下透出来、文字叠在一起。
 */
const STICKY_ACTION_BASE = "sticky right-0 border-l border-border/60 pl-2";

/** 状态 → 中文 + 色块（背景淡色 + 同色系文字） */
function statusBadge(status: string) {
    const s = (status || "").toUpperCase();
    if (s === "APPROVED" || s === "已通过") {
        return { label: "已通过", cls: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400" };
    }
    if (s === "PENDING" || s === "待审核") {
        return { label: "待审核", cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400" };
    }
    if (s === "REJECTED" || s === "已拒绝") {
        return { label: "已拒绝", cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400" };
    }
    return { label: status || "已失效", cls: "bg-muted text-muted-foreground" };
}

/** 友链头像（同友链界面）：有 logo 显示 logo，加载失败/占位/缺失时兜底为网站名称首字母 */
function LinkAvatarCell({ link }: { link: FriendLink }) {
    const [failed, setFailed] = useState(false);
    const logo = resolveAssetUrl(link.logo);
    // 数据里直接填了占位图（如 404_1.avif）的视为无头像
    const isPlaceholderLogo = !!logo && /404|placeholder|default/i.test(logo);

    if (!logo || failed || isPlaceholderLogo) {
        return (
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {link.name?.slice(0, 1) || "?"}
            </div>
        );
    }
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={logo}
            alt={link.name}
            loading="lazy"
            className="size-8 shrink-0 rounded-full border object-contain"
            onError={() => setFailed(true)}
        />
    );
}

/** 管理员友链表格：全选 + 网站信息/描述/分类标签/状态/操作 + 分页 */
export function FriendsTable({ filters }: { filters: FriendsFilterState }) {
    const [links, setLinks] = useState<FriendLink[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [jumpPage, setJumpPage] = useState("");
    // 网站名称排序：""（默认/后端顺序）→ "asc"（A→Z）→ "desc"（Z→A），点击循环切换
    const [nameSort, setNameSort] = useState<"" | "asc" | "desc">("");

    // ===== 编辑弹窗状态 =====
    const [editing, setEditing] = useState<FriendLink | null>(null);
    const [categories, setCategories] = useState<LinkCategory[]>([]);
    const [tags, setTags] = useState<LinkTag[]>([]);
    const [saving, setSaving] = useState(false);
    /** 正在删除的友链 id（单条删除时禁用该行按钮，避免重复提交） */
    const [deletingId, setDeletingId] = useState<number | null>(null);
    /** 正在审核中的友链 id（禁用行内按钮，避免连点） */
    const [reviewingId, setReviewingId] = useState<number | null>(null);
    /** 批量删除进行中 */
    const [batchDeleting, setBatchDeleting] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    /** 分类/标签下拉的重新拉取计数（顶部分类标签弹窗改完后由 blog-admin:links-changed 递增） */
    const [taxonomyKey, setTaxonomyKey] = useState(0);
    const [form, setForm] = useState({
        name: "",
        url: "",
        logo: "",
        description: "",
        rss: "",
        siteshot: "",
        email: "",
        status: "",
        category_id: "",
        tag_id: "",
        sort_order: "",
        skip_health_check: false,
    });

    // 应用内确认弹窗（替代 window.confirm，见 components/confirm-provider.tsx）
    const confirm = useConfirm();

    const STATUS_OPTIONS = [
        { value: "APPROVED", label: "已通过" },
        { value: "PENDING", label: "待审核" },
        { value: "REJECTED", label: "已拒绝" },
        { value: "INVALID", label: "已失效" },
    ];

    // 加载分类/标签下拉数据
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [cs, ts] = await Promise.all([
                    getAdminLinkCategoriesApi(),
                    getAdminLinkTagsApi(),
                ]);
                if (!cancelled) {
                    setCategories(cs);
                    setTags(ts);
                }
            } catch {
                // 分类/标签加载失败不阻塞编辑
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [taxonomyKey]);

    // 新建友链 / 改分类标签 / 导入成功 / 友链排序保存后刷新列表（顶部按钮与「友链排序」弹窗派发）
    useEffect(() => {
        const onChanged = () => {
            setRefreshKey((k) => k + 1);
            setTaxonomyKey((k) => k + 1);
            // 顺手清掉表头「按名称排序」这个纯客户端的本地排序：排序弹窗刚刚改了后端顺序，
            // 如果本地名称排序还在生效，重新拉回来的列表看起来会毫无变化（实际顺序已经变了）。
            setNameSort("");
        };
        window.addEventListener("blog-admin:links-changed", onChanged);
        return () => window.removeEventListener("blog-admin:links-changed", onChanged);
    }, []);

    /** 打开编辑：回填当前友链字段 */
    const openEdit = (link: FriendLink) => {
        setEditing(link);
        setForm({
            name: link.name || "",
            url: link.url || "",
            logo: link.logo || "",
            description: link.description || "",
            rss: link.rss || "",
            siteshot: link.siteshot || "",
            email: link.email || "",
            status: link.status || "",
            category_id: link.category?.id ? String(link.category.id) : "",
            tag_id: link.tag?.id ? String(link.tag.id) : "",
            sort_order: link.sort_order ? String(link.sort_order) : "",
            skip_health_check: !!link.skip_health_check,
        });
    };

    /** 保存编辑：PUT /api/admin/links/{id} → 刷新列表 */
    const handleSave = async () => {
        if (!editing) return;
        if (!form.name || !form.url) {
            toast.error("名称和网址必填");
            return;
        }
        setSaving(true);
        try {
            await updateAdminLinkApi(editing.id, {
                name: form.name,
                url: form.url,
                logo: form.logo,
                description: form.description,
                rss: form.rss || undefined,
                siteshot: form.siteshot || undefined,
                email: form.email || undefined,
                status: form.status || undefined,
                category_id: form.category_id ? Number(form.category_id) : undefined,
                tag_id: form.tag_id ? Number(form.tag_id) : undefined,
                sort_order: form.sort_order ? Number(form.sort_order) : undefined,
                skip_health_check: form.skip_health_check,
            });
            toast.success("保存成功");
            setEditing(null);
            setRefreshKey((k) => k + 1);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "保存失败");
        } finally {
            setSaving(false);
        }
    };

    /**
     * 删除单条友链：DELETE /api/admin/links/{id}（远端 /links/:id）。
     * 删除的是当前页最后一条且不在第一页时，往前翻一页，避免停在空页上。
     */
    const handleDelete = async (link: FriendLink) => {
        if (
            !(await confirm({
                title: `确定删除友链「${link.name}」吗？`,
                description: `${link.url}\n删除后不可恢复。`,
                danger: true,
            }))
        )
            return;
        setDeletingId(link.id);
        try {
            await deleteAdminLinkApi(link.id);
            toast.success("友链已删除");
            if (links.length === 1 && page > 1) setPage((p) => p - 1);
            else setRefreshKey((k) => k + 1);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "删除失败");
        } finally {
            setDeletingId(null);
        }
    };

    /**
     * 审核友链：PUT /api/admin/links/{id}/review（远端 /links/:id/review）。
     *
     * 只有 PENDING 的行显示这两个按钮。拒绝时不弹输入框，直接不带原因提交
     * （远端 reject_reason 可选；将来要收集原因，在这里加一层 ConfirmProvider 的输入即可）。
     */
    const handleReview = async (link: FriendLink, status: "APPROVED" | "REJECTED") => {
        if (
            !(await confirm({
                title: status === "APPROVED" ? `通过友链「${link.name}」？` : `拒绝友链「${link.name}」？`,
                description:
                    status === "APPROVED"
                        ? `${link.url}\n通过后会出现在前台友链页。`
                        : `${link.url}\n拒绝后不再展示，申请记录保留。`,
                danger: status === "REJECTED",
            }))
        )
            return;

        setReviewingId(link.id);
        try {
            await reviewAdminLinkApi(link.id, status);
            toast.success(status === "APPROVED" ? "已通过" : "已拒绝");
            setRefreshKey((k) => k + 1);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "审核失败");
        } finally {
            setReviewingId(null);
        }
    };

    /**
     * 批量删除：DELETE /api/admin/links/batch-delete（body { ids }，远端限制 1~100 条）。
     * 后端返回逐项结果（success/failed），失败项列出原因，不是全有全无。
     */
    const handleBatchDelete = async () => {
        const ids = [...selected];
        if (ids.length === 0) return;
        if (ids.length > 100) {
            toast.error("一次最多删除 100 条友链");
            return;
        }
        if (!(await confirm({ title: `确定删除选中的 ${ids.length} 条友链吗？`, description: "删除后不可恢复。", danger: true }))) return;
        setBatchDeleting(true);
        try {
            const result = await batchDeleteAdminLinksApi(ids);
            const success = result?.success ?? ids.length;
            const failed = result?.failed ?? 0;
            if (failed > 0) {
                const reason = result?.failed_list?.[0]?.reason;
                toast.warning(`已删除 ${success} 条，${failed} 条失败`, {
                    description: reason ? `失败原因：${reason}` : undefined,
                });
            } else {
                toast.success(`已删除 ${success} 条友链`);
            }
            setSelected(new Set());
            setRefreshKey((k) => k + 1);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "批量删除失败");
        } finally {
            setBatchDeleting(false);
        }
    };

    // 排序只作用于当前页已拉取的数据；刷新/翻页后回到后端顺序
    const sortedLinks = (() => {
        if (!nameSort || links.length === 0) return links;
        return [...links].sort((a, b) => {
            const na = (a.name || "").localeCompare(b.name || "", "zh-CN");
            return nameSort === "asc" ? na : -na;
        });
    })();

    // 筛选条件变化时回到第一页（setTimeout 规避 React Compiler 的 effect 内同步 setState 规则）
    useEffect(() => {
        const timer = setTimeout(() => setPage(1), 0);
        return () => clearTimeout(timer);
    }, [filters.keyword, filters.status, filters.category, filters.tag]);

    // 拉取友链列表（浏览器自动携带登录 cookie）
    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(() => setLoading(true), 0);
        getAdminLinksApi({
            page,
            pageSize,
            name: filters.keyword || undefined,
            status: filters.status || undefined,
            category_id: filters.category || undefined,
            tag_id: filters.tag || undefined,
        })
            .then((data) => {
                if (cancelled) return;
                setLinks(data.list ?? []);
                setTotal(data.total ?? 0);
                setSelected(new Set());
            })
            .catch(() => {
                if (!cancelled) toast.error("友链列表加载失败");
            })
            .finally(() => {
                if (!cancelled) {
                    clearTimeout(timer);
                    setLoading(false);
                }
            });
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [page, pageSize, filters.keyword, filters.status, filters.category, filters.tag, refreshKey]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const allChecked = links.length > 0 && selected.size === links.length;

    const toggleAll = () => {
        if (allChecked) {
            setSelected(new Set());
        } else {
            setSelected(new Set(links.map((l) => l.id)));
        }
    };
    const toggleOne = (id: number) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };
    const goPage = (p: number) => {
        if (p < 1 || p > totalPages) return;
        setPage(p);
        setJumpPage("");
    };
    const jump = () => {
        const p = parseInt(jumpPage, 10);
        if (!Number.isNaN(p)) goPage(p);
    };

    return (
        // 本组件要同时产出「表格滚动区 + 卡片底部工具栏」两块，用 Fragment 让它们
        // 直接成为上方 admin-card 的 flex 子项（滚动只发生在 admin-scroll 里）
        <>
            {/* 表格滚动区：只有这块纵向 / 横向滚动（表头吸顶）；筛选栏与卡片底部工具栏都不动 */}
            <div className="admin-scroll">
                {/* 表头：任何宽度都显示（窄屏横向滚动时需要列名，否则分不清哪列是什么） */}
                <div
                    className={cn(
                        "admin-sticky-head grid min-w-[880px] items-center gap-3 whitespace-nowrap border-b px-4 py-2.5 text-xs font-medium text-muted-foreground",
                        ROW_GRID
                    )}
                >
                    <input
                        type="checkbox"
                        checked={allChecked}
                        onChange={toggleAll}
                        aria-label="全选"
                        className="size-4 shrink-0 accent-primary"
                    />
                    <span className="flex items-center gap-1 whitespace-nowrap">
                        网站信息
                        {/* 网站名称首字母排序：点击循环 默认 → A→Z → Z→A */}
                        <button
                            type="button"
                            onClick={() => setNameSort((v) => (v === "" ? "asc" : v === "asc" ? "desc" : ""))}
                            title={nameSort === "asc" ? "按名称升序（点击切为降序）" : nameSort === "desc" ? "按名称降序（点击取消排序）" : "按名称排序（仅当前页，不改变后端顺序）"}
                            aria-label="按网站名称排序"
                            className={`flex size-6 shrink-0 items-center justify-center rounded transition-colors ${nameSort ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                }`}
                        >
                            {nameSort === "asc" ? <ArrowDownAZ className="size-3.5" /> : nameSort === "desc" ? <ArrowUpAZ className="size-3.5" /> : <ArrowDownAZ className="size-3.5 opacity-60" />}
                        </button>
                    </span>
                    <span className="truncate">描述</span>
                    <span>分类 / 标签</span>
                    <span className="text-center">状态</span>
                    {/* 操作列与行内单元格一样固定在右侧，否则横向滚动后表头会跟内容对不上。
                        表头那格必须自带底色（bg-muted）：表头整体虽有背景，但被滚过去的列名会从这格底下透出来。 */}
                    <span className={cn("bg-muted text-right", STICKY_ACTION_BASE)}>操作</span>
                </div>

                {/* 表体：任何宽度都撑到 880px，由外层 admin-scroll 横向滚动（操作列 sticky 在右） */}
                <div className="min-w-[880px]">
                    {loading ? (
                        <div className="py-12 text-center text-sm text-muted-foreground">加载中…</div>
                    ) : sortedLinks.length === 0 ? (
                        <div className="py-12 text-center text-sm text-muted-foreground">暂无友链</div>
                    ) : (
                        sortedLinks.map((link) => {
                            const badge = statusBadge(link.status);
                            return (
                                <div
                                    key={link.id}
                                    className={cn(
                                        // 任何宽度都是同一套 6 列栅格（表头也显示），窄屏靠 .admin-scroll 横向滚动；
                                        // 只有最右的「操作」列 sticky 固定，滚到哪都能点到编辑/删除。
                                        "grid items-center gap-x-3 gap-y-1 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/40",
                                        ROW_GRID
                                    )}
                                >
                                    {/* 单元格 1：选择框 */}
                                    <span className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={selected.has(link.id)}
                                            onChange={() => toggleOne(link.id)}
                                            aria-label={`选择 ${link.name}`}
                                            className="size-4 shrink-0 accent-primary"
                                        />
                                    </span>
                                    {/* 网站信息 */}
                                    <div className="flex min-w-0 items-center gap-2.5">
                                        <LinkAvatarCell link={link} />
                                        <div className="min-w-0">
                                            <div className="truncate font-medium">{link.name}</div>
                                            {/* URL：可点击外链，鲜艳蓝色与文字区分（截断处 hover 可看全文）。
                                                只做截断不做换行：一行 URL 撑成三行会把整行拉高。 */}
                                            {link.url && (
                                                <a
                                                    href={link.url.startsWith("http") ? link.url : `https://${link.url}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer nofollow"
                                                    title={link.url}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="block truncate text-xs/2.5 font-medium text-sky-500 transition-colors hover:text-sky-600 hover:underline dark:text-sky-400 dark:hover:text-sky-300"
                                                >
                                                    {link.url}
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                    {/* 描述 */}
                                    <div className="min-w-0 truncate text-xs text-muted-foreground" title={link.description}>
                                        {link.description || "-"}
                                    </div>
                                    {/* 分类 / 标签 */}
                                    <div className="min-w-0">
                                        <div className="truncate text-xs">{link.category?.name || "-"}</div>
                                        {link.tag && (
                                            <span className="mt-0.5 inline-block rounded bg-accent px-1.5 py-px text-[10px] text-accent-foreground">
                                                {link.tag.name}
                                            </span>
                                        )}
                                    </div>
                                    {/* 状态 */}
                                    <div className="text-center">
                                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                                            {badge.label}
                                        </span>
                                    </div>
                                    {/* 操作（固定列） */}
                                    <div className={cn("flex items-center justify-end gap-1 bg-card", STICKY_ACTION_BASE)}>
                                        {/* 待审的友链才有通过 / 拒绝（走 /links/{id}/review，留审核痕迹） */}
                                        {link.status === "PENDING" && (
                                            <>
                                                <Button
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    aria-label={`通过 ${link.name}`}
                                                    title="通过"
                                                    className="text-green-600 hover:bg-green-500/10 hover:text-green-700 dark:text-green-400"
                                                    disabled={reviewingId === link.id}
                                                    onClick={() => void handleReview(link, "APPROVED")}
                                                >
                                                    {reviewingId === link.id ? (
                                                        <Loader2 className="size-4 animate-spin" />
                                                    ) : (
                                                        <Check className="size-4" />
                                                    )}
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    aria-label={`拒绝 ${link.name}`}
                                                    title="拒绝"
                                                    className="text-destructive hover:bg-destructive/10"
                                                    disabled={reviewingId === link.id}
                                                    onClick={() => void handleReview(link, "REJECTED")}
                                                >
                                                    <X className="size-4" />
                                                </Button>
                                            </>
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label="编辑"
                                            title="编辑"
                                            className={ACTION_TONE.edit}
                                            onClick={() => openEdit(link)}
                                        >
                                            <Pencil className="size-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label={`删除 ${link.name}`}
                                            title="删除"
                                            className={ACTION_TONE.delete}
                                            disabled={deletingId === link.id}
                                            onClick={() => void handleDelete(link)}
                                        >
                                            {deletingId === link.id ? (
                                                <Loader2 className="size-4 animate-spin" />
                                            ) : (
                                                <Trash2 className="size-4" />
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* 底部：总数 + 每页条数 + 分页跳转（固定在卡片底部，不随表格滚动） */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                    <div>
                        共 <span className="font-medium text-foreground">{total}</span> 条友链
                        {selected.size > 0 && (
                            <span className="ml-2 text-primary">已选 {selected.size} 条</span>
                        )}
                    </div>
                    {/* 批量删除：勾选后才可用（远端 /links/batch-delete，一次最多 100 条） */}
                    {selected.size > 0 && (
                        <Button
                            variant="destructive"
                            size="sm"
                            className="h-7 gap-1 rounded-lg px-2 text-xs"
                            disabled={batchDeleting}
                            onClick={() => void handleBatchDelete()}
                        >
                            {batchDeleting ? (
                                <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                                <Trash2 className="size-3.5" />
                            )}
                            批量删除{selected.size > 0 ? `（${selected.size}）` : ""}
                        </Button>
                    )}
                    <div className="flex flex-wrap items-center gap-3">
                        {/* 每页条数 */}
                        <div className="flex items-center gap-1.5">
                            每页
                            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                                <SelectTrigger className="h-7 w-max text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {PAGE_SIZES.map((n) => (
                                        <SelectItem key={n} value={String(n)}>
                                            {n} 条
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
                {/* 页码块 + 上一页 / 下一页，再跟上页码跳转。
                    窄屏（<640px）只留页码块：「上一页/下一页」由它自带的左右箭头承担，
                    页码输入框 + 跳转按钮也一并藏起来（见 pagination-controls.tsx 的同款说明）。 */}
                <div className="flex flex-wrap items-center gap-1">
                    <PaginationControls
                        page={page}
                        totalPages={totalPages}
                        onPageChange={goPage}
                    />
                    <div className="hidden items-center gap-1 sm:flex">
                        <Input
                            value={jumpPage}
                            onChange={(e) => setJumpPage(e.target.value.replace(/\D/g, ""))}
                            onKeyDown={(e) => { if (e.key === "Enter") jump(); }}
                            placeholder="页码"
                            className="h-7 w-14 text-xs"
                            aria-label="跳转到页码"
                        />
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={jump}>
                            跳转
                        </Button>
                    </div>
                </div>
            </div>

        {/* ===== 编辑友链弹窗 ===== */}
        {editing && (
            <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                onMouseDown={() => setEditing(null)}
            >
                <div
                    className="w-full max-w-xl rounded-xl border bg-card p-5 shadow-xl"
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-base font-semibold">编辑友链：{editing.name}</h3>
                        <button
                            type="button"
                            onClick={() => setEditing(null)}
                            aria-label="关闭"
                            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                            ✕
                        </button>
                    </div>
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <label className="block">
                                <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                    <Type className="size-3.5" />
                                    名称（必填）
                                </span>
                                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                            </label>
                            <label className="block">
                                <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                    <Globe className="size-3.5" />
                                    网站地址（必填）
                                </span>
                                <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" />
                            </label>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="block">
                                <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                    <ImageIcon className="size-3.5" />
                                    头像地址
                                </span>
                                <Input value={form.logo} onChange={(e) => setForm({ ...form, logo: e.target.value })} />
                            </label>
                            <label className="block">
                                <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                    <AlignLeft className="size-3.5" />
                                    描述
                                </span>
                                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                            </label>
                        </div>
                        <label className="block rounded-lg border border-border/60 bg-muted/40 px-3 py-3">
                            <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                <Rss className="size-3.5" />
                                RSS 地址（可选）
                            </span>
                            <Input value={form.rss} onChange={(e) => setForm({ ...form, rss: e.target.value })} placeholder="https://…/feed.xml" />
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="block">
                                <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                    <Camera className="size-3.5" />
                                    网站快照（可选）
                                </span>
                                <Input value={form.siteshot} onChange={(e) => setForm({ ...form, siteshot: e.target.value })} placeholder="https://…" />
                            </label>
                            <label className="block">
                                <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                    <Mail className="size-3.5" />
                                    联系邮箱
                                </span>
                                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@example.com" />
                            </label>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
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
                                        {STATUS_OPTIONS.map((o) => (
                                            <SelectItem key={o.value} value={o.value}>
                                                {o.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </label>
                            <label className="block">
                                <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                    <FolderOpen className="size-3.5" />
                                    分类
                                </span>
                                <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="不分类" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="">不分类</SelectItem>
                                        {categories.map((c) => (
                                            <SelectItem key={c.id} value={String(c.id)}>
                                                {c.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </label>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="block">
                                <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                    <Tag className="size-3.5" />
                                    标签
                                </span>
                                <Select value={form.tag_id} onValueChange={(v) => setForm({ ...form, tag_id: v })}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="无标签" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="">无标签</SelectItem>
                                        {tags.map((t) => (
                                            <SelectItem key={t.id} value={String(t.id)}>
                                                {t.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </label>
                            <label className="block">
                                <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                    <ArrowUpDown className="size-3.5" />
                                    排序权重
                                </span>
                                <Input
                                    type="number"
                                    value={form.sort_order}
                                    onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                                    placeholder="0"
                                />
                            </label>
                        </div>
                        {/* 跳过健康检查：左侧文字 + 右侧开关（开启后背景变绿、滑块右滚） */}
                        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-green-500/20 bg-green-500/10 px-3 py-3">
                            <span className="text-xs leading-snug">
                                <span className="block font-medium text-foreground">跳过健康检查</span>
                                <span className="block text-[11px] text-muted-foreground/70">启用后后台不再对该友链执行自动健康检查</span>
                            </span>
                            <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
                                <input
                                    type="checkbox"
                                    role="switch"
                                    aria-label="跳过健康检查"
                                    checked={form.skip_health_check}
                                    onChange={(e) => setForm({ ...form, skip_health_check: e.target.checked })}
                                    className="peer sr-only"
                                />
                                <span aria-hidden className="absolute inset-0 rounded-full bg-input transition-colors peer-checked:bg-green-500" />
                                <span aria-hidden className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
                            </span>
                        </label>
                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="outline" onClick={() => setEditing(null)}>
                                取消
                            </Button>
                            <Button onClick={handleSave} disabled={saving}>
                                {saving ? "保存中…" : "保存"}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        </>
    );
}
