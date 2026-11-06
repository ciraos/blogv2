"use client";
import { useEffect, useState } from "react";
import {
    ArrowDownRight,
    ArrowUpRight,
    CalendarDays,
    CalendarRange,
    Compass,
    Cpu,
    Eye,
    Flame,
    Globe,
    MonitorSmartphone,
    Minus,
    TrendingUp,
    Users,
} from "lucide-react";
import { toast } from "sonner";
import type { DateRangeStats, StatisticsSummary, URLStatistics, VisitorAnalytics } from "@/types/statistics";
import { CHART_OTHER_COLOR, sliceColor } from "@/lib/chart-colors";

interface RankItem {
    name: string;
    sub?: string;
    count: number;
}

/**
 * 卡片外壳：统一圆角/描边/微阴影，鼠标悬停轻微抬升（紧凑密度：内边距统一 p-4）。
 * **高度由内容决定**（不设固定高度、不做卡内滚动）——「一目了然」看全排行。
 * 卡片在普通 CSS Grid 里按行铺排（左→右、上→下），单元格不会互相重叠。
 */
const cardCls = "flex flex-col rounded-lg border bg-card p-4 transition-colors hover:border-primary/40";

/** 统计卡片容器：CSS 多列瀑布流（columns-*）——卡片高度由内容决定，列内紧密排列、
 *  **绝不会重叠**，也不会有「行内最高的卡把其它卡顶出空洞」的空隙。
 *  代价：阅读顺序是**列优先**（先填满第一列再填第二列），不是行优先。
 *  卡片 `break-inside-avoid` + `mb-3` 保证不被拆列、列内间距 12px（与 gap-3 一致）。 */
const cardGridCls = "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3";

/** 排行项名可能是 URL 编码的页面路径（/tags/Qexo%E5%90%8E…），显示前解码，读起来才像人话 */
function displayName(name: string): string {
    // 页面路径可能是「编码过一次」也可能是「双重编码」（/tags/Qexo%E5%90%8E…），循环解到不能再解为止
    let out = name;
    for (let i = 0; i < 3; i += 1) {
        try {
            const next = decodeURIComponent(out);
            if (next === out) break;
            out = next;
        } catch {
            break;
        }
    }
    return out;
}

function toRank(items: { [k: string]: unknown }[] | null | undefined, nameKey: string, subKey?: string): RankItem[] {
    // 后端空数据可能返回 null（Go nil 切片），统一按空数组处理
    return (items ?? [])
        .map((it) => ({
            name: String(it[nameKey] ?? "未知"),
            sub: subKey ? String(it[subKey] ?? "") : undefined,
            count: Number(it.count ?? 0),
        }))
        .sort((a, b) => b.count - a.count);
}

/** 分组标题：小图标徽章 + 标题 */
function GroupTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <h3 className="editorial-serif mb-4 flex items-center gap-2 text-[15px] font-semibold">
            <span className="text-primary/60">{icon}</span>
            {children}
        </h3>
    );
}

