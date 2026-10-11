"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "nextjs-toploader/app";
import { ArrowLeft, Check, Loader2, Send, ThumbsUp } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/components/confirm-provider";
import { PaginationControls } from "@/components/pagination-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    COMMUNITY_QA_STATUS_LABEL,
    CommunityQaPublicError,
    acceptCommunityQaAnswerPublicApi,
    answerCommunityQaQuestionPublicApi,
    getCommunityQaQuestionDetailPublicApi,
    voteCommunityQaContentPublicApi,
    type CommunityQaQuestionDetail,
    type CommunityQaVoteType,
} from "@/lib/api-community-qa-public";

/**
 * 社区问答 · 问题详情（前台 /questions/[id]，客户端组件）。
 *
 * 远端能力（逐字来自线上 chunk 模块 343577）：GET /pro/community-qa/questions/{id}?page=（回答分页）、
 * POST /pro/community-qa/questions/{id}/answers { content }、PUT /pro/community-qa/{type}/{id}/vote { liked }、
 * PUT /pro/community-qa/questions/{id}/accept { answer_id }。
 *
 * 响应形状已取证（2026-10-11 只读 GET 实测）：
 *   { answers: [], page: 1, page_size: 20, question: { id, title, content, tags, status,
 *     author_id, is_author, vote_count, liked, created_at }, total: 0 }
 * 据此：
 *   · 「点赞 / 已点赞」按条目自带的 liked 决定（点赞接口 body 就是 { liked }，语义闭环）；
 *   · 「采纳」只在 is_author=true（当前访问者是提问者）时出现 —— 不给非作者画一个必然失败的按钮；
 *   · 回答条目字段未取到样本（实测回答数为 0），仍然只渲染真的读到的字段。
 * ⚠️ 三条写路径（作答 / 点赞 / 采纳）都**未端到端实测**（铁律：只允许 GET 探活）。
 * 「采纳」不可撤销，点击前用应用内确认弹窗二次确认。
 */

const STATUS_CLASS: Record<string, string> = {
    PENDING: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    APPROVED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    REJECTED: "border-destructive/40 bg-destructive/10 text-destructive",
};

function messageOf(error: unknown, fallback: string): string {
    if (error instanceof CommunityQaPublicError) return error.message;
    if (error instanceof Error && error.message) return error.message;
    return fallback;
}

