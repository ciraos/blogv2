"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "nextjs-toploader/app";
import { Loader2, Search, Send } from "lucide-react";
import { toast } from "sonner";

import { PaginationControls } from "@/components/pagination-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    COMMUNITY_QA_MAX_TAGS,
    COMMUNITY_QA_STATUS_LABEL,
    COMMUNITY_QA_TAG_SEPARATOR,
    CommunityQaPublicError,
    createCommunityQaQuestionPublicApi,
    getCommunityQaConfigPublicApi,
    listCommunityQaQuestionsPublicApi,
    type CommunityQaListData,
    type CommunityQaQuestionItem,
} from "@/lib/api-community-qa-public";
import { cn } from "@/lib/utils";

/**
 * 社区问答（前台 /questions 页的主体，客户端组件）。
 *
 * 功能口径逐字对齐线上官方前台（https://blog.ciraos.top/questions 的 chunk 模块 538679）：
 *   标题 + 副标题 · 搜索问题 + 筛选标签 + 搜索按钮 · 全部问题 / 我的提问 Tab ·
 *   问题列表（标题 / 状态 / 赞 / 已解决 / 标签 / 审核意见）· 上一页·第 N 页·下一页 ·
 *   发起提问表单（标题 / 描述 / 标签，逗号分隔最多 5 个）· 未登录时「登录后参与问答」。
 * 官方**没有**的东西这里也不画：没有浏览量、没有回答数、没有状态筛选下拉、没有排序下拉、没有删除按钮。
 * 实测列表条目字段（2026-10-11 只读 GET）：
 *   { id, title, tags[], status, author_id, is_author, vote_count, liked, created_at }
 *   —— 没有 content（所以列表不显示描述摘要）、没有 answer_count、没有 accepted_answer_id。
 *   代码里仍保留「有则显示」的分支（后端将来加上就自动出现），但**不会**为缺失字段补 0 或占位。
 *
 * 为什么列表用客户端拉取而不是服务端首屏：
 *   搜索词 / 标签筛选 / 翻页 / mine 切换都在同一页内反复变，服务端渲染每次都要整页往返；
 *   官方也是客户端切参数重拉。开关（enabled）反而先由服务端读一次，避免首屏闪一下再变成「尚未启用」。
 */

/** 状态徽章配色（浅色/深色各一套，全部用主题令牌与 Tailwind 的颜色透明度写法，深色模式自动适配） */
const STATUS_CLASS: Record<string, string> = {
    PENDING: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    APPROVED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    REJECTED: "border-destructive/40 bg-destructive/10 text-destructive",
};

/** 错误文案：后端原话优先（代理与后端都返回 { code, message } 信封） */
function messageOf(error: unknown, fallback: string): string {
    if (error instanceof CommunityQaPublicError) return error.message;
    if (error instanceof Error && error.message) return error.message;
    return fallback;
}

/** 描述摘要：纯文本截断（后端列表实测不返回 content，所以正常情况下不渲染；
 *  保留此分支是为了后端补上该字段时自动出现。绝不按 HTML/Markdown 渲染，避免 XSS 与“猜格式”） */
