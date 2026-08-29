"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { DateRangeStats, StatisticsSummary, URLStatistics, VisitorAnalytics } from "@/types/statistics";

interface RankItem {
    name: string;
    sub?: string;
    count: number;
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

/** 单个排行卡片 */
function RankList({ title, items }: { title: string; items: RankItem[] }) {
    const max = items[0]?.count || 1;
    return (
        <div className="rounded-xl border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold">{title}</h3>
            {items.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">暂无数据</p>
            ) : (
                <ul className="space-y-2">
                    {items.map((item, i) => (
                        <li key={i} className="text-sm">
                            <div className="flex items-center justify-between gap-2">
                                <span className="flex min-w-0 items-center gap-2">
                                    <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                                    <span className="truncate" title={item.sub || item.name}>
                                        {item.name}
                                    </span>
                                </span>
                                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{item.count}</span>
                            </div>
                            {item.sub && <div className="ml-7 truncate text-xs text-muted-foreground/70">{item.sub}</div>}
                            <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                                <div className="h-full rounded-full bg-primary/60" style={{ width: `${(item.count / max) * 100}%` }} />
                            </div>
                        </li>
                    ))}
                </ul>
            )}
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

/** 趋势卡片：最近几天/周/月的柱状图 */
function TrendCard({
    data,
    mode,
}: {
    data: DateRangeStats[] | null | undefined;
    mode: "daily" | "weekly" | "monthly";
}) {
    const title = mode === "daily" ? "每日" : mode === "weekly" ? "每周" : "每月";
    const list = (data ?? []).slice(-10);
    const max = Math.max(1, ...list.map((d) => d.views));
    return (
        <div className="rounded-xl border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold">趋势（{title}）</h3>
            {list.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">暂无数据</p>
            ) : (
                <div className="flex h-28 items-end gap-1.5">
                    {list.map((d, i) => (
                        <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                            <div
                                className="w-full rounded-t bg-primary/70"
                                style={{ height: `${Math.max(4, (d.views / max) * 100)}%` }}
                                title={`${d.date}：访问 ${d.views} / 人数 ${d.visitors}`}
                            />
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

/** 基础统计小卡片（可选：与昨日对比的涨跌百分比，靠右显示，上涨红、下跌绿） */
function StatChip({ label, value, yesterday }: { label: string; value: number; yesterday?: number | null }) {
    // 涨跌百分比：(今日 - 昨日) / 昨日 * 100，昨日为 0 时无法计算
    let pct: number | null = null;
    if (yesterday !== undefined && yesterday !== null && yesterday !== 0) {
        pct = Math.round(((value - yesterday) / yesterday) * 100);
    }
    return (
        <div className="rounded-xl border bg-card p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-1 flex items-baseline justify-between gap-1">
                <span className="text-xl font-bold tabular-nums">{value ?? 0}</span>
                {pct !== null && (
                    <span
                        className={`text-xs font-semibold tabular-nums ${
                            pct > 0 ? "text-red-500" : pct < 0 ? "text-green-500" : "text-muted-foreground"
                        }`}
                    >
                        {pct > 0 ? `↑${pct}%` : pct < 0 ? `↓${Math.abs(pct)}%` : "0%"}
                    </span>
                )}
            </div>
        </div>
    );
}

/** 杂项：统计概览（基础统计 + 访客分析排行 + 热门页面 + 趋势） */
export function StatisticsSummary() {
    const [data, setData] = useState<StatisticsSummary | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/admin/statistics/summary");
                const json = (await res.json()) as { code: number; message: string; data: StatisticsSummary };
                if (!res.ok || json.code !== 200) throw new Error(json.message || "获取统计概览失败");
                if (!cancelled) setData(json.data);
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
        return <p className="text-sm text-muted-foreground">加载中…</p>;
    }
    if (!data) {
        return <p className="text-sm text-muted-foreground">暂无统计概览数据</p>;
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
    const trend = data.trend_data;

    const rankSections: { title: string; items: RankItem[] }[] = [
        { title: "浏览器 TOP", items: toRank(analytics.top_browsers, "browser") },
        { title: "设备 TOP", items: toRank(analytics.top_devices, "device") },
        { title: "操作系统 TOP", items: toRank(analytics.top_os, "os") },
        { title: "国家/地区 TOP", items: toRank(analytics.top_countries, "country") },
        { title: "城市 TOP", items: toRank(analytics.top_cities, "city") },
        { title: "来源 Referer TOP", items: toRank(analytics.top_referers, "referer") },
        {
            title: "热门页面 TOP",
            items: topPages
                .map((p) => ({ name: p.page_title || p.url_path || "未知页面", sub: p.url_path, count: p.total_views }))
                .sort((a, b) => b.count - a.count),
        },
    ];

    return (
        <div className="space-y-4">
            {/* 基础统计（今日人数/访问与昨日对比涨跌百分比，靠右显示，上涨红、下跌绿） */}
            {basic && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <StatChip label="今日人数" value={basic.today_visitors} yesterday={basic.yesterday_visitors} />
                    <StatChip label="今日访问" value={basic.today_views} yesterday={basic.yesterday_views} />
                    <StatChip label="本月访问" value={basic.month_views} />
                    <StatChip label="本年访问" value={basic.year_views} />
                </div>
            )}

            {/* 趋势 */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <TrendCard data={trend?.daily} mode="daily" />
                <TrendCard data={trend?.weekly} mode="weekly" />
                <TrendCard data={trend?.monthly} mode="monthly" />
            </div>

            {/* 排行 */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {rankSections.map((section) => (
                    <RankList key={section.title} title={section.title} items={section.items} />
                ))}
            </div>
        </div>
    );
}
