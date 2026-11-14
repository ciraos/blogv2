"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { Info, Mic, X } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * 文章页「AI 播客」入口（官方设置项 ai_podcast.{enable,button_text,button_icon}）。
 *
 * 诚实说明（为什么不真的生成音频）：
 *  - 官方前端快照 scripts/theme/theme-anheyu-next-main/src 里**没有任何 AI 播客实现**，
 *    只有设置键（setting-keys.ts:486-499）和文章扩展字段 `enable_ai_podcast`
 *    （types/article.ts:160）；唯一相关痕迹是 essay 音乐播放器监听 `ai-podcast-play`
 *    事件（EssayMusicPlayer.tsx:274）——说明官方播客生成后会去抢占音乐播放器，但生成端没有开源。
 *  - 线上只读探活：/api/pro/admin/ai/podcast/config、/api/pro/articles/{id}/podcast 等
 *    候选路径**全部 404**，拿不到任何「生成播客」的后端证据（官方配置指向火山引擎豆包语音，
 *    属于后端 PRO 侧闭源能力）。
 *  - 线上公开文章接口实测**不返回 extra_config**，所以文章级 `enable_ai_podcast` 拿不到，
 *    这里只能按全局 ai_podcast.enable 决定显不显示入口。
 *
 * 所以本组件按官方口径渲染入口（按钮文案/图标都吃后台配置），但点击只给出
 * 「后端未提供该能力」的真实提示，绝不伪造音频或假装在生成。
 */
export function AiPodcastButton({
    enable,
    buttonText,
    buttonIcon,
}: {
    enable?: boolean;
    buttonText?: string;
    buttonIcon?: string;
}) {
    const [open, setOpen] = useState(false);
    const pathname = usePathname();

    // 只在文章详情页显示（/posts/{id}）：列表页 /posts、分类标签页都不显示。
    // 用 usePathname 而不是服务端 x-pathname —— 软导航时也能立刻跟着切。
    const isPostPage = /^\/posts\/[^/]+\/?$/.test(pathname ?? "");

    // 未开启、或不在文章页，就整块不渲染（线上默认 ai_podcast.enable = false）。
    // ⚠️ 属性名与站点配置字段保持一致（enable，不是 enabled）：早先写成 enabled 时，
    // 页面那边 {...aiPodcast} 展开传的是 enable，属性名对不上 → 组件永远返回 null，
    // 而且类型系统不会报错（可选属性 + 变量展开不做多余属性检查），只能靠运行态发现。
    if (!enable || !isPostPage) return null;

    const label = buttonText?.trim() || "AI 播客";
    // 官方存的是 iconify 名（默认 ri:mic-fill），本项目没有那套图标源 → 统一退化为 lucide 的 Mic，
    // 与 blog-sidebar 的 DocLinkIcon 同一处理原则（不引新依赖）。
    void buttonIcon;

    return (
        <>
            {/* 左下角悬浮入口：与 AI 助手 / 音乐播放器并排成同一列，样式保持一致（圆形图标按钮） */}
            <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label={label}
                title={label}
                className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg backdrop-blur transition-colors hover:border-primary hover:text-primary"
            >
                <Mic className="size-4" />
            </button>

            {open && typeof document !== "undefined" && createPortal(
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-label="AI 播客"
                    onMouseDown={() => setOpen(false)}
                >
                    <div
                        className="w-full max-w-md soft-surface p-4 shadow-xl"
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <h3 className="flex items-center gap-2 text-base font-semibold">
                                <Mic className="size-4 text-primary" />
                                {label}
                            </h3>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                aria-label="关闭"
                                className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                                <X className="size-4" />
                            </button>
                        </div>

                        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                            <div className="space-y-1">
                                <div className="font-medium">后端尚未提供播客生成接口</div>
                                <div>
                                    后台已开启「AI 播客」，所以这里按官方口径显示入口；但生成音频所需的语音合成接口
                                    （火山引擎豆包语音）在服务端没有开放，本站不会伪造音频或假装正在生成。
                                </div>
                            </div>
                        </div>

                        <div className="mt-3 flex justify-end">
                            <Button variant="outline" className="h-8 rounded-lg text-xs" onClick={() => setOpen(false)}>
                                知道了
                            </Button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
