"use client";

/**
 * 社区问答管理（**已接真接口** · PRO 模块）
 *
 * ==== 这一版和上一版的区别 ====
 * 上一版认定「后端没有问答接口」，所以只做只读配置展示 + 实现路径说明。该结论已被推翻：
 * 线上前台 /questions 的 JS chunk 里就有完整的 communityQAApi 模块（见 src/lib/api-community-qa.ts
 * 顶部的逐行证据），本页现在直接调用这些真实接口。
 *
 * ==== 本页每个控件的数据出处（远端 → 本站同源代理） ====
 *   开关读       GET  /api/pro/admin/community-qa/config（404 时退回公开 GET /api/pro/community-qa/config）
 *                → GET  /api/admin/community-qa/config
 *   开关写       PUT  /api/pro/admin/community-qa/config  { enabled }
 *                → PUT  /api/admin/community-qa/config
 *   问题列表     GET  /api/pro/admin/community-qa/questions?page=&status=
 *                → GET  /api/admin/community-qa/questions
 *   回答列表     GET  /api/pro/admin/community-qa/answers?status=&page=
 *                → GET  /api/admin/community-qa/answers
 *   审核         PUT  /api/pro/admin/community-qa/{type}/{id}/moderation  { status, reason }
 *                → PUT  /api/admin/community-qa/{type}/{id}/moderation
 *   作答         POST /api/pro/community-qa/questions/{id}/answers  { content }（公开接口，无管理端专用回复路由）
 *                → POST /api/admin/community-qa/questions/{id}/answers
 *
 * ==== 界面上**没有**的东西（远端确实没有，所以不画按钮） ====
 *   · 删除：communityQAApi 里没有任何 delete/destroy 路由，管理端只有 config / questions / answers / moderation；
 *   · 编辑问题正文、置顶、加精：同样没有对应路由；
 *   · 按关键词搜索：公开列表有 keyword 参数，但管理端是否接受它没有任何证据（后台截图里也没有搜索框），
 *     所以不摆一个可能不生效的搜索框 —— 只做「内容类型 + 审核状态 + 分页」三件有实据的事。
 *
 * ⚠️ 写操作（开关 / 审核 / 作答）按任务铁律**没有对线上实测过**，只做了参数校验 + 二次确认 + 代理转发。
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
    CheckCircle2,
    ExternalLink,
    MessageCircle,
    Power,
    RefreshCw,
    ThumbsUp,
    TriangleAlert,
    XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-provider";
import { PaginationControls } from "@/components/pagination-controls";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ACTION_TONE } from "@/lib/action-tones";
import {
    COMMUNITY_QA_STATUS_LABEL,
    answerCommunityQaQuestionApi,
    getCommunityQaConfigApi,
    listCommunityQaAnswersApi,
    listCommunityQaQuestionsApi,
    moderateCommunityQaApi,
    setCommunityQaEnabledApi,
    type CommunityQaContentType,
    type CommunityQaRow,
    type CommunityQaStatus,
} from "@/lib/api-community-qa";

/** 审核状态筛选（"ALL" 是本地哨兵，不发往远端 = 全部状态） */
const STATUS_OPTIONS: { value: "ALL" | CommunityQaStatus; label: string }[] = [
    { value: "ALL", label: "全部状态" },
    { value: "PENDING", label: "待审核" },
    { value: "APPROVED", label: "已公开" },
    { value: "REJECTED", label: "未通过审核" },
];

/** 内容类型筛选（值就是远端路径段） */
const TYPE_OPTIONS: { value: CommunityQaContentType; label: string }[] = [
    { value: "questions", label: "问题" },
    { value: "answers", label: "回答" },
];

/** 状态徽章配色（文案与远端 qaStatus 逐字一致） */
const STATUS_BADGE_CLASS: Record<string, string> = {
    PENDING: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    APPROVED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    REJECTED: "bg-red-500/15 text-red-700 dark:text-red-300",
};