/** 单个排行卡片（bare：嵌入分组卡内时去边框与内边距；title 可省，由外层卡片标题承担） */
function RankList({ title, items, bare = false }: { title?: string; items: RankItem[]; bare?: boolean }) {
    const max = items[0]?.count || 1;
    return (
        <div className={bare ? "" : `${cardCls} p-4`}>
            {title && <h4 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground">{title}</h4>}
            {items.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">暂无数据</p>
            ) : (
                <ol className="space-y-2.5">
                    {items.map((item, i) => (
                        <li key={i}>
                            <div className="flex items-baseline gap-2">
                                {/* 序号改成等宽小字，不再占一个色块 */}
                                <span className="w-4 shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/60">
                                    {i + 1}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-[13px] leading-snug" title={item.sub || displayName(item.name)}>
                                    {displayName(item.name)}
                                </span>
                                <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{item.count}</span>
                            </div>
                            {item.sub && displayName(item.sub) !== displayName(item.name) && (
                                <div className="ml-6 truncate text-[11px] text-muted-foreground/70">{displayName(item.sub)}</div>
                            )}
                            {/* 占比条：只画彩色那一段，不画灰色轨道 —— 有轨道时每行都像带下划线的链接 */}
                            <div className="mt-1.5 ml-6 h-[2px] overflow-hidden rounded-full">
                                <div className="h-full rounded-full bg-primary/55" style={{ width: `${(item.count / max) * 100}%` }} />
                            </div>
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );
}

/** 终端三组各自的图标（拆成独立卡片后，每组一张卡） */
const SECTION_ICON: Record<string, React.ReactNode> = {
    浏览器: <Compass className="size-3.5" />,
    设备: <MonitorSmartphone className="size-3.5" />,
    操作系统: <Cpu className="size-3.5" />,
};

/** 来源占比饼图（纯 SVG 环图，无图表库）：前 5 名 + 其他。
 *  颜色按序号取 globals.css 的图表令牌（var(--chart-N)），「其他」固定中性灰 ——
 *  不再用「同一主题色的透明度深浅」，否则五段颜色互相之间几乎分不出来。 */
function RefererPie({ items }: { items: RankItem[] }) {
    const top = items.slice(0, 5);
    const rest = items.slice(5).reduce((sum, i) => sum + i.count, 0);
    const segs = rest > 0 ? [...top, { name: "其他", count: rest }] : top;
    // 「其他」在 segs 里的下标（没有「其他」段时给 -1，谁都不会命中）
    const otherIndex = rest > 0 ? top.length : -1;
    const total = segs.reduce((sum, i) => sum + i.count, 0) || 1;
    const R = 40;
    const C = 2 * Math.PI * R;
    // 用前缀和预先算好每段的长度与起点（不在渲染期改外部变量：react-hooks/immutability）
    const segments = segs.map((s, i) => ({
        ...s,
        len: (s.count / total) * C,
        offset: segs.slice(0, i).reduce((sum, x) => sum + (x.count / total) * C, 0),
    }));
    return (
        <div className="relative mx-auto size-32">
            {/* -rotate-90：让第一段从 12 点方向开始 */}
            <svg viewBox="0 0 100 100" className="size-32 -rotate-90">
                <circle cx="50" cy="50" r={R} fill="none" stroke="var(--muted)" strokeWidth="14" />
                {segments.map((s, i) => {
                    // 段间留 1.5 的缝隙，视觉上更像分段的环
                    const dash = Math.max(s.len - 1.5, 0);
                    return (
                        <circle
                            key={i}
                            cx="50"
                            cy="50"
                            r={R}
                            fill="none"
                            stroke={i === otherIndex ? CHART_OTHER_COLOR : sliceColor(i)}
                            strokeWidth="14"
                            strokeDasharray={`${dash} ${C - dash}`}
                            strokeDashoffset={-s.offset}
                        />
                    );
                })}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-semibold tabular-nums">{total.toLocaleString()}</span>
                <span className="text-[10px] text-muted-foreground">来源次数</span>
            </div>
        </div>
    );
}

/** 日期格式化为紧凑标签（兼容完整时间戳） */
function formatDate(raw: string, mode: "daily" | "weekly" | "monthly"): string {
    const s = (raw || "").trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
        return mode === "monthly" ? `${m[2]}月` : `${m[2]}-${m[3]}`;
    }
    const m2 = s.match(/^(\d{1,2})-(\d{1,2})/);
    if (m2) return `${m2[1]}-${m2[2]}`;
    return s.slice(0, 10);
}

/** 趋势卡片：最近几天/周/月的柱状图（渐变柱 + 合计/峰值）。
 *  柱图容器固定 `h-32`：柱子的高度是百分比，父容器必须有确定高度才解析得出来。 */
function TrendCard({ data, mode }: { data: DateRangeStats[] | null | undefined; mode: "daily" | "weekly" | "monthly" }) {
    const title = mode === "daily" ? "每日" : mode === "weekly" ? "每周" : "每月";
    const list = (data ?? []).slice(-10);
    const max = Math.max(1, ...list.map((d) => d.views));
    const total = list.reduce((sum, d) => sum + d.views, 0);
    const peak = list.reduce((best, d) => (d.views > best.views ? d : best), list[0] ?? { views: 0 } as DateRangeStats);
    return (
        <div className={cardCls}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                <h3 className="editorial-serif flex items-center gap-2 text-[15px] font-semibold">
                    <span className="text-primary/60">
                        <TrendingUp className="size-3.5" />
                    </span>
                    趋势 · {title}
                </h3>
                {list.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                        近 {list.length} 期合计 <span className="font-medium text-foreground tabular-nums">{total}</span> 次
                        {peak.views > 0 && <> · 峰值 <span className="font-medium text-foreground tabular-nums">{peak.views}</span></>}
                    </span>
                )}
            </div>
            {list.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">暂无数据</p>
            ) : (
                // h-32：柱图**必须有确定高度**，柱子的百分比高度才解析得出来
                // （之前为了填满网格单元格改成 flex-1，父容器高度变成由卡片反推 → 柱子被压扁，
                //   极端情况下父高为 0 时柱子会塌掉，这就是「柱子不见了」的回归原因）
                <div className="flex h-32 items-end gap-1">
                    {list.map((d, i) => (
                        <div key={i} className="group flex h-full min-w-0 flex-1 flex-col items-center gap-1.5">
                            <div className="flex w-full flex-1 items-end">
                                <div
                                    className="w-full rounded-t-md bg-linear-to-t from-primary/30 to-primary transition-colors group-hover:from-primary/55 group-hover:to-primary"
                                    style={{ height: `${Math.max(6, (d.views / max) * 100)}%` }}
                                    title={`${d.date}：访问 ${d.views} / 人数 ${d.visitors}`}
                                />
                            </div>
                            {/* 10 根柱子挤在 280px 里，标签必然放不下：隔一根显示一个，字号压到 9px */}
                            <span className="w-full truncate text-center text-[9px] leading-none text-muted-foreground/80">
                                {i % 2 === 0 ? formatDate(d.date, mode) : ""}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/** 基础统计卡片：图标徽章 + 大数字 + 与昨日对比的胶囊标签（上涨红、下跌绿） */
function StatChip({
    label,
    value,
    yesterday,
    icon,
}: {
    label: string;
    value: number;
    yesterday?: number | null;
    icon: React.ReactNode;
}) {
    // 涨跌百分比：(今日 - 昨日) / 昨日 * 100，昨日为 0 时无法计算
    let pct: number | null = null;
    if (yesterday !== undefined && yesterday !== null && yesterday !== 0) {
        pct = Math.round(((value - yesterday) / yesterday) * 100);
    }
    const tone = pct === null || pct === 0 ? "flat" : pct > 0 ? "up" : "down";
    // 涨跌只保留文字颜色（原来还有一层 pill 底色，和「较昨日」三个字挤在一起）
    const deltaTextCls =
        tone === "up" ? "text-red-600 dark:text-red-400" : tone === "down" ? "text-green-600 dark:text-green-400" : "text-muted-foreground";
    const DeltaIcon = tone === "up" ? ArrowUpRight : tone === "down" ? ArrowDownRight : Minus;

    return (
        // 编辑部风：标签小字大写 → 衬线大数字 → 一行小字涨跌。
        // 原来右上角还有一团主题色柔光 + 方块图标徽章 + 圆角胶囊涨跌标签，三样一起把卡片挤得很闹。
        <div className={cardCls}>
            <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">{label}</span>
                <span className="shrink-0 text-primary/50">{icon}</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
                <span className="editorial-serif text-[30px] leading-none font-semibold tabular-nums">{value ?? 0}</span>
                {pct === null ? (
                    <span className="text-[11px] text-muted-foreground/60">—</span>
                ) : (
                    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums ${deltaTextCls}`}>
                        <DeltaIcon className="size-3" />
                        {tone === "flat" ? "持平" : `${Math.abs(pct)}%`}
                    </span>
                )}
            </div>
            <span className="mt-1 text-[10px] tracking-wide text-muted-foreground/60">较昨日</span>
        </div>
    );
}

/** 加载骨架：与真实卡片大致同尺寸，避免加载时跳一下（不设固定高度，内容自适应） */
function Skeleton() {
    return (
        <div aria-busy="true" aria-label="统计概览加载中">
            <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-[104px] animate-pulse rounded-xl border bg-card" />
                ))}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-[180px] animate-pulse rounded-xl border bg-card" />
                ))}
            </div>
        </div>
    );
}


/** 杂项：统计概览（基础统计 + 访客分析排行 + 热门页面 + 趋势）。
 *  访问日志卡不在这里 —— 它是仪表盘最后一块卡片（宽度贴合内容，见 visitor-logs-card.tsx），由 dashboard 页面单独渲染。 */
export function StatisticsSummary() {
    const [data, setData] = useState<StatisticsSummary | null>(null);
    // 三张趋势图单独拉取（summary 只返回 daily，weekly/monthly 需 GET /statistics/trend）
    const [trend, setTrend] = useState<{
        daily: DateRangeStats[] | null;
        weekly: DateRangeStats[] | null;
        monthly: DateRangeStats[] | null;
    }>({ daily: null, weekly: null, monthly: null });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        // 拉单个 period 的趋势（period=daily/weekly/monthly&days=30；返回 VisitorTrendData{daily,weekly,monthly}）
        const fetchTrend = async (period: "daily" | "weekly" | "monthly") => {
            try {
                const res = await fetch(`/api/admin/statistics/trend?period=${period}&days=30`);
                const json = (await res.json()) as {
                    code: number;
                    data: { daily?: DateRangeStats[] | null; weekly?: DateRangeStats[] | null; monthly?: DateRangeStats[] | null } | null;
                };
                if (!res.ok || json.code !== 200) return null;
                return json.data?.[period] ?? null;
            } catch {
                return null;
            }
        };

        (async () => {
            try {
                const res = await fetch("/api/admin/statistics/summary");
                const json = (await res.json()) as { code: number; message: string; data: StatisticsSummary };
                if (!res.ok || json.code !== 200) throw new Error(json.message || "获取统计概览失败");
                if (!cancelled) setData(json.data);

                // 三个 period 并行拉取
                const [daily, weekly, monthly] = await Promise.all([
                    fetchTrend("daily"),
                    fetchTrend("weekly"),
                    fetchTrend("monthly"),
                ]);
                if (!cancelled) setTrend({ daily, weekly, monthly });
            } catch (e) {
                toast.error(e instanceof Error ? e.message : "获取统计概览失败");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    if (loading) {
        return <Skeleton />;
    }
    if (!data) {
        return (
            <p className={`${cardCls} px-4 py-8 text-center text-sm text-muted-foreground`}>暂无统计概览数据</p>
        );
    }

    const basic = data.basic_stats ?? null;
    const analytics: VisitorAnalytics = data.analytics ?? {
        top_browsers: null,
        top_cities: null,
        top_countries: null,
        top_devices: null,
        top_os: null,
        top_referers: null,
    };
    const topPages: URLStatistics[] = data.top_pages ?? [];

    // 访客画像：浏览器 / 设备 / 操作系统（同一行对比）
    const deviceSections: { title: string; items: RankItem[] }[] = [
        { title: "浏览器", items: toRank(analytics.top_browsers, "browser") },
        { title: "设备", items: toRank(analytics.top_devices, "device") },
        { title: "操作系统", items: toRank(analytics.top_os, "os") },
    ];
    // 访客画像：国家 / 城市 与 来源（同一行，供横向对比）
    // 来源里后端把「无 referer（直接访问）」记为 ""，直接渲染会变成一行没名字的大数字，
    // 所以显式标成「直接访问」。
    const refererItems: RankItem[] = toRank(analytics.top_referers, "referer").map((it) => ({
        ...it,
        name: it.name.trim() === "" ? "直接访问" : it.name,
    }));
    const geoSections: { title: string; items: RankItem[] }[] = [
        { title: "国家/地区", items: toRank(analytics.top_countries, "country") },
        { title: "城市", items: toRank(analytics.top_cities, "city") },
        { title: "来源 Referer", items: refererItems },
    ];
    // 热门页面：独立卡片
    const hotPages: RankItem[] = topPages
        .map((p) => ({ name: p.page_title || p.url_path || "未知页面", sub: p.url_path, count: p.total_views }))
        .sort((a, b) => b.count - a.count);

    // 趋势数据来源：summary 响应里自带 trend_data（实测 daily 有 31 天，weekly/monthly 为 null），
    // 单独的 /statistics/trend 只作为补充 —— 它拿不到时回落到 trend_data，否则会误报「暂无数据」。
    const trendFor = (period: "daily" | "weekly" | "monthly"): DateRangeStats[] | null => {
        const fromApi = trend?.[period];
        if (fromApi && fromApi.length > 0) return fromApi;
        return data.trend_data?.[period] ?? null;
    };

    // 没数据的块直接不渲染（而不是占着一堆「暂无数据」）；
    // 做成「按数据过滤」而不是删死：后端哪天有数据了，这些块会自动回来。
    const visibleDeviceSections = deviceSections.filter((s) => s.items.length > 0);
    const visibleGeoSections = geoSections.filter((s) => s.items.length > 0);
    const visibleTrends = [
        { mode: "daily" as const, data: trendFor("daily") },
        { mode: "weekly" as const, data: trendFor("weekly") },
        { mode: "monthly" as const, data: trendFor("monthly") },
    ].filter((t) => (t.data ?? []).length > 0);
    const hasAnything =
        !!basic || visibleTrends.length > 0 || visibleDeviceSections.length > 0 || visibleGeoSections.length > 0 || hotPages.length > 0;
    // 地域卡现在是半宽，列数要按实际有数据的组数收敛（国家/城市常为 null，只剩来源时不要留两个空列）
    const geoSecCols =
        visibleGeoSections.length >= 3 ? "sm:grid-cols-2 lg:grid-cols-3" : visibleGeoSections.length === 2 ? "sm:grid-cols-2" : "";

    return (
        <div>
            {/* 基础统计（今日人数/访问，与昨日对比涨跌）：4 张等高磁贴，行内不留空 */}
            {basic && (
                <div className="mb-3 grid grid-cols-1 auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <StatChip label="今日人数" value={basic.today_visitors} yesterday={basic.yesterday_visitors} icon={<Users className="size-4" />} />
                    <StatChip label="今日访问" value={basic.today_views} yesterday={basic.yesterday_views} icon={<Eye className="size-4" />} />
                    <StatChip label="本月访问" value={basic.month_views} icon={<CalendarDays className="size-4" />} />
                    <StatChip label="本年访问" value={basic.year_views} icon={<CalendarRange className="size-4" />} />
                </div>
            )}

            {/* 卡片瀑布流：CSS 多列（columns-1 / sm:2 / xl:3）+ 子项 break-inside-avoid ——
                卡片高度完全由内容决定、列内紧密排列、**绝不重叠**，也没有行内空洞。
                唯一间距来源是子项 mb-3（12px）。阅读顺序为**列优先**（先填满第一列）。
                访问日志卡不在这里：它是仪表盘最后一块整宽卡片（见 visitor-logs-card.tsx 顶部约定） */}
            <div className={cardGridCls}>
                {visibleTrends.map((t) => (
                    <TrendCard key={t.mode} data={t.data} mode={t.mode} />
                ))}

                {visibleDeviceSections.map((section) => (
                    <section key={section.title} className={`${cardCls} min-w-0`}>
                        <GroupTitle icon={SECTION_ICON[section.title] ?? <MonitorSmartphone className="size-3.5" />}>
                            {section.title}
                        </GroupTitle>
                        <RankList bare items={section.items} />
                    </section>
                ))}
                    {visibleGeoSections.length > 0 && (
                        <section className={`${cardCls} min-w-0`}>
                            <GroupTitle icon={<Globe className="size-3.5" />}>访客画像 · 地域与来源</GroupTitle>
                            {/* 左边占比饼图，右边排名前五的来源网站（颜色深浅与饼图分段一一对应） */}
                            {refererItems.length > 0 ? (
                                /* 有宽度就「左饼图 + 右排名」并排；卡片窄到放不下 180px 的列表时自动换行堆叠，
                                   避免域名被截断成 "bl..." 这种读不出来的样子 */
                                <div className="flex flex-wrap items-center justify-center gap-4">
                                    <div className="shrink-0">
                                        <RefererPie items={refererItems} />
                                    </div>
                                    <ol className="min-w-[180px] flex-1 space-y-3">
                                        {refererItems.slice(0, 5).map((item, i) => {
                                            const totalRef = refererItems.reduce((sum, it) => sum + it.count, 0) || 1;
                                            const pct = Math.round((item.count / totalRef) * 100);
                                            return (
                                                // 域名独占一行（窄列里也能读全），次数放到进度条右侧
                                                <li key={i}>
                                                    <div className="flex items-center gap-2">
                                                        {/* 色点与饼图第 i 段同色（同一个图表令牌），否则对不上号 */}
                                                        <span
                                                            className="size-2.5 shrink-0 rounded-full"
                                                            style={{ backgroundColor: sliceColor(i) }}
                                                        />
                                                        <span className="min-w-0 flex-1 truncate text-sm" title={item.name}>
                                                            {item.name}
                                                        </span>
                                                        <span className="shrink-0 text-xs font-medium tabular-nums">{pct}%</span>
                                                    </div>
                                                    <div className="mt-1 flex items-center gap-2">
                                                        <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                                                            <span
                                                                className="block h-full rounded-full bg-linear-to-r from-primary/45 to-primary/85"
                                                                style={{ width: `${pct}%` }}
                                                            />
                                                        </span>
                                                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                                                            {item.count}
                                                        </span>
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ol>
                                </div>
                            ) : (
                                <div className={`grid grid-cols-1 gap-4 ${geoSecCols}`}>
                                    {visibleGeoSections.map((section, i) => (
                                        <div key={section.title} className={i > 0 ? "lg:border-l lg:border-border/60 lg:pl-4" : ""}>
                                            <RankList bare title={section.title} items={section.items} />
                                        </div>
                                    ))}
                                </div>
                            )}
                            {/* 国家/城市有数据时（后端目前常为 null）附在下方 */}
                            {refererItems.length > 0 && visibleGeoSections.some((s) => s.title !== "来源 Referer") && (
                                <div className="mt-4 grid grid-cols-1 gap-4 border-t border-border/60 pt-4 sm:grid-cols-2">
                                    {visibleGeoSections
                                        .filter((s) => s.title !== "来源 Referer")
                                        .map((section) => (
                                            <RankList key={section.title} bare title={section.title} items={section.items} />
                                        ))}
                                </div>
                            )}
                        </section>
                    )}

                    {hotPages.length > 0 && (
                        <section className={`${cardCls} min-w-0`}>
                            <GroupTitle icon={<Flame className="size-3.5" />}>热门页面 TOP</GroupTitle>
                            {/* 与排行卡同一套行样式：等宽序号 + 名称 + 计数 + 一条彩色占比线（不画灰轨道） */}
                            <div className="space-y-2.5">
                                {hotPages.map((item, i) => {
                                    const max = hotPages[0]?.count || 1;
                                    return (
                                        <div key={i}>
                                            <div className="flex items-baseline gap-2">
                                                <span className="w-4 shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/60">
                                                    {i + 1}
                                                </span>
                                                <span
                                                    className="min-w-0 flex-1 truncate text-[13px] leading-snug"
                                                    title={item.sub || displayName(item.name)}
                                                >
                                                    {displayName(item.name)}
                                                </span>
                                                <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                                                    {item.count}
                                                </span>
                                            </div>
                                            {item.sub && displayName(item.sub) !== displayName(item.name) && (
                                                <div className="ml-6 truncate text-[11px] text-muted-foreground/70">
                                                    {displayName(item.sub)}
                                                </div>
                                            )}
                                            <div className="mt-1.5 ml-6 h-[2px] overflow-hidden rounded-full">
                                                <div
                                                    className="h-full rounded-full bg-primary/55"
                                                    style={{ width: `${(item.count / max) * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    )}

            </div>

            {/* 一个字都没有时给个明确交代，而不是留一片空白 */}
            {!hasAnything && (
                <p className={`${cardCls} p-4 py-8 text-center text-sm text-muted-foreground`}>统计概览暂无数据可展示</p>
            )}
        </div>
    );
}
