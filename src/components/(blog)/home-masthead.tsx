/**
 * 首页刊头（masthead）。
 *
 * 对应「编辑部风」的第 A 步：把首页顶部从「一条导航 + 直接进列表」变成有刊头感的开篇 ——
 * 大号站名、一句导语、一枚期号印记，报头双线收住。
 * 数据全由 page.tsx 从站点配置里取好传进来，本组件不取数。
 *
 * 这一版把强调色收到只剩「期号印记」一处：原来「№ 01」和分类、分页一起用主题色，
 * 三个地方都在抢眼，等于没有重点。日期与篇数回到等宽小字里，不做全大写字距。
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
    /** 累计文章数（用于「共 N 篇」） */
    total: number;
    /** 期号；不传则用「累计文章数 / 10 向上取整」，至少 01 */
    issue?: number;
}) {
    const issueNo = String(issue ?? Math.max(1, Math.ceil(total / 10))).padStart(2, "0");

    return (
        <section className="mb-10">
            {/* 刊头眉线：左日期、右篇数，等宽小字对齐在一条线上 */}
            <div className="flex items-baseline justify-between gap-4 border-b border-border/70 pb-2 font-mono text-[11px] tabular-nums text-muted-foreground">
                <span>{today()}</span>
                <span>共 {total} 篇</span>
            </div>

            <div className="mt-6">
                {/* 站名与期号印记同一行，印记贴着字尾 —— 像纸刊上盖在刊头边上的那枚印 */}
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-3">
                    <h1 className="editorial-serif text-5xl leading-[1.04] font-bold tracking-tight sm:text-6xl">
                        {name}
                    </h1>
                    <span
                        title={`第 ${issueNo} 期`}
                        className="hidden border border-primary px-2 py-1 font-mono text-[10px] leading-none tracking-[0.08em] text-primary sm:block"
                    >
                        第{issueNo}期
                    </span>
                </div>
                {tagline && (
                    <p className="editorial-serif mt-4 max-w-md text-[15px] leading-relaxed text-muted-foreground">
                        {tagline}
                    </p>
                )}
            </div>

            {/* 报头双线：2px 主字号压一条发丝线，像纸刊的刊头收口 */}
            <div className="mt-8 border-t-2 border-foreground/85" />
            <div className="mt-1 border-t border-border/70" />
        </section>
    );
}
