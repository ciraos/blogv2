"use client";

import { useEffect, useState } from "react";
import {
    AlignJustify,
    ChevronLeft,
    ChevronRight,
    Eye,
    FileText,
    FolderTree,
    Pencil,
    Plus,
    RotateCcw,
    Trash2,
    Upload,
    X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

import { getAdminArticleCategoriesApi, getAdminArticlesApi, getAdminArticleTagsApi } from "@/lib/api";
import type { PostCategory, PostItem, PostTag } from "@/types/articles";

const PAGE_SIZE = 20;

const STATUS_LABEL: Record<string, string> = {
    PUBLISHED: "已发布",
    DRAFT: "草稿",
    ARCHIVED: "已归档",
    SCHEDULED: "定时发布",
};

const STATUS_CLASS: Record<string, string> = {
    PUBLISHED: "bg-emerald-500/15 text-emerald-600",
    DRAFT: "bg-amber-500/15 text-amber-600",
    ARCHIVED: "bg-slate-500/15 text-slate-500",
    SCHEDULED: "bg-sky-500/15 text-sky-600",
};

// 状态筛选选项（「定时发布」后端枚举值待确认，暂用 SCHEDULED）
const STATUS_OPTIONS = [
    { value: "PUBLISHED", label: "已发布" },
    { value: "DRAFT", label: "草稿" },
    { value: "ARCHIVED", label: "已归档" },
    { value: "SCHEDULED", label: "定时发布" },
];

// 审核状态筛选选项（字段名 review_status、枚举待确认）
const REVIEW_OPTIONS = [
    { value: "PENDING", label: "待审核" },
    { value: "APPROVED", label: "已通过" },
    { value: "REJECTED", label: "已拒绝" },
];

function formatDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

/** /admin/post-management 文章列表：过滤（状态/审核/分类/标签）+ 搜索 + 分页 + 操作 */
export function ArticleList() {
    const [list, setList] = useState<PostItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [keyword, setKeyword] = useState("");
    const [input, setInput] = useState("");
    const [status, setStatus] = useState("");
    const [review, setReview] = useState("");
    const [category, setCategory] = useState("");
    const [tag, setTag] = useState("");
    const [categories, setCategories] = useState<PostCategory[]>([]);
    const [tags, setTags] = useState<PostTag[]>([]);
    const [catsLoading, setCatsLoading] = useState(true);
    const [tagsLoading, setTagsLoading] = useState(true);

    // 分类/标签下拉数据（挂载时加载一次）
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [cs, ts] = await Promise.all([
                    getAdminArticleCategoriesApi(),
                    getAdminArticleTagsApi(),
                ]);
                if (!cancelled) {
                    setCategories(cs);
                    setTags(ts);
                }
            } catch {
                // 分类/标签加载失败不阻塞列表
            } finally {
                if (!cancelled) {
                    setCatsLoading(false);
                    setTagsLoading(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    // 输入即搜：防抖 300ms，自动回到第 1 页并搜索（无需点搜索按钮）
    useEffect(() => {
        const t = setTimeout(() => {
            setPage(1);
            setKeyword(input.trim());
        }, 300);
        return () => clearTimeout(t);
    }, [input]);

    // 状态/审核/分类/标签发生变化时回到第 1 页（用 setTimeout 规避 React Compiler 的 effect 内 setState 规则）
    useEffect(() => {
        const t = setTimeout(() => setPage(1), 0);
        return () => clearTimeout(t);
    }, [status, review, category, tag]);

    // 拉取文章列表（浏览器自动携带登录 cookie）
    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(() => setLoading(true), 0);
        getAdminArticlesApi({
            page,
            pageSize: PAGE_SIZE,
            keyword: keyword || undefined,
            status: status || undefined,
            review_status: review || undefined,
            category_id: category || undefined,
            tag_id: tag || undefined,
        })
            .then((data) => {
                if (cancelled) return;
                setList(data.list ?? []);
                setTotal(data.total ?? 0);
            })
            .catch(() => {
                if (!cancelled) toast.error("获取文章列表失败");
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
    }, [page, keyword, status, review, category, tag]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const goPage = (p: number) => {
        const next = Math.min(totalPages, Math.max(1, p));
        setPage(next);
    };

    // 重置筛选下拉（状态/审核/分类/标签），回到第 1 页
    const resetFilters = () => {
        setStatus("");
        setReview("");
        setCategory("");
        setTag("");
        setPage(1);
    };

    return (
        <div className="mt-4 overflow-hidden rounded-lg border bg-card shadow-sm">
            {/* 工具栏：搜索 + 四个筛选下拉 + 重置 + 右侧按钮 */}
            <div className="flex flex-wrap items-center gap-2 border-b p-3">
                {/* 左：搜索 + 筛选 + 重置 */}
                <div className="flex flex-1 flex-wrap items-center gap-2">
                    <div className="relative w-48">
                        <Input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    setPage(1);
                                    setKeyword(input.trim());
                                }
                            }}
                            placeholder="搜索文章标题、内容"
                            className="h-8 pr-8 text-sm"
                            aria-label="搜索文章"
                        />
                        {input && (
                            <button
                                type="button"
                                onClick={() => setInput("")}
                                aria-label="清空搜索"
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* 文章状态 */}
                    <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger className="h-8 w-30 shrink-0">
                            <SelectValue placeholder="文章状态" />
                        </SelectTrigger>
                        <SelectContent>
                            {STATUS_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* 审核状态 */}
                    <Select value={review} onValueChange={setReview}>
                        <SelectTrigger className="h-8 w-28 shrink-0">
                            <SelectValue placeholder="审核状态" />
                        </SelectTrigger>
                        <SelectContent>
                            {REVIEW_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* 分类 */}
                    <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger className="h-8 w-26 shrink-0">
                            <SelectValue placeholder="全部分类" />
                        </SelectTrigger>
                        <SelectContent>
                            {catsLoading ? (
                                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                    加载中…
                                </div>
                            ) : categories.length === 0 ? (
                                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                    无分类
                                </div>
                            ) : (
                                categories.map((c) => (
                                    <SelectItem key={c.id} value={String(c.id)}>
                                        {c.name}
                                    </SelectItem>
                                ))
                            )}
                        </SelectContent>
                    </Select>

                    {/* 标签 */}
                    <Select value={tag} onValueChange={setTag}>
                        <SelectTrigger className="h-8 w-26 shrink-0">
                            <SelectValue placeholder="全部标签" />
                        </SelectTrigger>
                        <SelectContent>
                            {tagsLoading ? (
                                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                    加载中…
                                </div>
                            ) : tags.length === 0 ? (
                                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                    无标签
                                </div>
                            ) : (
                                tags.map((t) => (
                                    <SelectItem key={t.id} value={String(t.id)}>
                                        {t.name}
                                    </SelectItem>
                                ))
                            )}
                        </SelectContent>
                    </Select>

                    {/* 重置筛选 */}
                    <Button variant="outline" size="sm" className="h-8" onClick={resetFilters}>
                        <RotateCcw size={14} />
                        重置
                    </Button>
                </div>

                {/* 右：分类标签 / 新增文章 / 导入 */}
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-8" onClick={() => toast.info("分类标签管理待接入")}>
                        <FolderTree size={14} />
                        分类标签
                    </Button>
                    <Button size="sm" className="h-8 bg-[#FFFDD0] text-stone-800 hover:bg-[#FFF6C0]" onClick={() => toast.info("新增文章待接入")}>
                        <Plus size={14} />
                        新增文章
                    </Button>
                    <Button variant="outline" size="sm" className="h-8" onClick={() => toast.info("导入功能待接入")}>
                        <Upload size={14} />
                        导入
                    </Button>
                </div>
            </div>

            {/* 列表 */}
            <div className="overflow-x-auto">
                {/* table-fixed + colgroup：列宽固定比例，与标题长短无关，整体规整 */}
                <table className="w-full table-fixed text-sm">
                    <colgroup>
                        <col className="w-[30%]" />
                        <col className="w-[10%]" />
                        <col className="w-[11%]" />
                        <col className="w-[12%]" />
                        <col className="w-[37%]" />
                    </colgroup>
                    <thead>
                        <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                            <th className="px-3 py-2 font-medium">标题</th>
                            <th className="px-3 py-2 font-medium">状态</th>
                            <th className="px-3 py-2 font-medium">统计</th>
                            <th className="whitespace-nowrap px-3 py-2 font-medium">发布于</th>
                            <th className="px-3 py-2 text-center font-medium">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && list.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                                    加载中…
                                </td>
                            </tr>
                        ) : list.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                                    {keyword || status || review || category || tag ? "无结果" : "暂无文章"}
                                </td>
                            </tr>
                        ) : (
                            list.map((article) => (
                                <tr key={article.id} className="border-b last:border-0 transition-colors hover:bg-muted/40">
                                    <td className="px-3 py-2">
                                        <div className="flex items-start gap-2">
                                            <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" />
                                            <div className="min-w-0">
                                                <div className="line-clamp-1 font-medium">{article.title}</div>
                                                {/* 分类 / 标签：标题正下方、图标下方，从左到右 */}
                                                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                                    {article.post_categories.map((c) => (
                                                        <span key={c.id} className="rounded bg-muted px-1.5 py-px text-[11px] text-muted-foreground">
                                                            {c.name}
                                                        </span>
                                                    ))}
                                                    {article.post_tags.map((t) => (
                                                        <span key={t.id} className="rounded bg-muted px-1.5 py-px text-[11px] text-muted-foreground">
                                                            #{t.name}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-3 py-2">
                                        <span
                                            className={`inline-block rounded-md px-2 py-0.5 text-xs ${STATUS_CLASS[article.status] || "bg-muted text-muted-foreground"}`}
                                        >
                                            {STATUS_LABEL[article.status] || article.status}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-muted-foreground">
                                        <div className="flex flex-col gap-1">
                                            <span className="flex items-center gap-1">
                                                <AlignJustify size={12} className="text-muted-foreground/60" />
                                                {article.word_count || 0} 字
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Eye size={12} className="text-muted-foreground/60" />
                                                {article.view_count || 0}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-muted-foreground">{formatDate(article.created_at)}</td>
                                    {/* 操作列：预览 / 编辑 / 删除 */}
                                    <td className="w-full whitespace-nowrap px-3 py-2">
                                        <div className="flex items-center justify-center gap-0.5">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                aria-label="预览"
                                                title="预览"
                                                className="bg-orange-100 text-orange-700 hover:bg-orange-200"
                                                asChild
                                            >
                                                <Link href={`/posts/${article.abbrlink || article.id}`}>
                                                    <Eye className="size-4" />预览
                                                </Link>
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                aria-label="编辑"
                                                title="编辑"
                                                className="bg-blue-100 text-blue-700 hover:bg-blue-200"
                                                onClick={() => toast.info("编辑功能待接入")}
                                            >
                                                <Pencil className="size-4" />编辑
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                aria-label="删除"
                                                title="删除"
                                                className="bg-destructive/10 text-destructive hover:bg-destructive/20"
                                                onClick={() => toast.info("删除功能待接入")}
                                            >
                                                <Trash2 className="size-4" />删除
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* 分页 */}
            <div className="flex items-center justify-between border-t p-3">
                <div className="gap-2">
                    <span className="rounded-sm p-1 text-xs text-muted-foreground bg-muted">共 {total} 篇</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                        第 {page} / {totalPages} 页
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => goPage(page - 1)} aria-label="上一页">
                        <ChevronLeft className="size-4" />
                    </Button>
                    <span className="text-xs text-muted-foreground">{page}</span>
                    <Button variant="outline" size="icon-sm" disabled={page >= totalPages} onClick={() => goPage(page + 1)} aria-label="下一页">
                        <ChevronRight className="size-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
