"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, SendHorizontal, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * 前台「AI 助手」悬浮入口（官方设置项 ai_assistant.{enable,name,welcome,chat_suggestions,search_suggestions}）。
 *
 * 诚实说明（为什么没有对话能力）：
 *  - 官方前端快照里**没有 AI 助手的前端实现**：全仓库只有设置键（setting-keys.ts:500-511）、
 *    设置表单（AISettingsForm.tsx:551-679，明确标注「AI 助手 (PRO)」）与默认 Prompt
 *    （setting-descriptors.ts:126-141）；没有聊天 UI、没有调用点。
 *  - 后端社区版源码 internal/infra/router/router.go 里没有任何 /ai/ 路由；
 *    线上只读探活 /api/pro/admin/ai/assistant/config、/api/ai/chat、/api/pro/ai/chat 等
 *    候选路径全部 404，拿不到对话接口存在的证据（同批命中的只有 /ai/writing/config → 401）。
 *  - 线上 /api/public/site-config 确实会下发 ai_assistant.*，所以「入口 + 文案 + 建议问题」
 *    是真实数据，可以照实渲染。
 *
 * 因此本组件：入口显隐、名称、欢迎语、建议问题全部吃后台真实配置；
 * 「对话」部分不做任何伪造回答（发送按钮禁用 + 明确提示），
 * 但建议词里的「搜索建议」是真的能用的 —— 点了会跳到站内搜索 /search?q=...（搜索是既有可用能力）。
 */
export function AiAssistantLauncher({
    enabled,
    name,
    welcome,
    chatSuggestions,
    searchSuggestions,
    embedded = false,
}: {
    enabled?: boolean;
    name?: string;
    welcome?: string;
    chatSuggestions?: string[];
    searchSuggestions?: string[];
    /** 由外层容器统一负责定位（与音乐播放器共用左下角一列）时传 true */
    embedded?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState("");
    const panelRef = useRef<HTMLDivElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);

    /** 点击面板与按钮之外的区域收起（与 FloatingActions 同一套交互习惯） */
    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e: PointerEvent) => {
            const target = e.target as Node;
            if (rootRef.current?.contains(target)) return;
            setOpen(false);
        };
        document.addEventListener("pointerdown", onPointerDown);
        return () => document.removeEventListener("pointerdown", onPointerDown);
    }, [open]);

    // 未开启就整个不渲染（线上默认 ai_assistant.enable = false）
    if (!enabled) return null;

    const assistantName = name?.trim() || "AI 助手";
    const chats = (chatSuggestions ?? []).filter((s) => s && s.trim());
    const searches = (searchSuggestions ?? []).filter((s) => s && s.trim());

    return (
        <div ref={rootRef} className={embedded ? "flex flex-col items-start gap-3" : "fixed bottom-5 left-5 z-50 flex flex-col items-start gap-3"}>
            {/* 对话面板 */}
            {open && (
                <div
                    ref={panelRef}
                    role="dialog"
                    aria-modal="false"
                    aria-label={assistantName}
                    className="flex max-h-[70vh] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden soft-surface shadow-xl"
                >
                    <div className="flex items-center gap-2 border-b px-4 py-3">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <Sparkles className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold">{assistantName}</div>
                            <div className="truncate text-[11px] text-muted-foreground">站点问答入口</div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            aria-label="收起"
                            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                            <X className="size-4" />
                        </button>
                    </div>

                    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                        {welcome?.trim() && (
                            <div className="rounded-lg bg-muted/60 px-3 py-2 text-sm leading-relaxed text-foreground">
                                {welcome}
                            </div>
                        )}

                        {chats.length > 0 && (
                            <div className="space-y-1.5">
                                <div className="text-[11px] font-medium text-muted-foreground">常见问题</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {chats.map((q) => (
                                        <button
                                            key={q}
                                            type="button"
                                            onClick={() => setDraft(q)}
                                            className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                                        >
                                            {q}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {searches.length > 0 && (
                            <div className="space-y-1.5">
                                <div className="text-[11px] font-medium text-muted-foreground">去站内搜索</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {searches.map((q) => (
                                        <Link
                                            key={q}
                                            href={`/search?q=${encodeURIComponent(q)}`}
                                            onClick={() => setOpen(false)}
                                            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                                        >
                                            <Search className="size-3" />
                                            {q}
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2 border-t p-3">
                        <Input
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            placeholder="输入你的问题…"
                            aria-label="提问内容"
                            className="h-8 text-sm"
                        />
                        <Button
                            className="h-8 shrink-0 rounded-lg text-xs"
                            disabled
                            title="暂未开放对话能力"
                        >
                            <SendHorizontal className="size-3.5" />
                            发送
                        </Button>
                    </div>
                </div>
            )}

            {/* 悬浮入口（左下角：右下角已被 FloatingActions 占用，避免两个悬浮组叠在一起） */}
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-label={open ? `收起 ${assistantName}` : `打开 ${assistantName}`}
                title={assistantName}
                className={`flex size-10 items-center justify-center rounded-full border shadow-lg backdrop-blur transition-colors ${
                    open
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-foreground hover:border-primary hover:text-primary"
                }`}
            >
                <Sparkles className="size-4" />
            </button>
        </div>
    );
}
