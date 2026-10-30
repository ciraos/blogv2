"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "nextjs-toploader/app";
import { ExternalLink, FileText, Loader2, Pencil, Plus, RefreshCw, Search, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-provider";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/pagination-controls";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deleteAdminPageApi, getAdminPagesApi, initializeAdminPagesApi } from "@/lib/api";
import type { AdminPage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ACTION_TONE } from "@/lib/action-tones";

const PAGE_SIZE = 10;

type PublishFilter = "all" | "published" | "draft";

/** ISO → YYYY-MM-DD HH:MM */
function formatTime(iso?: string): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 页面管理（对齐官方后台）：留言板 / cookies / 隐私协议 / 版权协议这类自定义页面。
 * 列表来自远端 GET /pages（经同源代理 /api/admin/pages，需管理员），支持搜索、发布状态筛选、分页；
 * 可新建 / 编辑 / 删除页面，也可一键初始化默认页面。
 *
 * 新建 / 编辑**不在这里弹窗**：改跳整页表单 /admin/page-management/new 与 /admin/page-management/[id]/edit
 * （版式与文章编辑器同构，见 src/components/admin/page-form.tsx）。原来 max-w-3xl 的居中弹窗
 * 只能塞一个 rows=8 的小框，写长内容很难受 —— 所以这一页只负责列表。
 */