/** 时间展示：能解析才显示（后端字段名是 created_at，取证过的口径） */
function formatTime(value?: string): string {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export interface QaQuestionDetailProps {
    /** 路径里的问题 id */
    id: string;
    isLoggedIn: boolean;
}

export function QaQuestionDetail({ id, isLoggedIn }: QaQuestionDetailProps) {
    const router = useRouter();
    const confirm = useConfirm();

    const [detail, setDetail] = useState<CommunityQaQuestionDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    /** 回答列表当前页（远端 detail(id, page) 的分页参数） */
    const [answerPage, setAnswerPage] = useState(1);
    const [reloadKey, setReloadKey] = useState(0);

    const [answerDraft, setAnswerDraft] = useState("");
    const [submitting, setSubmitting] = useState(false);
    /** 正在提交点赞/采纳的 id（用于逐个按钮的 loading 与防重复点击） */
    const [pendingVote, setPendingVote] = useState<string | null>(null);
    const [pendingAccept, setPendingAccept] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        // 延后到下一个 tick：effect 内同步 setState 会触发级联渲染（react-hooks/set-state-in-effect）
        const timer = setTimeout(() => {
            setLoading(true);
            setLoadError("");
        }, 0);
        getCommunityQaQuestionDetailPublicApi(id, answerPage)
            .then((result) => {
                if (!cancelled) setDetail(result);
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    setDetail(null);
                    setLoadError(messageOf(error, "获取问题详情失败"));
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
    }, [id, answerPage, reloadKey]);

    const answerTotalPages = useMemo(() => {
        if (!detail) return 1;
        const size = detail.answersPageSize && detail.answersPageSize > 0 ? detail.answersPageSize : 20;
        const total = detail.answersTotal;
        if (total === undefined || !Number.isFinite(total) || total <= 0) return Math.max(1, answerPage);
        return Math.max(1, Math.ceil(total / size));
    }, [answerPage, detail]);

    /** 统一的写操作错误提示：后端原话 + 401 给「去登录」动作 */
    const showWriteError = useCallback(
        (error: unknown, fallback: string) => {
            const message = messageOf(error, fallback);
            if (error instanceof CommunityQaPublicError && error.status === 401) {
                toast.error(message, { action: { label: "去登录", onClick: () => router.push("/login") } });
                return;
            }
            toast.error(message);
        },
        [router]
    );

    /** 回答（写操作） */
    const handleAnswer = useCallback(
        async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const content = answerDraft.trim();
            if (!content) {
                toast.error("请先填写回答内容");
                return;
            }
            setSubmitting(true);
            try {
                await answerCommunityQaQuestionPublicApi(id, content);
                toast.success("回答已提交，审核通过后公开");
                setAnswerDraft("");
                setReloadKey((key) => key + 1);
            } catch (error: unknown) {
                showWriteError(error, "回答提交失败，请稍后再试");
            } finally {
                setSubmitting(false);
            }
        },
        [answerDraft, id, showWriteError]
    );

    /** 点赞 / 取消点赞（写操作；liked 取反，与条目自带的 liked 状态闭环） */
    const handleVote = useCallback(
        async (type: CommunityQaVoteType, targetId: string, nextLiked: boolean) => {
            if (!targetId) return;
            setPendingVote(targetId);
            try {
                await voteCommunityQaContentPublicApi(type, targetId, nextLiked);
                toast.success(nextLiked ? "已点赞" : "已取消点赞");
                setReloadKey((key) => key + 1);
            } catch (error: unknown) {
                showWriteError(error, "点赞失败，请稍后再试");
            } finally {
                setPendingVote(null);
            }
        },
        [showWriteError]
    );

    /** 采纳回答（写操作 + 不可撤销 → 二次确认） */
    const handleAccept = useCallback(
        async (answerId: string) => {
            const ok = await confirm({
                title: "采纳这个回答？",
                description: "采纳后问题会标记为「已解决」，该操作不可撤销。",
                confirmText: "采纳",
            });
            if (!ok) return;
            setPendingAccept(answerId);
            try {
                await acceptCommunityQaAnswerPublicApi(id, answerId);
                toast.success("已采纳该回答");
                setReloadKey((key) => key + 1);
            } catch (error: unknown) {
                showWriteError(error, "采纳失败，请稍后再试");
            } finally {
                setPendingAccept(null);
            }
        },
        [confirm, id, showWriteError]
    );

    const backLink = (
        <Link href="/questions" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
            <ArrowLeft className="size-3.5" />
            返回问答列表
        </Link>
    );

    if (loading && !detail) {
        return (
            <div className="space-y-4">
                {backLink}
                <p className="text-sm text-muted-foreground">正在加载…</p>
            </div>
        );
    }

    // 接口报错（含 404「问题不存在或未公开」）：如实显示后端原话
    if (!detail) {
        return (
            <div className="space-y-4">
                {backLink}
                <p
                    role="alert"
                    className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                    {loadError || "获取问题详情失败"}
                </p>
            </div>
        );
    }

    // 结构对不上：不猜渲染
    if (detail.shapeUnrecognized) {
        return (
            <div className="space-y-4">
                {backLink}
                <p className="rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground">
                    接口返回的数据结构与预期不符，本页无法展示问题内容（未做猜测渲染）。
                    {loadError ? `（${loadError}）` : ""}
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {backLink}

            {loadError ? (
                <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {loadError}
                </p>
            ) : null}

            {/* 问题正文 */}
            <article className="space-y-3 rounded-xl border bg-card p-4">
                <h1 className="break-words text-xl font-bold">{detail.title || `问题 #${detail.id || id}`}</h1>

                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {detail.status ? (
                        <Badge variant="outline" className={`h-5 px-1.5 text-[11px] ${STATUS_CLASS[detail.status] ?? ""}`}>
                            {COMMUNITY_QA_STATUS_LABEL[detail.status] ?? detail.status}
                        </Badge>
                    ) : null}
                    {typeof detail.vote_count === "number" ? <span>{detail.vote_count} 赞</span> : null}
                    {detail.accepted_answer_id ? (
                        <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
                            已解决
                        </Badge>
                    ) : null}
                    {formatTime(detail.created_at) ? <span>{formatTime(detail.created_at)}</span> : null}
                </div>

                {detail.content ? (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{detail.content}</p>
                ) : null}

                {detail.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                        {detail.tags.map((tag) => (
                            <Badge key={tag} variant="outline" className="h-5 px-1.5 text-[11px] text-muted-foreground">
                                #{tag}
                            </Badge>
                        ))}
                    </div>
                ) : null}

                {detail.moderation_reason ? (
                    <p className="text-xs text-amber-700 dark:text-amber-400">审核意见：{detail.moderation_reason}</p>
                ) : null}

                {isLoggedIn && detail.id ? (
                    <div>
                        <Button
                            type="button"
                            size="sm"
                            variant={detail.liked ? "default" : "outline"}
                            className="h-7 rounded-lg text-xs"
                            aria-pressed={detail.liked}
                            disabled={pendingVote === detail.id}
                            onClick={() => handleVote("questions", detail.id, !detail.liked)}
                        >
                            {pendingVote === detail.id ? (
                                <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                                <ThumbsUp className="size-3.5" />
                            )}
                            {detail.liked ? "已点赞" : "点赞"}
                        </Button>
                    </div>
                ) : null}
            </article>

            {/* 回答列表 */}
            <section aria-label="回答列表" className="space-y-2.5">
                <h2 className="text-base font-semibold">
                    回答
                    {typeof detail.answersTotal === "number" ? (
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">{detail.answersTotal}</span>
                    ) : null}
                </h2>

                {detail.answers.length > 0 ? (
                    detail.answers.map((answer, index) => (
                        <article key={`${answer.id || "answer"}-${index}`} className="space-y-2 rounded-xl border bg-card p-3.5">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                {answer.accepted ? (
                                    <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
                                        已采纳
                                    </Badge>
                                ) : null}
                                {answer.status ? (
                                    <Badge variant="outline" className={`h-5 px-1.5 text-[11px] ${STATUS_CLASS[answer.status] ?? ""}`}>
                                        {COMMUNITY_QA_STATUS_LABEL[answer.status] ?? answer.status}
                                    </Badge>
                                ) : null}
                                {typeof answer.vote_count === "number" ? <span>{answer.vote_count} 赞</span> : null}
                                {formatTime(answer.created_at) ? <span>{formatTime(answer.created_at)}</span> : null}
                            </div>

                            {answer.content ? (
                                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{answer.content}</p>
                            ) : null}

                            {isLoggedIn && answer.id ? (
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={answer.liked ? "default" : "outline"}
                                        className="h-7 rounded-lg text-xs"
                                        aria-pressed={answer.liked === true}
                                        disabled={pendingVote === answer.id}
                                        onClick={() => handleVote("answers", answer.id, answer.liked !== true)}
                                    >
                                        {pendingVote === answer.id ? (
                                            <Loader2 className="size-3.5 animate-spin" />
                                        ) : (
                                            <ThumbsUp className="size-3.5" />
                                        )}
                                        {answer.liked ? "已点赞" : "点赞"}
                                    </Button>
                                    {/* 采纳只给提问者看：is_author 是实测字段，非作者点了必然被后端拒绝 */}
                                    {detail.is_author && !detail.accepted_answer_id ? (
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="h-7 rounded-lg text-xs"
                                            disabled={pendingAccept === answer.id}
                                            onClick={() => handleAccept(answer.id)}
                                        >
                                            {pendingAccept === answer.id ? (
                                                <Loader2 className="size-3.5 animate-spin" />
                                            ) : (
                                                <Check className="size-3.5" />
                                            )}
                                            采纳
                                        </Button>
                                    ) : null}
                                </div>
                            ) : null}
                        </article>
                    ))
                ) : (
                    <p className="text-sm text-muted-foreground">暂无回答。</p>
                )}

                {detail.answers.length > 0 && answerTotalPages > 1 ? (
                    <PaginationControls
                        page={answerPage}
                        totalPages={answerTotalPages}
                        disabled={loading}
                        onPageChange={setAnswerPage}
                    />
                ) : null}
            </section>

            {/* 我要回答（登录后可见） */}
            {isLoggedIn ? (
                <form onSubmit={handleAnswer} className="space-y-3 rounded-xl border bg-card p-4" aria-label="我要回答">
                    <h2 className="text-base font-semibold">我要回答</h2>
                    <label className="block space-y-1">
                        <span className="text-xs font-medium text-muted-foreground">回答内容</span>
                        <textarea
                            value={answerDraft}
                            rows={4}
                            maxLength={10000}
                            placeholder="写下你的答案，审核通过后公开"
                            onChange={(event) => setAnswerDraft(event.target.value)}
                            className="w-full rounded-lg border border-input bg-transparent p-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                        />
                    </label>
                    <Button type="submit" size="sm" disabled={submitting || !answerDraft.trim()}>
                        {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                        提交回答
                    </Button>
                </form>
            ) : (
                <div className="space-y-2 rounded-xl border bg-card p-4">
                    <p className="text-sm text-muted-foreground">登录后可以回答这个问题。</p>
                    <Button asChild size="sm" className="h-8">
                        <Link href="/login">登录后参与问答</Link>
                    </Button>
                </div>
            )}
        </div>
    );
}
