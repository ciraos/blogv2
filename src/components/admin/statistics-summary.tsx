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

interface RankItem {
    name: string;
    sub?: string;
    count: number;
}

/** 卡片外壳：统一圆角/描边/微阴影，鼠标悬停轻微抬升 */
const cardCls = "rounded-xl border bg-card shadow-xs transition-shadow hover:shadow-sm";

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
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">{icon}</span>
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
                <ol className="space-y-3">
                    {items.map((item, i) => (
                        <li key={i}>
                            <div className="flex items-center gap-2.5">
                                {/* 前 3 名用主题色徽章，其余用灰底 */}
                                <span
                                    className={`flex size-5 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold tabular-nums ${
                                        i < 3 ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground"
                                    }`}
                                >
                                    {i + 1}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-sm" title={item.sub || item.name}>
                                    {item.name}
                                </span>
                                <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">{item.count}</span>
                            </div>
                            {item.sub && <div className="ml-7 truncate text-xs text-muted-foreground/70">{item.sub}</div>}
                            <div className="mt-1.5 ml-7 h-1 overflow-hidden rounded-full bg-muted">
                                <div
                                    className="h-full rounded-full bg-linear-to-r from-primary/45 to-primary/85"
                                    style={{ width: `${(item.count / max) * 100}%` }}
                                />
                            </div>
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );
}

/** 饼图/图例共用的主色深浅梯度（纯主题色，避免引入图表库与额外配色） */
const PIE_OPACITY = [1, 0.72, 0.52, 0.34, 0.2, 0.12];

/** 终端三组各自的图标（拆成独立卡片后，每组一张卡） */
const SECTION_ICON: Record<string, React.ReactNode> = {
    浏览器: <Compass className="size-3.5" />,
    设备: <MonitorSmartphone className="size-3.5" />,
    操作系统: <Cpu className="size-3.5" />,
};

/** 来源占比饼图（纯 SVG 环图，无图表库）：前 5 名 + 其他 */
function RefererPie({ items }: { items: RankItem[] }) {
    const top = items.slice(0, 5);
    const rest = items.slice(5).reduce((sum, i) => sum + i.count, 0);
    const segs = rest > 0 ? [...top, { name: "其他", count: rest }] : top;
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
                            stroke="var(--primary)"
                            strokeWidth="14"
                            strokeOpacity={PIE_OPACITY[i] ?? 0.12}
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

/** 趋势卡片：最近几天/周/月的柱状图（渐变柱 + 合计/峰值） */
function TrendCard({ data, mode }: { data: DateRangeStats[] | null | undefined; mode: "daily" | "weekly" | "monthly" }) {
    const title = mode === "daily" ? "每日" : mode === "weekly" ? "每周" : "每月";
    const list = (data ?? []).slice(-10);
    const max = Math.max(1, ...list.map((d) => d.views));
    const total = list.reduce((sum, d) => sum + d.views, 0);
    const peak = list.reduce((best, d) => (d.views > best.views ? d : best), list[0] ?? { views: 0 } as DateRangeStats);
    return (
        <div className={`${cardCls} p-4`}>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
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
                            <span className="w-full truncate text-center text-[10px] leading-none text-muted-foreground">
                                {formatDate(d.date, mode)}
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
    const deltaCls =
        tone === "up"
            ? "bg-red-500/10 text-red-600 dark:text-red-400"
            : tone === "down"
              ? "bg-green-500/10 text-green-700 dark:text-green-400"
              : "bg-muted text-muted-foreground";
    const DeltaIcon = tone === "up" ? ArrowUpRight : tone === "down" ? ArrowDownRight : Minus;

    return (
        <div className={`group relative overflow-hidden ${cardCls} p-4`}>
            {/* 右上角主题色柔光，鼠标悬停时更明显 */}
            <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-primary/10 blur-2xl transition-opacity group-hover:opacity-70"
            />
            <div className="relative flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-xs font-medium text-muted-foreground">{label}</div>
                    <div className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">{value ?? 0}</div>
                </div>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    {icon}
                </span>
            </div>
            <div className="relative mt-3">
                {pct === null ? (
                    <span className="text-xs text-muted-foreground/70">—</span>
                ) : (
                    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium ${deltaCls}`}>
                        <DeltaIcon className="size-3" />
                        {tone === "flat" ? "持平" : `${Math.abs(pct)}%`}
                        <span className="ml-0.5 font-normal opacity-70">较昨日</span>
                    </span>
                )}
            </div>
        </div>
    );
}

/** 加载骨架：与真实卡片同尺寸，避免加载时跳一下 */
function Skeleton() {
    return (
        <div className="space-y-4" aria-busy="true" aria-label="统计概览加载中">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-[118px] animate-pulse rounded-xl border bg-card" />
                ))}
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-[196px] animate-pulse rounded-xl border bg-card" />
                ))}
            </div>
        </div>
    );
}

/** 杂项：统计概览（基础统计 + 访客分析排行 + 热门页面 + 趋势） */
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
            <p className={`${cardCls} p-6 text-center text-sm text-muted-foreground`}>暂无统计概览数据</p>
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
        <div className="space-y-4">
            {/* 基础统计（今日人数/访问，与昨日对比涨跌） */}
            {basic && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <StatChip label="今日人数" value={basic.today_visitors} yesterday={basic.yesterday_visitors} icon={<Users className="size-4" />} />
                    <StatChip label="今日访问" value={basic.today_views} yesterday={basic.yesterday_views} icon={<Eye className="size-4" />} />
                    <StatChip label="本月访问" value={basic.month_views} icon={<CalendarDays className="size-4" />} />
                    <StatChip label="本年访问" value={basic.year_views} icon={<CalendarRange className="size-4" />} />
                </div>
            )}

            {/* 瀑布流：下面的卡片各自独立成块，按列自然堆叠（CSS columns）；
                终端三组（浏览器/设备/操作系统）也各自成卡，不再挤在一张大卡片里 */}
            <div className="columns-1 gap-4 sm:columns-2 xl:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid">
                {visibleTrends.map((t) => (
                    <TrendCard key={t.mode} data={t.data} mode={t.mode} />
                ))}

                {visibleDeviceSections.map((section) => (
                    <section key={section.title} className={`${cardCls} p-4`}>
                        <GroupTitle icon={SECTION_ICON[section.title] ?? <MonitorSmartphone className="size-3.5" />}>
                            {section.title}
                        </GroupTitle>
                        <RankList bare items={section.items} />
                    </section>
                ))}
                    {visibleGeoSections.length > 0 && (
                        <section className={`${cardCls} p-4 sm:p-5`}>
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
                                                        <span
                                                            className="size-2.5 shrink-0 rounded-full bg-primary"
                                                            style={{ opacity: PIE_OPACITY[i] ?? 0.12 }}
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
                        <section className={`${cardCls} p-4 sm:p-5`}>
                            <GroupTitle icon={<Flame className="size-3.5" />}>热门页面 TOP</GroupTitle>
                            <div className="space-y-3">
                                {hotPages.map((item, i) => {
                                    const max = hotPages[0]?.count || 1;
                                    return (
                                        <div key={i} className="flex items-center gap-2.5">
                                            <span
                                                className={`flex size-5 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold tabular-nums ${
                                                    i < 3 ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground"
                                                }`}
                                            >
                                                {i + 1}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-sm" title={item.sub || item.name}>{item.name}</span>
                                                <span className="mt-1 block h-1 overflow-hidden rounded-full bg-muted">
                                                    <span
                                                        className="block h-full rounded-full bg-linear-to-r from-primary/45 to-primary/85"
                                                        style={{ width: `${(item.count / max) * 100}%` }}
                                                    />
                                                </span>
                                            </span>
                                            <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">{item.count}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    )}
            </div>

            {/* 一个字都没有时给个明确交代，而不是留一片空白 */}
            {!hasAnything && (
                <p className={`${cardCls} p-6 text-center text-sm text-muted-foreground`}>统计概览暂无数据可展示</p>
            )}
        </div>
    );
}
