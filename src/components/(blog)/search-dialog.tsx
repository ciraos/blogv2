"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { ArrowRight, Loader2, Search, SearchX } from "lucide-react";

import { searchArticlesClientApi, type SearchHit } from "@/lib/api";
import { resolveAssetUrl } from "@/lib/utils";

/** 防抖延迟（毫秒）：输入停止后多久发起搜索 */
const DEBOUNCE_MS = 300;

function formatDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function HitItem({ hit, onSelect }: { hit: SearchHit; onSelect: () => void }) {
    const isPost = hit.type === "post" || (!hit.type && !hit.is_doc);
    const href = isPost ? `/posts/${hit.id}` : hit.url || `/posts/${hit.id}`;
    const cover = resolveAssetUrl(hit.cover_url);

    return (
        <Link
            href={href}
            onClick={onSelect}
            className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted"
        >
            {cover ? (
                <div className="h-11 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={cover}
                        alt={hit.title}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                </div>
            ) : (
                <div className="flex h-11 w-16 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Search className="size-4" />
                </div>
            )}
            <div className="min-w-0 flex-1">
                <div className="line-clamp-1 text-sm font-medium group-hover:text-primary">{hit.title}</div>
                {hit.snippet && (
                    <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{hit.snippet}</div>
                )}
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                    {hit.category && <span>{hit.category}</span>}
                    {hit.publish_date && <span>{formatDate(hit.publish_date)}</span>}
                    {hit.view_count > 0 && <span>{hit.view_count} 阅读</span>}
                </div>
            </div>
        </Link>
    );
}

/** 站内搜索对话框：点击按钮弹出，顶部输入框（自动聚焦），下方实时显示搜索结果。
 *  触发器本身透明无背景，白色胶囊背景由 Header 外层容器提供（移动端与汉堡按钮共用）。 */
export function SearchDialog() {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");
    const [hits, setHits] = useState<SearchHit[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const timerRef = useRef<number | null>(null);

    // 防抖搜索：输入停止 DEBOUNCE_MS 后发起请求
    useEffect(() => {
        const keyword = q.trim();
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        if (!keyword) {
            // React Compiler 规则：effect 内不直接同步 setState，用宏任务包裹
            setTimeout(() => {
                setHits([]);
                setTotal(0);
                setSearched(false);
                setError(null);
            }, 0);
            return;
        }
        timerRef.current = window.setTimeout(async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await searchArticlesClientApi({ q: keyword, page: 1, size: 8 });
                setHits(data.hits ?? []);
                setTotal(data.pagination?.total ?? 0);
                setSearched(true);
            } catch (err) {
                setHits([]);
                setTotal(0);
                setSearched(true);
                setError(err instanceof Error ? err.message : "搜索失败，请稍后重试");
            } finally {
                setLoading(false);
            }
        }, DEBOUNCE_MS);
        return () => {
            if (timerRef.current !== null) {
                window.clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [q]);

    // 打开对话框时：清空旧结果并聚焦输入框
    const handleOpenChange = (next: boolean) => {
        setOpen(next);
        if (next) {
            setTimeout(() => inputRef.current?.focus(), 0);
        } else {
            setTimeout(() => {
                setQ("");
                setHits([]);
                setTotal(0);
                setSearched(false);
                setError(null);
            }, 0);
        }
    };

    // 回车：跳转完整搜索结果页
    const submit = useCallback(() => {
        const keyword = q.trim();
        if (!keyword) return;
        setOpen(false);
        router.push(`/search?q=${encodeURIComponent(keyword)}`);
    }, [q, router]);

    return (
        <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
            <DialogPrimitive.Trigger asChild>
                <button
                    type="button"
                    aria-label="搜索"
                    title="搜索"
                    className="inline-flex size-11 items-center justify-center rounded-l-lg rounded-r-none text-muted-foreground transition-colors hover:text-primary"
                >
                    <Search className="size-5" />
                </button>
            </DialogPrimitive.Trigger>

            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
                <DialogPrimitive.Content className="fixed left-1/2 top-[15vh] z-50 w-[min(94vw,32rem)] -translate-x-1/2 rounded-xl border bg-card shadow-2xl data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
                    {/* 顶部：收缩式输入框（聚焦时高亮描边） */}
                    <div className="flex items-center gap-2 border-b px-4 py-3">
                        <Search className="size-4 shrink-0 text-muted-foreground" />
                        <input
                            ref={inputRef}
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") submit();
                            }}
                            placeholder="搜索文章、页面、相册…"
                            className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                        />
                        {loading && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
                        <DialogPrimitive.Close asChild>
                            <button
                                type="button"
                                aria-label="关闭搜索"
                                className="shrink-0 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                                ESC
                            </button>
                        </DialogPrimitive.Close>
                    </div>

                    {/* 下方：搜索结果 / 空态 / 错误态 */}
                    <div className="no-scrollbar max-h-[50vh] overflow-y-auto p-2">
                        {!q.trim() ? (
                            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
                                输入关键词开始搜索
                            </p>
                        ) : loading ? (
                            <p className="px-3 py-10 text-center text-sm text-muted-foreground">正在搜索…</p>
                        ) : error ? (
                            <p className="px-3 py-10 text-center text-sm text-destructive">{error}</p>
                        ) : searched && hits.length === 0 ? (
                            <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
                                <SearchX className="size-8 text-muted-foreground/60" />
                                <p className="text-sm text-muted-foreground">没有找到与「{q.trim()}」相关的内容</p>
                            </div>
                        ) : (
                            <>
                                <div className="space-y-0.5">
                                    {hits.map((hit) => (
                                        <HitItem
                                            key={hit.id}
                                            hit={hit}
                                            onSelect={() => setOpen(false)}
                                        />
                                    ))}
                                </div>
                                {total > hits.length && (
                                    <button
                                        type="button"
                                        onClick={submit}
                                        className="mt-1 flex w-full items-center justify-center gap-1 rounded-lg px-3 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
                                    >
                                        查看全部 {total} 条结果
                                        <ArrowRight className="size-4" />
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}
