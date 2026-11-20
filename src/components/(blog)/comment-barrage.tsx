"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, MessageSquareQuote } from "lucide-react";

interface BarrageItem {
    id: string;
    nickname: string;
    text: string;
    isAdmin: boolean;
}

/** 隐藏热评的偏好（跨页面记住） */
const HIDDEN_KEY = "blog:barrage-hidden";
/** 一次最多飘几条：太多会把封面糊死 */
const MAX_ITEMS = 10;

/** 后端 /public/comments/latest 的单条结构（只取用得到的字段） */
interface LatestComment {
    id: string;
    nickname: string;
    content?: string;
    content_html?: string;
    is_admin_comment?: boolean;
}

/** 从 HTML 里剥纯文本：弹幕只显示一行摘要 */
function toText(comment: LatestComment): string {
    const raw = (comment.content ?? "").trim() || (comment.content_html ?? "").replace(/<[^>]*>/g, " ");
    return raw.replace(/\s+/g, " ").trim();
}

/**
 * 评论弹幕（后台 `comment.barrage_enable`，官方叫「文章详情页评论弹幕（热评）」）。
 *
 * 形态：**整个浏览器可视区域**从右往左飘过几条最新热评 —— 每条「昵称：摘要」，点一下滚到评论区。
 * 所以弹幕层是 `fixed inset-0`（铺满视口，而不是窝在封面里），单条自己的动画从视口右缘飞进、
 * 从左缘飞出。数据来自 `GET /public/comments/latest`（站内同源代理），不依赖本页评论。
 *
 * 细节：
 *  · 每条的轨道（纵向位置）、时长、延迟随机，避免整齐划一像跑马灯；
 *  · 鼠标悬停整层暂停（`animation-play-state`），想看清某条时不用追着看；
 *  · 右上角「隐藏热评」按钮，偏好写 localStorage，下次不再出现；
 *  · 系统开了「减少动态效果」→ 不飘，改成静态列 2 条，避免前庭不适；
 *  · z-index 压在页头（z-50）之下：弹幕飘过但点得到导航，只有弹幕本身可点。
 */
export function CommentBarrage() {
    const [items, setItems] = useState<BarrageItem[]>([]);
    const [hidden, setHidden] = useState(true); // 先按隐藏渲染，挂载后再读 localStorage（避免 SSR 抖动）
    const [paused, setPaused] = useState(false);
    const [reduceMotion, setReduceMotion] = useState(false);
    const hostRef = useRef<HTMLDivElement>(null);

    // 读偏好 + 拉热评（都放在挂载后做，SSR 阶段不碰 localStorage / 网络）
    useEffect(() => {
        let cancelled = false;
        const timer = window.setTimeout(() => {
            if (cancelled) return;
            try {
                setHidden(localStorage.getItem(HIDDEN_KEY) === "1");
            } catch {
                setHidden(false);
            }
            setReduceMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
        }, 0);

        void (async () => {
            try {
                const res = await fetch("/api/public/comments/latest?page=1&pageSize=20", { cache: "no-store" });
                if (!res.ok) return;
                const json = (await res.json()) as { data?: { list?: LatestComment[] } };
                if (cancelled) return;
                const list = json.data?.list ?? [];
                const picked = list
                    .map((comment) => ({
                        id: comment.id,
                        nickname: comment.nickname,
                        text: toText(comment).slice(0, 80),
                        isAdmin: comment.is_admin_comment === true,
                    }))
                    .filter((item) => item.text.length > 0)
                    // 随机抽几条，让每次进页面看到的组合不一样
                    .sort(() => Math.random() - 0.5)
                    .slice(0, MAX_ITEMS);
                setItems(picked);
            } catch {
                // 拉不到就不显示弹幕（纯装饰，不能影响正文）
            }
        })();

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, []);

    /** 每条弹幕的随机轨道 / 时长 / 延迟：用 id 做种子，重渲染不会跳来跳去 */
    const lanes = useMemo(
        () =>
            items.map((item, index) => {
                const seed = (item.id.charCodeAt(0) + index * 37) % 100;
                return {
                    // 铺满整屏：纵向 8%~78%（下面 20% 留给右下角悬浮按钮/左下角按钮组，别打架）
                    top: 8 + ((seed * 7) % 70),
                    duration: 13 + ((seed * 3) % 7), // 13~19 秒穿屏
                    delay: -(seed % 12), // 负延迟：进来时已经飘在半路，不会空场
                };
            }),
        [items]
    );

    const hide = () => {
        setHidden(true);
        try {
            localStorage.setItem(HIDDEN_KEY, "1");
        } catch {
            // 隐私模式：忽略，刷新后还会出现
        }
    };

    const jump = () => {
        document.getElementById("post-comment")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    // 没数据 / 已隐藏：只保留「重新显示」入口（避免用户点了隐藏就再也找不回来）
    if (hidden) {
        return (
            <button
                type="button"
                onClick={() => {
                    setHidden(false);
                    try {
                        localStorage.removeItem(HIDDEN_KEY);
                    } catch {
                        // 忽略
                    }
                }}
                aria-label="显示热评弹幕"
                title="显示热评弹幕"
                className="fixed right-3 top-20 z-30 inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-[11px] text-white/90 shadow-sm backdrop-blur-sm transition-colors hover:bg-black/65"
            >
                <Eye className="size-3" aria-hidden />
                热评
            </button>
        );
    }

    if (items.length === 0) return null;

    return (
        <div
            ref={hostRef}
            aria-hidden
            className="pointer-events-none fixed inset-0 z-30 overflow-hidden"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
        >
            <button
                type="button"
                onClick={hide}
                aria-label="隐藏热评弹幕"
                title="隐藏热评弹幕"
                className="pointer-events-auto absolute right-3 top-20 z-30 inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-[11px] text-white/90 shadow-sm backdrop-blur-sm transition-colors hover:bg-black/65"
            >
                <EyeOff className="size-3" aria-hidden />
                隐藏弹幕
            </button>

            {reduceMotion ? (
                // 减少动态效果：不飘，静态列两条
                <div className="pointer-events-auto absolute left-3 top-20 max-w-[min(80vw,26rem)] space-y-1.5">
                    {items.slice(0, 2).map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={jump}
                            className="flex max-w-full items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-left text-[11px] text-white/90 shadow-sm backdrop-blur-sm"
                        >
                            <MessageSquareQuote className="size-3 shrink-0" aria-hidden />
                            <span className="truncate">
                                {item.nickname}：{item.text}
                            </span>
                        </button>
                    ))}
                </div>
            ) : (
                items.map((item, index) => (
                    <button
                        key={item.id}
                        type="button"
                        onClick={jump}
                        className="comment-barrage__item pointer-events-auto absolute left-full flex max-w-[min(80vw,28rem)] items-center gap-1.5 whitespace-nowrap rounded-full bg-black/45 px-2.5 py-1 text-[11px] text-white/90 shadow-sm backdrop-blur-sm transition-colors hover:bg-black/65"
                        style={{
                            top: `${lanes[index]?.top ?? 10}%`,
                            animationDuration: `${lanes[index]?.duration ?? 15}s`,
                            animationDelay: `${lanes[index]?.delay ?? 0}s`,
                            animationPlayState: paused ? "paused" : "running",
                        }}
                    >
                        <MessageSquareQuote className="size-3 shrink-0 opacity-70" aria-hidden />
                        <span className="truncate">
                            {item.nickname}
                            {item.isAdmin && <span className="ml-1 opacity-70">· 博主</span>}：{item.text}
                        </span>
                    </button>
                ))
            )}
        </div>
    );
}
