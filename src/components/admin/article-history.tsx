"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clock, GitCompare, Loader2, RotateCcw, User } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    compareAdminArticleHistoryApi,
    getAdminArticleHistoryApi,
    restoreAdminArticleHistoryApi,
    type ArticleHistoryListItem,
    type ArticleHistoryVersion,
} from "@/lib/api";

/**
 * 文章历史版本页（对齐参照项目 article-editor/ArticleHistoryPage 的结构）：
 * 左边版本列表（可选两个用于对比、可回滚），右边对比面板（并排显示两版正文 + 标出改动行）。
 *
 * 数据来自后端 /articles/{id}/history、/history/compare、/history/{version}/restore。
 */
function formatTime(raw: string) {
    if (!raw) return "-";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleString("zh-CN", { hour12: false });
}

/** 行级差异：只标出「只在另一版出现」的行，够用且不引额外依赖。
 *  两列都带上 removed/added 两个标记（即使另一侧恒为 false），这样渲染时能用同一个类型。 */
function diffLines(oldText: string, newText: string) {
    const oldLines = oldText.replace(/\r\n/g, "\n").split("\n");
    const newLines = newText.replace(/\r\n/g, "\n").split("\n");
    const oldSet = new Set(oldLines.map((l) => l.trim()).filter(Boolean));
    const newSet = new Set(newLines.map((l) => l.trim()).filter(Boolean));
    return {
        old: oldLines.map((l) => ({ text: l, removed: l.trim() !== "" && !newSet.has(l.trim()), added: false })),
        new: newLines.map((l) => ({ text: l, removed: false, added: l.trim() !== "" && !oldSet.has(l.trim()) })),
    };
}