/** 远端默认每页条数（公开列表实测 page_size=20）；响应里带了 page_size 就用响应的 */
const DEFAULT_PAGE_SIZE = 20;

/* ---------------------------------------------------------------------------
 * 条目字段读取：远端字段名只有部分有确凿证据（见 api-community-qa.ts），
 * 所以统一走「候选名 → 有就显示、没有就不显示」，绝不给默认值假装有数据。
 * ------------------------------------------------------------------------ */

function pickString(row: CommunityQaRow, ...keys: string[]): string {
    for (const key of keys) {
        const value = row[key];
        if (typeof value === "string" && value.trim()) return value;
        if (typeof value === "number") return String(value);
    }
    return "";
}

function pickNumber(row: CommunityQaRow, ...keys: string[]): number | null {
    for (const key of keys) {
        const value = row[key];
        if (typeof value === "number" && Number.isFinite(value)) return value;
    }
    return null;
}

/** 条目主键：问题用 id，回答若主键叫 answer_id 也认（moderation 的路径参数用它） */
function pickRowId(row: CommunityQaRow): string {
    return pickString(row, "id", "answer_id");
}

function pickTags(row: CommunityQaRow): string[] {
    const value = row.tags;
    return Array.isArray(value) ? value.filter((t): t is string => typeof t === "string" && t.trim() !== "") : [];
}

