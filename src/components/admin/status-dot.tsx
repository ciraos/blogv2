import { cn } from "@/lib/utils";

/**
 * 状态点：一个 6px 圆点 + 一行小字，替代「浅底 + 同色字」的胶囊徽章。
 *
 * 为什么换：状态是**元信息**，不是奖章。一列下来十几颗彩色胶囊，颜色在同一列里
 * 反复出现，既不传达额外信息，又把注意力从「内容」抢到「标签」上。
 * 现在颜色只缩到 6px 的圆点里，文字回到和正文同一层灰。
 *
 * `tone` 优先；只给 `cls` 时按颜色词归一到 6 个语义色 ——
 * 后台各页的 badge 函数暂时还返回 `{ label, cls }`（浅底 + 同色字的旧样式），
 * 过渡期先靠 `toneFromCls` 读出语义，等那些函数重写时再直接传 `tone`。
 */
const TONE_BG = {
    ok: "bg-emerald-500",
    warn: "bg-amber-500",
    bad: "bg-red-500",
    info: "bg-sky-500",
    accent: "bg-violet-500",
    neutral: "bg-muted-foreground",
} as const;

export type StatusTone = keyof typeof TONE_BG;

export function toneFromCls(cls?: string): StatusTone {
    const value = cls ?? "";
    if (/red|rose|destructive/.test(value)) return "bad";
    if (/green|emerald/.test(value)) return "ok";
    if (/yellow|amber|orange/.test(value)) return "warn";
    if (/blue|sky|cyan|indigo/.test(value)) return "info";
    if (/violet|purple|fuchsia/.test(value)) return "accent";
    return "neutral";
}

export function StatusDot({
    cls,
    tone,
    className,
    children,
}: {
    /** 旧的胶囊 class（过渡期用，用来推导语义色） */
    cls?: string;
    /** 明确指定语义色（优先于 cls） */
    tone?: StatusTone;
    className?: string;
    children: React.ReactNode;
}) {
    const key = tone ?? toneFromCls(cls);
    return (
        <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
            <span className={cn("size-1.5 shrink-0 rounded-full", TONE_BG[key])} aria-hidden />
            {children}
        </span>
    );
}