export function ArticleHistory({ articleId }: { articleId: string }) {
    const [list, setList] = useState<ArticleHistoryListItem[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [picked, setPicked] = useState<number[]>([]);
    const [compare, setCompare] = useState<{ old_version: ArticleHistoryVersion | null; new_version: ArticleHistoryVersion | null } | null>(null);
    const [comparing, setComparing] = useState(false);
    const [restoreTarget, setRestoreTarget] = useState<ArticleHistoryListItem | null>(null);
    const [restoreNote, setRestoreNote] = useState("");
    const [restoring, setRestoring] = useState(false);

    // 注意：这里不写 setLoading(true) —— effect 里同步 setState 会触发 react-hooks/set-state-in-effect。
    // 首屏 loading 初值就是 true；「刷新」按钮自己负责把 loading 置回 true。
    const load = useCallback(async () => {
        try {
            const res = await getAdminArticleHistoryApi(articleId, 1, 50);
            setList(res?.list ?? []);
            setTotal(res?.total ?? 0);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "加载历史版本失败");
        }
        // 放在 await 之后（不写 finally：react-hooks/set-state-in-effect 对 finally 判得更严）
        setLoading(false);
    }, [articleId]);

    useEffect(() => {
        // 挂载时拉历史列表：典型的「effect 里发起数据请求」，setState 都发生在 await 之后。
        // 该规则对经过 useCallback 的异步函数判得过严，这里显式豁免。
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
    }, [load]);

    const refresh = async () => {
        setLoading(true);
        await load();
    };

    const togglePick = (version: number) => {
        setPicked((prev) => {
            if (prev.includes(version)) return prev.filter((v) => v !== version);
            // 最多选两个：再选就把最早的挤掉
            return [...prev, version].slice(-2);
        });
        setCompare(null);
    };

    const doCompare = async () => {
        if (picked.length !== 2) {
            toast.error("请选择两个版本再对比");
            return;
        }
        const [a, b] = [...picked].sort((x, y) => x - y);
        setComparing(true);
        try {
            const res = await compareAdminArticleHistoryApi(articleId, a, b);
            setCompare({ old_version: res?.old_version ?? null, new_version: res?.new_version ?? null });
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "对比失败");
        } finally {
            setComparing(false);
        }
    };

    const doRestore = async () => {
        if (!restoreTarget) return;
        setRestoring(true);
        try {
            await restoreAdminArticleHistoryApi(articleId, restoreTarget.version, restoreNote.trim());
            toast.success(`已回滚到 v${restoreTarget.version}`);
            setRestoreTarget(null);
            setRestoreNote("");
            setCompare(null);
            setPicked([]);
            await load();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "回滚失败");
        } finally {
            setRestoring(false);
        }
    };

    const diff = compare?.old_version && compare?.new_version
        ? diffLines(compare.old_version.content_md ?? "", compare.new_version.content_md ?? "")
        : null;

    return (
        <div className="admin-page">
            {/* 顶栏 */}
            <div className="admin-page-head">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" asChild title="返回编辑">
                        <Link href={`/admin/post-management/${articleId}/edit`}>
                            <ArrowLeft className="size-4" />
                        </Link>
                    </Button>
                    <div>
                        <h2 className="text-xl font-semibold tracking-tight">历史版本</h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                            文章 ID：{articleId} · 共 {total} 个版本 · 勾选两个可对比，选中某一版可回滚
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={doCompare} disabled={picked.length !== 2 || comparing}>
                        {comparing ? <Loader2 className="size-4 animate-spin" /> : <GitCompare className="size-4" />}
                        对比选中的两版
                    </Button>
                    <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
                        {loading ? <Loader2 className="size-4 animate-spin" /> : <Clock className="size-4" />}
                        刷新
                    </Button>
                </div>
            </div>

            <div className="admin-card">
                <div className="admin-scroll">
                    <div className="grid grid-cols-1 gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
                        {/* 版本列表 */}
                        <ol className="space-y-2">
                            {loading && list.length === 0 && (
                                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="size-4 animate-spin" /> 加载中…
                                </li>
                            )}
                            {!loading && list.length === 0 && (
                                <li className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
                                    还没有历史版本（保存后才会产生）
                                </li>
                            )}
                            {list.map((v) => {
                                const on = picked.includes(v.version);
                                return (
                                    <li
                                        key={v.id ?? v.version}
                                        className={`rounded-xl border p-3 transition-colors ${on ? "border-primary bg-primary/5" : "bg-card/60 hover:bg-muted/40"}`}
                                    >
                                        <div className="flex items-start gap-2.5">
                                            <input
                                                type="checkbox"
                                                checked={on}
                                                onChange={() => togglePick(v.version)}
                                                aria-label={`选择版本 ${v.version}`}
                                                className="mt-0.5 size-4 shrink-0 accent-primary"
                                            />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-primary">
                                                        v{v.version}
                                                    </span>
                                                    <span className="truncate text-sm font-medium" title={v.title}>
                                                        {v.title || "（无标题）"}
                                                    </span>
                                                </div>
                                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                                                    <span className="tabular-nums">{formatTime(v.created_at)}</span>
                                                    <span className="tabular-nums">{v.word_count ?? 0} 字</span>
                                                    {v.editor_nickname && (
                                                        <span className="inline-flex items-center gap-1">
                                                            <User className="size-3" />
                                                            {v.editor_nickname}
                                                        </span>
                                                    )}
                                                </div>
                                                {v.change_note && (
                                                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/80">{v.change_note}</p>
                                                )}
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 shrink-0"
                                                onClick={() => {
                                                    setRestoreTarget(v);
                                                    setRestoreNote("");
                                                }}
                                            >
                                                <RotateCcw className="size-3.5" />
                                                回滚
                                            </Button>
                                        </div>
                                    </li>
                                );
                            })}
                        </ol>

                        {/* 对比 / 空态 */}
                        <div className="min-w-0">
                            {!compare && (
                                <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                                    <GitCompare className="size-5" />
                                    <p>勾选左侧两个版本，点「对比选中的两版」</p>
                                    <p className="text-xs text-muted-foreground/70">对比只读展示，不会改动文章内容</p>
                                </div>
                            )}
                            {compare && diff && (
                                <div className="space-y-3">
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                        <span>
                                            旧版 v{compare.old_version?.version} · {formatTime(compare.old_version?.created_at ?? "")} ·{" "}
                                            {compare.old_version?.word_count ?? 0} 字
                                        </span>
                                        <span className="text-primary">→</span>
                                        <span>
                                            新版 v{compare.new_version?.version} · {formatTime(compare.new_version?.created_at ?? "")} ·{" "}
                                            {compare.new_version?.word_count ?? 0} 字
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                                        {[
                                            { key: "old", title: `v${compare.old_version?.version}（旧）`, rows: diff.old },
                                            { key: "new", title: `v${compare.new_version?.version}（新）`, rows: diff.new },
                                        ].map((col) => (
                                            <div key={col.key} className="overflow-hidden rounded-xl border">
                                                <div className="border-b bg-muted/40 px-3 py-1.5 text-xs font-medium">{col.title}</div>
                                                <pre className="max-h-[60vh] overflow-auto p-3 font-mono text-xs leading-relaxed">
                                                    {col.rows.map((r, i) => (
                                                        <div
                                                            key={i}
                                                            className={
                                                                (col.key === "old" && r.removed) || (col.key === "new" && r.added)
                                                                    ? col.key === "old"
                                                                        ? "bg-destructive/10 text-destructive"
                                                                        : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                                                    : ""
                                                            }
                                                        >
                                                            {r.text || " "}
                                                        </div>
                                                    ))}
                                                </pre>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* 回滚确认条 */}
            {restoreTarget && (
                <div className="fixed inset-x-0 bottom-4 z-[70] mx-auto w-[min(680px,calc(100vw-2rem))] rounded-xl border bg-card p-3 shadow-lg">
                    <p className="text-sm">
                        把文章回滚到 <span className="font-semibold text-primary">v{restoreTarget.version}</span>？
                        当前内容会被该版本覆盖（旧内容仍保留为历史版本，可再回滚回来）。
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Input
                            value={restoreNote}
                            onChange={(e) => setRestoreNote(e.target.value)}
                            placeholder="回滚说明（可选，写进历史记录）"
                            className="h-8 min-w-[200px] flex-1"
                        />
                        <Button variant="outline" size="sm" onClick={() => setRestoreTarget(null)} disabled={restoring}>
                            取消
                        </Button>
                        <Button size="sm" onClick={doRestore} disabled={restoring}>
                            {restoring && <Loader2 className="size-3.5 animate-spin" />}
                            确认回滚
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