export function QaManager({
    initialEnabled,
    configOk,
    siteUrl,
}: {
    /** 服务端读到的 community_qa.enable（公开站点配置），作为初值；客户端再向管理端接口确认 */
    initialEnabled: boolean | null;
    /** 是否成功读到站点公开配置 */
    configOk: boolean;
    /** 站点地址，用于「查看前台」链接 */
    siteUrl: string;
}) {
    const confirm = useConfirm();

    // ===== 开关 =====
    const [enabled, setEnabled] = useState<boolean | null>(initialEnabled);
    const [configError, setConfigError] = useState<string | null>(null);
    const [toggling, setToggling] = useState(false);

    // ===== 列表 =====
    const [contentType, setContentType] = useState<CommunityQaContentType>("questions");
    const [statusFilter, setStatusFilter] = useState<"ALL" | CommunityQaStatus>("ALL");
    const [page, setPage] = useState(1);
    const [rows, setRows] = useState<CommunityQaRow[]>([]);
    const [total, setTotal] = useState(0);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [loading, setLoading] = useState(true);

    // ===== 行内交互状态 =====
    const [actingKey, setActingKey] = useState<string | null>(null);
    const [rejectTarget, setRejectTarget] = useState<string | null>(null);
    const [rejectReason, setRejectReason] = useState("");
    const [answerTarget, setAnswerTarget] = useState<string | null>(null);
    const [answerContent, setAnswerContent] = useState("");

    const [refreshKey, setRefreshKey] = useState(0);
    const refresh = () => setRefreshKey((k) => k + 1);

    const frontUrl = siteUrl ? `${siteUrl.replace(/\/+$/, "")}/questions` : "";

    // 开关真值：管理端接口优先；失败时保留服务端读到的公开配置值，并如实提示
    useEffect(() => {
        let cancelled = false;
        getCommunityQaConfigApi()
            .then((cfg) => {
                if (cancelled) return;
                setEnabled(cfg.enabled);
                setConfigError(null);
            })
            .catch((e) => {
                if (cancelled) return;
                setConfigError(e instanceof Error ? e.message : "读取失败");
            });
        return () => {
            cancelled = true;
        };
    }, [refreshKey]);

    // 列表（内容类型 / 审核状态 / 页码 / 手动刷新）
    useEffect(() => {
        let cancelled = false;
        // 延后到下一个 tick：effect 内同步 setState 会触发级联渲染（react-hooks/set-state-in-effect）
        const timer = setTimeout(() => {
            setLoading(true);
        }, 0);
        const status = statusFilter === "ALL" ? undefined : statusFilter;
        const call =
            contentType === "questions"
                ? listCommunityQaQuestionsApi({ page, status })
                : listCommunityQaAnswersApi({ page, status });

        call
            .then((data) => {
                if (cancelled) return;
                setRows(data.list);
                setTotal(data.total);
                if (data.page_size) setPageSize(data.page_size);
            })
            .catch((e) => {
                if (cancelled) return;
                setRows([]);
                setTotal(0);
                toast.error(e instanceof Error ? e.message : "问答列表加载失败");
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
    }, [contentType, statusFilter, page, refreshKey]);

    const totalPages = useMemo(
        () => Math.max(1, Math.ceil(total / Math.max(1, pageSize))),
        [total, pageSize]
    );

    /** 开关：关闭 / 开启社区问答（远端 PUT /pro/admin/community-qa/config） */
    const handleToggle = async () => {
        if (enabled === null) {
            toast.warning("当前开关状态未知，先点「刷新」确认后再操作");
            return;
        }
        const next = !enabled;
        const ok = await confirm({
            title: next ? "确定开启社区问答吗？" : "确定关闭社区问答吗？",
            description: next
                ? "开启后前台 /questions 恢复按审核状态对外展示内容。"
                : "关闭后前台 /questions 会显示「社区问答尚未启用」，访客无法访问问答内容；本操作不涉及任何内容的删除。",
            confirmText: next ? "开启" : "关闭",
            danger: !next,
        });
        if (!ok) return;

        setToggling(true);
        try {
            await setCommunityQaEnabledApi(next);
            setEnabled(next);
            toast.success(next ? "社区问答已开启" : "社区问答已关闭");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "操作失败");
        } finally {
            setToggling(false);
        }
    };

    /** 审核：通过 / 驳回（远端 PUT .../{type}/{id}/moderation） */
    const handleModerate = async (row: CommunityQaRow, status: CommunityQaStatus, reason = "") => {
        const id = pickRowId(row);
        if (!id) {
            toast.error("这一条没有可用的 id，无法提交审核");
            return;
        }
        const label = status === "APPROVED" ? "通过并公开" : status === "REJECTED" ? "驳回" : "打回待审核";
        const ok = await confirm({
            title: `确定${label}这条${contentType === "questions" ? "问题" : "回答"}吗？`,
            description:
                status === "APPROVED"
                    ? "通过后该内容在前台公开可见。"
                    : status === "REJECTED"
                      ? reason
                          ? `驳回后前台不展示，审核意见会写入：${reason}`
                          : "驳回后前台不展示，且不带审核意见。"
                      : "改回待审核状态，前台不再展示。",
            confirmText: label,
            danger: status !== "APPROVED",
        });
        if (!ok) return;

        const key = `${contentType}:${id}`;
        setActingKey(key);
        try {
            await moderateCommunityQaApi({ type: contentType, id, status, reason });
            toast.success(`已${label}`);
            setRejectTarget(null);
            setRejectReason("");
            refresh();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "审核失败");
        } finally {
            setActingKey(null);
        }
    };

    /** 作答：走前台同一接口（以当前登录账号身份发表） */
    const handleAnswer = async (row: CommunityQaRow) => {
        const id = pickRowId(row);
        if (!id) {
            toast.error("这一条没有可用的 id，无法作答");
            return;
        }
        const content = answerContent.trim();
        if (!content) {
            toast.warning("请输入回答内容");
            return;
        }
        const ok = await confirm({
            title: "以当前登录账号发布这条回答吗？",
            description:
                "走的是前台同一接口（POST /pro/community-qa/questions/{id}/answers），发布后按后端审核策略处理，可能先进入待审核。",
            confirmText: "发布回答",
        });
        if (!ok) return;

        setActingKey(`questions:${id}`);
        try {
            await answerCommunityQaQuestionApi(id, content);
            toast.success("回答已提交");
            setAnswerTarget(null);
            setAnswerContent("");
            refresh();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "回答提交失败");
        } finally {
            setActingKey(null);
        }
    };

    const enabledBadge = !configOk && enabled === null ? (
        <Badge variant="destructive" className="text-[11px]">
            读取失败
        </Badge>
    ) : enabled === null ? (
        <Badge variant="secondary" className="text-[11px]">
            未知
        </Badge>
    ) : enabled ? (
        <Badge className="bg-emerald-500/15 text-[11px] text-emerald-600 dark:text-emerald-400">已开启</Badge>
    ) : (
        <Badge variant="secondary" className="text-[11px]">
            已关闭
        </Badge>
    );

    return (
        <div className="flex flex-col gap-3 pb-4">
            {/* ---- 开关（真实接口） ---- */}
            <section className="rounded-xl border bg-card shadow-sm">
                <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2">
                    <Power className="size-4 text-muted-foreground" />
                    <h3 className="text-sm font-medium">社区问答开关</h3>
                    {enabledBadge}
                    <code className="font-mono text-[11px] text-muted-foreground">community_qa.enable</code>
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={toggling || enabled === null}
                            onClick={() => void handleToggle()}
                        >
                            <Power className="size-3.5" />
                            {toggling ? "提交中…" : enabled ? "关闭社区问答" : "开启社区问答"}
                        </Button>
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={refresh}>
                            <RefreshCw className="size-3.5" />
                            刷新
                        </Button>
                        {frontUrl ? (
                            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" asChild>
                                <a href={frontUrl} target="_blank" rel="noreferrer" title="打开前台问答页">
                                    <ExternalLink className="size-3.5" />
                                    查看前台
                                </a>
                            </Button>
                        ) : (
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                disabled
                                title="站点地址未知，无法生成前台链接"
                            >
                                <ExternalLink className="size-3.5" />
                                查看前台
                            </Button>
                        )}
                    </div>
                </div>
                {/* 只在读取失败时才占位：empty:hidden 让 configError 为空时这层不产生空白 */}
                <div className="space-y-1 px-4 py-2 text-xs text-muted-foreground empty:hidden">
                    {configError && (
                        <p className="flex items-start gap-1.5 text-amber-600 dark:text-amber-400">
                            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                            <span>
                                管理端接口读取开关失败：{configError}
                                {enabled !== null ? "（下面显示的是服务端读到的公开配置值）" : ""}
                            </span>
                        </p>
                    )}
                </div>
            </section>

            {/* ---- 列表（内容类型 + 审核状态 + 分页，全是真实接口） ---- */}
            <section className="rounded-xl border bg-card shadow-sm">
                <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2">
                    <Select
                        value={contentType}
                        onValueChange={(v) => {
                            setContentType(v as CommunityQaContentType);
                            setPage(1);
                            setRejectTarget(null);
                            setAnswerTarget(null);
                        }}
                    >
                        <SelectTrigger className="h-7 w-max text-xs" aria-label="内容类型">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {TYPE_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select
                        value={statusFilter}
                        onValueChange={(v) => {
                            setStatusFilter(v as "ALL" | CommunityQaStatus);
                            setPage(1);
                            setRejectTarget(null);
                        }}
                    >
                        <SelectTrigger className="h-7 w-max text-xs" aria-label="审核状态">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {STATUS_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <span className="ml-1 text-xs text-muted-foreground">
                        共 <span className="font-medium text-foreground">{total}</span> 条
                    </span>
                    <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                        {contentType === "questions"
                            ? "GET /api/pro/admin/community-qa/questions"
                            : "GET /api/pro/admin/community-qa/answers"}
                    </span>
                </div>

                {loading ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">加载中…</div>
                ) : rows.length === 0 ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">暂无该状态内容。</div>
                ) : (
                    <ul className="divide-y">
                        {rows.map((row, index) => {
                            const id = pickRowId(row);
                            const rowStatus = pickString(row, "status");
                            const reason = pickString(row, "moderation_reason");
                            const key = id || `row-${index}`;
                            const busy = actingKey === `${contentType}:${id}`;
                            const isQuestion = contentType === "questions";
                            const title = isQuestion ? pickString(row, "title") : "";
                            const content = pickString(row, "content");
                            const tags = isQuestion ? pickTags(row) : [];
                            const votes = isQuestion ? pickNumber(row, "vote_count") : null;
                            const accepted = isQuestion ? row.accepted_answer_id : null;
                            const createdAt = pickString(row, "created_at");
                            const questionRef = !isQuestion
                                ? {
                                      title: pickString(row, "question_title"),
                                      id: pickString(row, "question_id"),
                                  }
                                : null;

                            return (
                                <li key={key} className="flex flex-col gap-1.5 px-4 py-3">
                                    <div className="flex items-start gap-2">
                                        <div className="min-w-0 flex-1">
                                            {isQuestion ? (
                                                title ? (
                                                    frontUrl ? (
                                                        <a
                                                            href={`${frontUrl}/${encodeURIComponent(id)}`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="block break-words text-sm font-medium hover:underline"
                                                        >
                                                            {title}
                                                        </a>
                                                    ) : (
                                                        <p className="break-words text-sm font-medium">{title}</p>
                                                    )
                                                ) : (
                                                    <p className="text-sm text-muted-foreground">
                                                        （该问题没有返回标题字段）
                                                    </p>
                                                )
                                            ) : content ? (
                                                <p className="whitespace-pre-wrap break-words text-sm">{content}</p>
                                            ) : (
                                                <p className="text-sm text-muted-foreground">
                                                    （该回答没有返回 content 字段，可用字段：{Object.keys(row).join("、") || "无"}）
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex shrink-0 flex-col items-end gap-1">
                                            <Badge
                                                variant="secondary"
                                                className={`text-[11px] ${STATUS_BADGE_CLASS[rowStatus] ?? ""}`}
                                            >
                                                {COMMUNITY_QA_STATUS_LABEL[rowStatus] || rowStatus || "状态未知"}
                                            </Badge>
                                            {id && (
                                                <span className="font-mono text-[10px] text-muted-foreground">#{id}</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* 元信息：只显示后端真的返回了的内容 */}
                                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
                                        {questionRef && (questionRef.title || questionRef.id) && (
                                            <span className="min-w-0">
                                                所属问题：
                                                {questionRef.title ? (
                                                    <span className="text-foreground">{questionRef.title}</span>
                                                ) : (
                                                    <span className="font-mono">#{questionRef.id}</span>
                                                )}
                                                {questionRef.title && questionRef.id ? (
                                                    <span className="font-mono"> #{questionRef.id}</span>
                                                ) : null}
                                            </span>
                                        )}
                                        {tags.map((tag) => (
                                            <Badge key={tag} variant="outline" className="text-[10px] font-normal">
                                                {tag}
                                            </Badge>
                                        ))}
                                        {votes !== null && (
                                            <span className="inline-flex items-center gap-0.5">
                                                <ThumbsUp className="size-3" />
                                                {votes}
                                            </span>
                                        )}
                                        {isQuestion && accepted !== null && accepted !== undefined && accepted !== "" && (
                                            <span className="text-emerald-600 dark:text-emerald-400">已解决</span>
                                        )}
                                        {createdAt && <span>{createdAt}</span>}
                                    </div>

                                    {reason && <p className="text-[11px] text-muted-foreground">审核意见：{reason}</p>}

                                    {/* 操作：全部对应真实接口，没有删除（远端无此路由） */}
                                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className={`h-7 px-2 text-xs ${ACTION_TONE.approve}`}
                                            disabled={busy || rowStatus === "APPROVED"}
                                            title={
                                                rowStatus === "APPROVED"
                                                    ? "当前已是已公开状态"
                                                    : "PUT /pro/admin/community-qa/{type}/{id}/moderation { status: APPROVED }"
                                            }
                                            onClick={() => void handleModerate(row, "APPROVED")}
                                        >
                                            <CheckCircle2 className="size-3.5" />
                                            通过
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className={`h-7 px-2 text-xs ${ACTION_TONE.delete}`}
                                            disabled={busy || !id}
                                            title="PUT /pro/admin/community-qa/{type}/{id}/moderation { status: REJECTED, reason }"
                                            onClick={() => {
                                                setAnswerTarget(null);
                                                setRejectTarget(rejectTarget === key ? null : key);
                                                setRejectReason("");
                                            }}
                                        >
                                            <XCircle className="size-3.5" />
                                            驳回
                                        </Button>
                                        {rowStatus === "APPROVED" && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className={`h-7 px-2 text-xs ${ACTION_TONE.neutral}`}
                                                disabled={busy}
                                                title="PUT /pro/admin/community-qa/{type}/{id}/moderation { status: PENDING }"
                                                onClick={() => void handleModerate(row, "PENDING")}
                                            >
                                                打回待审
                                            </Button>
                                        )}
                                        {isQuestion && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className={`h-7 px-2 text-xs ${ACTION_TONE.view}`}
                                                disabled={busy || !id}
                                                title="POST /pro/community-qa/questions/{id}/answers —— 前台同一接口，以当前登录账号发表"
                                                onClick={() => {
                                                    setRejectTarget(null);
                                                    setAnswerTarget(answerTarget === key ? null : key);
                                                    setAnswerContent("");
                                                }}
                                            >
                                                <MessageCircle className="size-3.5" />
                                                作答
                                            </Button>
                                        )}
                                        {busy && <span className="text-[11px] text-muted-foreground">提交中…</span>}
                                    </div>

                                    {/* 驳回意见（可选）：官方 body 里就有 reason 字段 */}
                                    {rejectTarget === key && (
                                        <div className="mt-1 space-y-2 rounded-lg border bg-muted/40 p-2">
                                            <textarea
                                                value={rejectReason}
                                                onChange={(e) => setRejectReason(e.target.value)}
                                                rows={2}
                                                maxLength={500}
                                                placeholder="驳回原因（可选，会作为审核意见展示给作者）"
                                                className="w-full resize-y rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            />
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    variant="destructive"
                                                    size="sm"
                                                    className="h-7 px-2 text-xs"
                                                    disabled={busy}
                                                    onClick={() => void handleModerate(row, "REJECTED", rejectReason.trim())}
                                                >
                                                    确认驳回
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 px-2 text-xs"
                                                    onClick={() => {
                                                        setRejectTarget(null);
                                                        setRejectReason("");
                                                    }}
                                                >
                                                    取消
                                                </Button>
                                            </div>
                                        </div>
                                    )}

                                    {/* 作答输入框 */}
                                    {isQuestion && answerTarget === key && (
                                        <div className="mt-1 space-y-2 rounded-lg border bg-muted/40 p-2">
                                            <textarea
                                                value={answerContent}
                                                onChange={(e) => setAnswerContent(e.target.value)}
                                                rows={4}
                                                maxLength={10000}
                                                placeholder="写下你的回答…（发布后按后端审核策略处理，可能先进入待审核）"
                                                className="w-full resize-y rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            />
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    size="sm"
                                                    className="h-7 px-2 text-xs"
                                                    disabled={busy}
                                                    onClick={() => void handleAnswer(row)}
                                                >
                                                    发布回答
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 px-2 text-xs"
                                                    onClick={() => {
                                                        setAnswerTarget(null);
                                                        setAnswerContent("");
                                                    }}
                                                >
                                                    取消
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}

                <div className="border-t px-4 py-2">
                    <PaginationControls
                        page={page}
                        totalPages={totalPages}
                        onPageChange={setPage}
                        disabled={loading}
                    />
                </div>
            </section>
        </div>
    );
}
