import Link from "next/link";

interface TimelineShellProps {
    title: string;
    icon: React.ReactNode;
    linkText?: string;
    linkHref?: string;
    children: React.ReactNode;
}

/** 首页时间轴外壳：居中花哨标题（图标徽章 + 渐变文字 + 装饰线）+ 全宽内容 */
export function TimelineShell({ title, icon, linkText, linkHref, children }: TimelineShellProps) {
    return (
        <section className="w-full">
            {/* 居中花哨标题 */}
            <div className="relative text-center">
                <h2 className="inline-flex items-center gap-2 text-xl font-bold tracking-tight">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-pink-500 to-indigo-500 text-white shadow-sm">
                        {icon}
                    </span>
                    <span className="bg-gradient-to-r from-pink-500 via-fuchsia-500 to-indigo-500 bg-clip-text text-transparent">
                        {title}
                    </span>
                </h2>

                {/* 装饰线：两侧渐变线 + 中间粉色小点 */}
                <div className="mt-2 flex items-center justify-center gap-3" aria-hidden="true">
                    <span className="h-px w-16 bg-gradient-to-r from-transparent to-pink-300" />
                    <span className="size-1.5 rounded-full bg-pink-400" />
                    <span className="h-px w-16 bg-gradient-to-l from-transparent to-pink-300" />
                </div>

                {/* 右上角：查看全部 / 提示 */}
                {linkText &&
                    (linkHref ? (
                        <Link
                            href={linkHref}
                            className="absolute right-0 top-0 text-xs font-medium text-muted-foreground transition-colors hover:text-pink-500"
                        >
                            {linkText} →
                        </Link>
                    ) : (
                        <span className="absolute right-0 top-0 text-xs text-muted-foreground">{linkText}</span>
                    ))}
            </div>

            <div className="relative mt-4">{children}</div>
        </section>
    );
}
