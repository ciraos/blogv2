import { ExternalLink } from "lucide-react";

import { renderChangelogMarkdown } from "@/lib/changelog-markdown";

/** 时间线条目（后端 / 前端两个 tab 共用这一种形状） */
export interface ChangelogListItem {
    /** 唯一 key */
    id: string;
    /** 版本号，如 v1.9.1 */
    version: string;
    /** 发布时间（ISO 字符串） */
    date: string;
    /** 徽标文案（如「最新」），不传则不显示 */
    badge?: string | null;
    /** 右侧外链（GitHub Release） */
    href?: string | null;
    /** 正文（Markdown） */
    body: string;
}

/** 把 ISO 时间格式化成「2026年10月18日 13:40」（固定用 Asia/Shanghai，跟服务器时区无关） */
function formatPublishedAt(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
}

/**
 * 更新日志时间线（对齐官方前端 /update 页）：
 * 左侧一条竖线 + 每张卡一个圆点，卡片里是「版本号 + 徽标 → 发布时间 → 正文」。
 * 正文是 Markdown，由 renderChangelogMarkdown 转成安全的 HTML 再挂上去。
 */
export function ChangelogTimeline({ entries }: { entries: ChangelogListItem[] }) {
    return (
        <ol className="relative space-y-4">
            {/* 竖线：从第一张卡的中线拉到最后一行的中线附近 */}
            <span aria-hidden className="absolute bottom-6 left-[7px] top-6 w-px bg-border" />

            {entries.map((entry) => (
                <li key={entry.id} className="relative pl-8">
                    {/* 时间线圆点：钉在竖线上 */}
                    <span
                        aria-hidden
                        className={`absolute left-0 top-6 size-3.5 rounded-full border-2 border-background ${entry.badge ? "bg-primary" : "bg-border"}`}
                    />

                    <article className="rounded-xl border bg-card p-5 shadow-sm">
                        <div className="border-b pb-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-xl font-bold tracking-tight">{entry.version}</h2>
                                {entry.badge && (
                                    <span className="rounded bg-green-100 px-1.5 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-500/15 dark:text-green-400">
                                        {entry.badge}
                                    </span>
                                )}
                                {entry.href && (
                                    <a
                                        href={entry.href}
                                        target="_blank"
                                        rel="noopener noreferrer nofollow"
                                        className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary"
                                        title="在 GitHub 查看这个版本"
                                    >
                                        GitHub
                                        <ExternalLink className="size-3" aria-hidden />
                                    </a>
                                )}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">{formatPublishedAt(entry.date)}</p>
                        </div>

                        {/* 正文排版：标题/列表/行内代码/链接一套紧凑样式（比文章正文小一号） */}
                        <div
                            className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:text-foreground [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-foreground [&_h4]:mt-3 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:text-foreground [&_hr]:my-4 [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:pl-5"
                            dangerouslySetInnerHTML={{ __html: renderChangelogMarkdown(entry.body) }}
                        />
                    </article>
                </li>
            ))}
        </ol>
    );
}
