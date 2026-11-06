/**
 * 首页刊头（masthead）。
 *
 * 对应「编辑部风」的第 A 步：把首页顶部从「一条导航 + 直接进列表」变成有刊头感的开篇 ——
 * 大号站名、期号（按累计文章数）、日期、一句导语，底部一条粗线收住。
 * 数据全由 page.tsx 从站点配置里取好传进来，本组件不取数。
 */

/** 今天的日期（yyyy.MM.dd）。抽成模块级函数：组件 render 里直接 new Date() 会被纯度规则拦。 */
function today(): string {
    const d = new Date();
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export function HomeMasthead({
    name,
    tagline,
    total,
    issue,
}: {
    /** 站点名 */
    name: string;
    /** 一句导语（站点副标题 / 描述） */
    tagline?: string;
    /** 累计文章数（用于“共 N 篇”） */
    total: number;
    /** 期号；不传则用「累计文章数 / 10 向上取整」，至少 01 */
    issue?: number;
}) {
    const issueNo = String(issue ?? Math.max(1, Math.ceil(total / 10))).padStart(2, "0");

    return (
        <section className="mb-2">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-foreground/80 pb-4">
                <div className="min-w-0">
                    <p className="font-mono text-[10px] tracking-[0.32em] text-muted-foreground uppercase">
                        Ciraos · Blog
                    </p>
                    <h1 className="editorial-serif mt-1 text-4xl leading-none font-bold tracking-tight sm:text-5xl">
                        {name}
                    </h1>
                </div>

                <div className="shrink-0 text-right font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground">
                    <p className="text-primary">№ {issueNo}</p>
                    <p>{today()}</p>
                    <p>共 {total} 篇</p>
                </div>
            </div>

            {tagline && (
                <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">{tagline}</p>
            )}
        </section>
    );
}