function excerpt(text: string, max = 140): string {
    const flat = text.replace(/\s+/g, " ").trim();
    return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** 状态徽章（只渲染后端真的给了状态的条目） */
function StatusBadge({ status }: { status?: string }) {
    if (!status) return null;
    const label = COMMUNITY_QA_STATUS_LABEL[status] ?? status;
    return (
        <Badge variant="outline" className={cn("h-5 px-1.5 text-[11px]", STATUS_CLASS[status])}>
            {label}
        </Badge>
    );
}

export interface QaQuestionsProps {
    /** 登录态（服务端读 cookie 后传入；未登录不显示「我的提问」与提问表单） */
    isLoggedIn: boolean;
    /** 服务端读到的开关；null = 服务端没读到，客户端再向 /api/public/community-qa/config 确认一次 */
    initialEnabled: boolean | null;
}

export function QaQuestions({ isLoggedIn, initialEnabled }: QaQuestionsProps) {
    const router = useRouter();

    const [enabled, setEnabled] = useState<boolean | null>(initialEnabled);
    /** 开关是否已确认过（服务端读到即为 true；客户端确认失败也要停下来，否则会永远“加载中”） */
    const [configChecked, setConfigChecked] = useState(initialEnabled !== null);

    const [query, setQuery] = useState<{ page: number; mine: boolean; keyword: string; tag: string }>({
        page: 1,
        mine: false,
        keyword: "",
        tag: "",
    });
    /** 搜索区的草稿值：只有点「搜索」才写进 query（对齐官方：输入即时改的是草稿） */
    const [keywordDraft, setKeywordDraft] = useState("");
    const [tagDraft, setTagDraft] = useState("");

    const [data, setData] = useState<CommunityQaListData<CommunityQaQuestionItem> | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState("");
    /** 手动刷新计数（提问成功但响应里没有 id 时，留在列表页刷新一次） */
    const [reloadKey, setReloadKey] = useState(0);

    const [titleDraft, setTitleDraft] = useState("");
    const [contentDraft, setContentDraft] = useState("");
    const [tagsDraft, setTagsDraft] = useState("");
    const [submitting, setSubmitting] = useState(false);

    // 开关：服务端没读到（initialEnabled=null）时客户端再确认一次
    useEffect(() => {
        if (configChecked) return;
        let cancelled = false;
        getCommunityQaConfigPublicApi()
            .then((config) => {
                if (!cancelled) setEnabled(config.enabled);
            })
            .catch((error: unknown) => {
                // 读不到开关就不擅自当成“已启用”：只显示错误，不拉列表
                if (!cancelled) setLoadError(messageOf(error, "获取问答配置失败"));
            })
            .finally(() => {
                if (!cancelled) setConfigChecked(true);
            });
        return () => {
            cancelled = true;
        };
    }, [configChecked]);

    // 列表：仅在开关确认启用后拉取；搜索/筛选/翻页/mine 变化都会重拉
    useEffect(() => {
        if (enabled !== true) return;
        let cancelled = false;
        // 延后到下一个 tick：effect 内同步 setState 会触发级联渲染（react-hooks/set-state-in-effect）
        const timer = setTimeout(() => {
            setLoading(true);
            setLoadError("");
        }, 0);
        listCommunityQaQuestionsPublicApi(query)
            .then((result) => {
                if (!cancelled) setData(result);
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    setData(null);
                    setLoadError(messageOf(error, "获取问题失败"));
                }
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
    }, [enabled, query, reloadKey]);

    /**
     * 总页数：优先用后端返回的 total / page_size；
     * page_size 缺失时回落到 20（公开列表实测 200 响应里 page_size 就是 20，是后端默认值）。
     * total 为 0 时返回当前页（避免出现“第 1 页 / 共 0 页”这种怪状态）。
     */
    const totalPages = useMemo(() => {
        if (!data) return 1;
        const size = data.page_size && data.page_size > 0 ? data.page_size : 20;
        if (!Number.isFinite(data.total) || data.total <= 0) return Math.max(1, data.page);
        return Math.max(1, Math.ceil(data.total / size));
    }, [data]);

    /** 统一的写操作错误提示：后端原话 + 401 时给「去登录」动作（不静默失败） */
    const showWriteError = useCallback(
        (error: unknown, fallback: string) => {
            const message = messageOf(error, fallback);
            if (error instanceof CommunityQaPublicError && error.status === 401) {
                toast.error(message, {
                    action: { label: "去登录", onClick: () => router.push("/login") },
                });
                return;
            }
            toast.error(message);
        },
        [router]
    );

    /** 点标签 = 按该标签筛选（对齐官方：同时回填筛选标签输入框并回到第 1 页） */
    const applyTag = useCallback((tag: string) => {
        setTagDraft(tag);
        setQuery((prev) => ({ ...prev, page: 1, tag }));
    }, []);

    /** 提交提问（写操作：本地先校验，再交给同源代理转发） */
    const handleCreate = useCallback(
        async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const title = titleDraft.trim();
            const content = contentDraft.trim();
            // 标签分隔规则与官方一致：英文/中文逗号都可，切完去空白、丢空串
            const tags = tagsDraft
                .split(COMMUNITY_QA_TAG_SEPARATOR)
                .map((item) => item.trim())
                .filter(Boolean);

            if (title.length < 3) {
                toast.error("问题标题至少 3 个字符");
                return;
            }
            if (content.length < 5) {
                toast.error("问题描述至少 5 个字符");
                return;
            }
            if (tags.length > COMMUNITY_QA_MAX_TAGS) {
                toast.error(`最多 ${COMMUNITY_QA_MAX_TAGS} 个标签`);
                return;
            }

            setSubmitting(true);
            try {
                const { id } = await createCommunityQaQuestionPublicApi({ title, content, tags });
                toast.success("提问已提交，审核通过后公开");
                setTitleDraft("");
                setContentDraft("");
                setTagsDraft("");
                if (id) {
                    // 官方提交成功后直接进详情页（作者自己能看到待审核的问题）
                    router.push(`/questions/${id}`);
                    return;
                }
                // 响应里没有 id：不假装跳转，留在本页刷新列表
                setReloadKey((key) => key + 1);
            } catch (error: unknown) {
                showWriteError(error, "提问失败，请稍后再试");
            } finally {
                setSubmitting(false);
            }
        },
        [contentDraft, router, showWriteError, tagsDraft, titleDraft]
    );

    const title = (
        <div>
            <h1 className="text-2xl font-bold">社区问答</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">分享问题与经验，内容审核通过后公开。</p>
        </div>
    );

    // 开关为 false：整页只给「尚未启用」空态（官方同样是整页只渲染这一句）
    if (enabled === false) {
        return (
            <div className="space-y-4">
                {title}
                <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
                    社区问答尚未启用
                </div>
            </div>
        );
    }

    // 开关还没确认（首次由客户端确认中）
    if (!configChecked) {
        return (
            <div className="space-y-4">
                {title}
                <p className="text-sm text-muted-foreground">正在加载…</p>
            </div>
        );
    }

    // 开关读不到：如实报错，不猜真假
    if (enabled === null) {
        return (
            <div className="space-y-4">
                {title}
                {loadError ? (
                    <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        {loadError}
                    </p>
                ) : null}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {title}

            {/* 加载/接口错误：内联展示（页面不至于空白），写操作错误另走 toast */}
            {loadError ? (
                <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {loadError}
                </p>
            ) : null}

            {/* 搜索区：左「搜索问题」+ 右「筛选标签」+ 搜索按钮 */}
            <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(event) => {
                    event.preventDefault();
                    setQuery((prev) => ({
                        ...prev,
                        page: 1,
                        keyword: keywordDraft.trim(),
                        tag: tagDraft.trim(),
                    }));
                }}
            >
                <label className="min-w-40 flex-1 space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">搜索问题</span>
                    <Input
                        value={keywordDraft}
                        maxLength={150}
                        placeholder="输入关键词"
                        onChange={(event) => setKeywordDraft(event.target.value)}
                    />
                </label>
                <label className="w-32 space-y-1 sm:w-40">
                    <span className="text-xs font-medium text-muted-foreground">筛选标签</span>
                    <Input
                        value={tagDraft}
                        maxLength={24}
                        placeholder="标签"
                        onChange={(event) => setTagDraft(event.target.value)}
                    />
                </label>
                <Button type="submit" size="sm" className="h-8">
                    <Search className="size-3.5" />
                    搜索
                </Button>
            </form>

            {/* Tab：全部问题 / 我的提问（未登录不显示后者，与官方一致） */}
            <div className="flex flex-wrap items-center gap-2">
                <Button
                    type="button"
                    size="sm"
                    variant={query.mine ? "outline" : "default"}
                    aria-pressed={!query.mine}
                    className="h-7 rounded-lg text-xs"
                    onClick={() => setQuery((prev) => ({ ...prev, page: 1, mine: false }))}
                >
                    全部问题
                </Button>
                {isLoggedIn ? (
                    <Button
                        type="button"
                        size="sm"
                        variant={query.mine ? "default" : "outline"}
                        aria-pressed={query.mine}
                        className="h-7 rounded-lg text-xs"
                        onClick={() => setQuery((prev) => ({ ...prev, page: 1, mine: true }))}
                    >
                        我的提问
                    </Button>
                ) : null}
            </div>

            {/* 问题列表 */}
            <section aria-label="问题列表" className="space-y-2.5">
                {loading ? (
                    <p className="text-sm text-muted-foreground">正在加载问题…</p>
                ) : data && data.list.length > 0 ? (
                    data.list.map((item, index) => {
                        const key = `${item.id ?? "row"}-${index}`;
                        const questionId = item.id === undefined || item.id === null ? "" : String(item.id);
                        const tags = Array.isArray(item.tags) ? item.tags.filter((tag) => typeof tag === "string") : [];
                        const excerptText = typeof item.content === "string" ? excerpt(item.content) : "";
                        return (
                            <article key={key} className="space-y-2 rounded-xl border bg-card p-3.5">
                                {questionId ? (
                                    <Link
                                        href={`/questions/${questionId}`}
                                        className="block break-words text-base font-semibold text-primary hover:underline"
                                    >
                                        {item.title?.trim() || `问题 #${questionId}`}
                                    </Link>
                                ) : (
                                    <span className="block break-words text-base font-semibold">
                                        {item.title?.trim() || "（无标题）"}
                                    </span>
                                )}

                                {excerptText ? (
                                    <p className="line-clamp-2 text-sm text-muted-foreground">{excerptText}</p>
                                ) : null}

                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                    <StatusBadge status={item.status} />
                                    {/* 以下计数只在后端真的返回了数字时渲染（没有就不显示，不写死 0） */}
                                    {typeof item.vote_count === "number" ? <span>{item.vote_count} 赞</span> : null}
                                    {typeof item.answer_count === "number" ? <span>{item.answer_count} 回答</span> : null}
                                    {item.accepted_answer_id ? (
                                        <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
                                            已解决
                                        </Badge>
                                    ) : null}
                                </div>

                                {tags.length > 0 ? (
                                    <div className="flex flex-wrap gap-1.5">
                                        {tags.map((tag) => (
                                            <button
                                                key={tag}
                                                type="button"
                                                onClick={() => applyTag(tag)}
                                                className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                                            >
                                                #{tag}
                                            </button>
                                        ))}
                                    </div>
                                ) : null}

                                {item.moderation_reason ? (
                                    <p className="text-xs text-amber-700 dark:text-amber-400">
                                        审核意见：{item.moderation_reason}
                                    </p>
                                ) : null}
                            </article>
                        );
                    })
                ) : (
                    <p className="text-sm text-muted-foreground">暂无符合条件的问题。</p>
                )}
            </section>

            {/* 分页：复用前台既有的分页控件（上一页 / 页码 / 下一页）。
                只要列表请求成功就渲染（与官方前台一致：官方也是无条件渲染这组按钮，
                数据不足一页时按钮自然置灰），这样「第 N 页」始终可见、状态可控。 */}
            {data ? (
                <PaginationControls
                    page={query.page}
                    totalPages={totalPages}
                    disabled={loading}
                    onPageChange={(page) => setQuery((prev) => ({ ...prev, page }))}
                />
            ) : null}

            {/* 发起提问：登录后可见（未登录给明确的登录引导，不静默禁用） */}
            {isLoggedIn ? (
                <form onSubmit={handleCreate} className="space-y-3 rounded-xl border bg-card p-4" aria-label="发起提问">
                    <h2 className="text-base font-semibold">发起提问</h2>

                    <label className="block space-y-1">
                        <span className="text-xs font-medium text-muted-foreground">问题标题</span>
                        <Input
                            value={titleDraft}
                            maxLength={150}
                            placeholder="一句话说清你的问题"
                            onChange={(event) => setTitleDraft(event.target.value)}
                        />
                    </label>

                    <label className="block space-y-1">
                        <span className="text-xs font-medium text-muted-foreground">问题描述</span>
                        <textarea
                            value={contentDraft}
                            rows={5}
                            maxLength={10000}
                            placeholder="补充背景、已尝试的做法与期望结果"
                            onChange={(event) => setContentDraft(event.target.value)}
                            className="w-full rounded-lg border border-input bg-transparent p-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                        />
                    </label>

                    <label className="block space-y-1">
                        <span className="text-xs font-medium text-muted-foreground">标签（逗号分隔）</span>
                        <Input
                            value={tagsDraft}
                            maxLength={124}
                            placeholder="例如：Next.js, 部署"
                            onChange={(event) => setTagsDraft(event.target.value)}
                        />
                    </label>

                    <p className="text-xs text-muted-foreground">
                        最多{COMMUNITY_QA_MAX_TAGS}个标签，支持纯文本。请勿公开密码或个人敏感信息。
                    </p>

                    <Button
                        type="submit"
                        size="sm"
                        disabled={submitting || titleDraft.trim().length < 3 || contentDraft.trim().length < 5}
                    >
                        {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                        提交提问
                    </Button>
                </form>
            ) : (
                <div className="space-y-2 rounded-xl border bg-card p-4">
                    <p className="text-sm text-muted-foreground">
                        登录后可以发起提问、回答他人问题，并在「我的提问」里查看自己的问题。
                    </p>
                    <Button asChild size="sm" className="h-8">
                        <Link href="/login">登录后参与问答</Link>
                    </Button>
                </div>
            )}
        </div>
    );
}