export function PageManager() {
    const router = useRouter();
    const [pages, setPages] = useState<AdminPage[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    const [publishFilter, setPublishFilter] = useState<PublishFilter>("all");
    const [busy, setBusy] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    // 应用内确认弹窗（替代 window.confirm，见 components/confirm-provider.tsx）
    const confirm = useConfirm();

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getAdminPagesApi({
                page,
                page_size: PAGE_SIZE,
                search: search || undefined,
                is_published: publishFilter === "all" ? undefined : publishFilter === "published",
            });
            setPages(data.pages ?? []);
            setTotal(data.total ?? 0);
        } catch (e) {
            setError(e instanceof Error ? e.message : "页面列表加载失败");
            setPages([]);
        } finally {
            setLoading(false);
        }
    }, [page, search, publishFilter]);

    useEffect(() => {
        // 延后到下一个 tick：effect 内同步 setState 会触发级联渲染（react-hooks/set-state-in-effect）
        const timer = setTimeout(() => void load(), 0);
        return () => clearTimeout(timer);
    }, [load, refreshKey]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const reload = () => setRefreshKey((k) => k + 1);

    const submitSearch = () => {
        setPage(1);
        setSearch(searchInput.trim());
    };

    const handleDelete = async (item: AdminPage) => {
        if (!(await confirm({ title: `确定删除页面「${item.title}」（${item.path}）吗？`, danger: true }))) return;
        setBusy(true);
        try {
            await deleteAdminPageApi(item.id);
            toast.success("页面已删除");
            reload();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "删除失败");
        } finally {
            setBusy(false);
        }
    };

    const handleInitialize = async () => {
        if (
            !(await confirm({
                title: "初始化默认页面？",
                description: "会补齐 /privacy、/cookies、/copyright 等（已存在的不会被覆盖）。",
            }))
        )
            return;
        setBusy(true);
        try {
            await initializeAdminPagesApi();
            toast.success("默认页面已初始化");
            reload();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "初始化失败");
        } finally {
            setBusy(false);
        }
    };

    return (
        // admin-card：吃掉剩余高度；工具栏 / 分页固定，表格在 admin-scroll 内部滚动
        <div className="admin-card">
            {/* ===== 工具栏（固定在卡片顶部，不随表格滚动） ===== */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b p-3">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") submitSearch();
                            }}
                            placeholder="搜索标题 / 路径…"
                            className="h-9 w-48 pl-8 text-xs sm:w-64"
                        />
                    </div>
                    <Button variant="outline" size="sm" className="h-9 rounded-xl text-xs" onClick={submitSearch}>
                        查询
                    </Button>
                    <Select
                        value={publishFilter}
                        onValueChange={(v) => {
                            setPublishFilter(v as PublishFilter);
                            setPage(1);
                        }}
                    >
                        <SelectTrigger className="h-9 w-32 rounded-xl text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">全部状态</SelectItem>
                            <SelectItem value="published">已发布</SelectItem>
                            <SelectItem value="draft">未发布</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button
                        variant="outline"
                        size="icon-sm"
                        aria-label="刷新"
                        title="刷新"
                        className="size-9 rounded-xl"
                        disabled={loading}
                        onClick={() => void load()}
                    >
                        <RefreshCw className={cn("size-4", loading && "animate-spin")} />
                    </Button>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-9 rounded-xl text-xs"
                        disabled={busy}
                        onClick={() => void handleInitialize()}
                    >
                        <Sparkles className="size-3.5" />
                        初始化默认页面
                    </Button>
                    <Button
                        size="sm"
                        className="h-9 rounded-xl text-xs"
                        disabled={busy}
                        onClick={() => router.push("/admin/page-management/new")}
                    >
                        <Plus className="size-3.5" />
                        新建页面
                    </Button>
                </div>
            </div>

            {/* ===== 列表（唯一的滚动区：状态提示与表格都在 admin-scroll 内） ===== */}
            {loading ? (
                <div className="admin-scroll flex min-h-64 items-center justify-center text-sm text-muted-foreground">
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    加载中…
                </div>
            ) : error ? (
                <div className="admin-scroll flex min-h-64 flex-col items-center justify-center gap-2 text-sm">
                    <p className="text-destructive">{error}</p>
                    <Button variant="outline" size="sm" onClick={() => void load()}>
                        重试
                    </Button>
                </div>
            ) : pages.length === 0 ? (
                <div className="admin-scroll flex min-h-64 flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
                    <FileText className="size-8 opacity-40" />
                    {search || publishFilter !== "all" ? "没有匹配的页面" : "还没有自定义页面"}
                </div>
            ) : (
                <div className="admin-scroll">
                    {/* 表头：任何宽度都显示（窄屏横向滚动时需要列名）。
                        窄屏那 356px 里，固定列（操作）就占掉 120px，所以：
                          · 标题列保底 220px —— 用 1fr 会被压到 100 来 px、只剩几个字；
                          · 操作列 120px（三个图标按钮够用）、路径 140px，把宽度让给标题。 */}
                    <div className="admin-sticky-head admin-list-head min-w-[820px] grid-cols-[minmax(220px,1fr)_140px_84px_60px_56px_132px_120px] items-center gap-3 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground grid">
                        <span>标题</span>
                        <span>路径</span>
                        <span>状态</span>
                        <span className="text-center">评论</span>
                        <span className="text-center">排序</span>
                        <span>更新时间</span>
                        <span className="text-right">操作</span>
                    </div>
                    <div className="min-w-[820px]">
                        {pages.map((item) => (
                            <div
                                key={item.id}
                                className="grid admin-list-row items-center gap-x-3 gap-y-1 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/40 grid-cols-[minmax(220px,1fr)_140px_84px_60px_56px_132px_120px]"
                            >
                                <div className="min-w-0">
                                    <div className="truncate font-medium" title={item.title}>
                                        {item.title}
                                    </div>
                                    {item.description && (
                                        <div className="truncate text-xs text-muted-foreground" title={item.description}>
                                            {item.description}
                                        </div>
                                    )}
                                </div>
                                <span className="truncate font-mono text-xs text-muted-foreground" title={item.path}>
                                    {item.path}
                                </span>
                                <span>
                                    <Badge
                                        variant="outline"
                                        className={cn(
                                            "text-[10px] font-medium",
                                            item.is_published
                                                ? "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400"
                                                : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                        )}
                                    >
                                        {item.is_published ? "已发布" : "未发布"}
                                    </Badge>
                                </span>
                                <span className="text-center text-xs text-muted-foreground">
                                    {item.show_comment ? "开" : "关"}
                                </span>
                                <span className="text-center text-xs tabular-nums text-muted-foreground">{item.sort}</span>
                                <span className="text-xs text-muted-foreground">{formatTime(item.updated_at)}</span>
                                <span className="flex justify-end gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="打开页面"
                                        title="打开前台页面"
                                        className={ACTION_TONE.view}
                                        onClick={() => window.open(item.path, "_blank", "noopener")}
                                    >
                                        <ExternalLink className="size-3.5" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="编辑"
                                        title="编辑"
                                        className={ACTION_TONE.edit}
                                        onClick={() => router.push(`/admin/page-management/${item.id}/edit`)}
                                    >
                                        <Pencil className="size-3.5" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="删除"
                                        title="删除"
                                        className={ACTION_TONE.delete}
                                        disabled={busy}
                                        onClick={() => void handleDelete(item)}
                                    >
                                        <Trash2 className="size-3.5" />
                                    </Button>
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ===== 分页（固定在卡片底部，不随表格滚动） ===== */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t p-3 text-xs text-muted-foreground">
                <span>
                    共 <span className="font-medium text-foreground">{total}</span> 个页面 · 第 {page} / {totalPages} 页
                </span>
                <PaginationControls
                    page={page}
                    totalPages={totalPages}
                    disabled={loading}
                    onPageChange={setPage}
                />
            </div>
        </div>
    );
}
