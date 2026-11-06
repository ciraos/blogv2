"use client";

// 访问日志（仪表盘**最后一块卡片**，宽度贴合内容 width: max-content）：卡头（图标 + 卡名 + 日期/刷新）+
// 「左饼图 + 右数据（只显示前五）」——排版口径与 statistics-summary.tsx 的
// 「访客画像 · 地域与来源」块（RefererPie）保持一致。
//
// 聚合维度为什么是 url_path（访问路径）：
//   1) 「地域与来源」那块的主维度是 referer（analytics.top_referers），但后端访问日志的
//      VisitorLogDTO 只有 user_agent / ip_address / city / url_path / duration / created_at
//      六个字段，**没有 referer** —— 想完全对齐维度在数据上做不到；
//   2) 按既定降级链 referer → path → IP 落到 path；
//   3) 不用 IP：每条日志的 IP 近乎唯一，Top5 会退化成「各 1 条」，饼图没有信息量。
//
// 位置约定（用户要求，务必保持）：
//   仪表盘顺序 = 评论区（左最新 / 右待审）→ 快速操作 → 统计 → **访问日志（内容宽度贴合）**；
//   **以后新增的仪表盘卡片一律追加在「访问日志」卡片下方**，不要插到它上面。
//   它由仪表盘页面（src/app/admin/dashboard/page.tsx）直接渲染，不再嵌在统计网格里。
//
// 数据源：GET /api/admin/statistics/visitor-logs（同源代理 → 远端 GET /statistics/visitor-logs）。
//   仍是纯读接口；page_size 取后端硬上限 200（statistics_handler.go:277-279），
//   目的是让「前 5 名 + 其他」有一份像样的聚合样本（只取 10 条时「其他」最多 5 条，
//   Top5 没有代表性）。后端返回的 total 是区间总条数，超过样本量时卡头会写明。

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, ScrollText } from "lucide-react";
import { toast } from "sonner";

import { getVisitorLogsApi, normalizeDateInput, VISITOR_LOG_MAX_PAGE_SIZE, type VisitorLog } from "@/lib/api-notifications";
import { CHART_OTHER_COLOR, sliceColor } from "@/lib/chart-colors";

/** 右列表只显示前 5 名（用户明确要求「只显示前五个」） */
const TOP_N = 5;

/**
 * 聚合维度：**改这一行即可切换口径**（field 必须是 VisitorLog 的字符串字段）。
 *   - 默认 `url_path`（访问路径）：后端 VisitorLogDTO 没有 referer，按降级链取 path；
 *   - 想切「地域口径」就换成下一行注释里的 city（注意 city 常为空串，会大量落到「未知城市」）。
 *   label 不再出现在卡头文案里（用户要求删掉「… Top 5」这类小标题），
 *   只作为 section 的无障碍名称，让读屏用户仍知道这块按哪个维度聚合。
 */
const DIMENSION: { field: "url_path" | "city"; label: string; emptyLabel: string } = {
    field: "url_path",
    label: "访问路径",
    emptyLabel: "未知路径",
};
// 地域口径（把上面那个对象整体替换成这一行即可）：
// const DIMENSION = { field: "city", label: "城市", emptyLabel: "未知城市" } as const;

/**
 * 卡片外壳：圆角/描边/微阴影与统计区其它卡片一致，但**宽度贴合内容**（用户要求 width: max-content）：
 *   - `sm:w-max` = max-content：卡片收拢到「左图 + 右数据」的自然宽度，不再整宽留白；
 *   - `w-full` + `max-w-full` 是兜底：窄屏（<640px）直接退回整宽，且无论内容多长都不会把
 *     仪表盘撑出横向滚动（长路径由列宽上限 + truncate 消化，不用横向滚动条）；
 *   - 只动这一张卡自己的宽度，**不改父容器**（仪表盘那个砌体列里其它卡片仍是各自的宽度）；
 *   - `break-inside-avoid`：仪表盘主区块是 CSS 多列砌体，这张卡绝不能被列边界切成两半。
 */
const cardCls = "w-full max-w-full rounded-lg border bg-card p-4";

/** 卡头图标徽章（与统计卡 GroupTitle 同款） */
const iconBadgeCls = "flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary";

/** 一条聚合结果（名称 + 次数） */
interface PathRank {
    name: string;
    count: number;
}

/** 按选定维度聚合计数：次数降序，同次数按名称排序 —— 保证同一份数据每次渲染顺序一致（幂等） */
function rankByDimension(logs: VisitorLog[], dim: typeof DIMENSION): PathRank[] {
    const counter = new Map<string, number>();
    for (const log of logs) {
        // 后端字段可能为空串；空值归到一个有名字的桶里，而不是显示成一行空白
        const key = (log[dim.field] || "").trim() || dim.emptyLabel;
        counter.set(key, (counter.get(key) ?? 0) + 1);
    }
    return [...counter.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * 占比文本：≥10% 取整（12%），<10% 保留一位小数（0.3%）。
 * 直接用 Math.round 会把 1/300（0.33%）显示成 0%，看起来像「没数据」。
 */
function formatPct(count: number, total: number): string {
    const raw = total > 0 ? (count / total) * 100 : 0;
    return `${raw >= 10 ? Math.round(raw) : raw.toFixed(1)}%`;
}

/** 占比环图（纯 SVG，无图表库）：当前维度的前 5 名 + 其他，圆心显示聚合总次数。
 *  颜色按序号取 globals.css 的图表令牌（var(--chart-N)），与「地域与来源」那块同一套；
 *  「其他」固定中性灰 —— 不再用「同一主题色的透明度深浅」，否则五段互相分不出来。 */
function PathPie({ items }: { items: PathRank[] }) {
    const top = items.slice(0, TOP_N);
    const rest = items.slice(TOP_N).reduce((sum, i) => sum + i.count, 0);
    const segs: PathRank[] = rest > 0 ? [...top, { name: "其他", count: rest }] : top;
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
        // 尺寸交给容器：桌面列宽够时封顶 208px；aspect-square 保证环不会压成椭圆
        <div className="relative mx-auto aspect-square w-full max-w-[208px]">
            {/* -rotate-90：让第一段从 12 点方向开始 */}
            <svg viewBox="0 0 100 100" className="size-full -rotate-90">
                <circle cx="50" cy="50" r={R} fill="none" stroke="var(--muted)" strokeWidth="14" />
                {segments.map((s, i) => {
                    // 段间留 1.5 的缝隙，视觉上更像分段的环；段太细时不留缝（否则会被减成 0 而彻底看不见）
                    const gap = s.len > 4 ? 1.5 : 0;
                    const dash = Math.max(s.len - gap, 0.8);
                    return (
                        <circle
                            key={s.name}
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
                <span className="text-[10px] text-muted-foreground">访问次数</span>
            </div>
        </div>
    );
}

/** 默认查询窗口：结束=今天、开始=7 天前（与后端统计接口默认区间一致） */
function resolveDefaultRange(): { start: string; end: string } {
    const fmt = (d: Date) => {
        const p = (n: number) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    };
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 7);
    return { start: fmt(start), end: fmt(end) };
}

/** 访问日志卡：图标 + 卡内标题 + 日期区间 / 刷新 + 左环图（前 5 名 + 其他）/ 右前 5 名数据 */
/** 访问路径是 URL 编码的（/tags/Qexo%E5%90%8E%E5%8F%B0），展示前解码；双重编码也一起解掉 */
function displayPath(path: string): string {
    let out = path;
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
export function VisitorLogsCard() {
    const [logs, setLogs] = useState<VisitorLog[]>([]);
    /** 区间内的日志总条数（后端 total，可能大于本次取回的样本量） */
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(true);
    // 「已生效」的日期区间（null = 还没定下来）。请求只认这个值，
    // 这样输入框里改了但没提交时不会每敲一下就发请求；输入框的显示值也回落到它，
    // 于是整块（含日期输入）只在挂载后由 effect 落一次默认窗口 —— 渲染期完全不读时钟，
    // SSR 与首帧客户端渲染的输出一致，不存在 hydration 不匹配。
    const [fetchedRange, setFetchedRange] = useState<{ start: string; end: string } | null>(null);

    // 输入框的「草稿值」（用户正在编辑时优先于已生效区间）
    const [startInput, setStartInput] = useState("");
    const [endInput, setEndInput] = useState("");
    const startDate = startInput !== "" ? startInput : (fetchedRange?.start ?? "");
    const endDate = endInput !== "" ? endInput : (fetchedRange?.end ?? "");

    /** 拉取指定日期区间的聚合样本（normalizeDateInput 兜底非法输入） */
    const load = useCallback(async (start: string, end: string) => {
        if (normalizeDateInput(start) === null || normalizeDateInput(end) === null) return;
        setLoading(true);
        try {
            const data = await getVisitorLogsApi({
                startDate: start,
                endDate: end,
                page: 1,
                // 取后端允许的最大单页：聚合样本越足，Top5 越有意义（仍只发一次只读请求）
                pageSize: VISITOR_LOG_MAX_PAGE_SIZE,
            });
            setLogs(data.list ?? []);
            setTotalCount(data.total ?? 0);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "获取访问日志失败");
        } finally {
            setLoading(false);
        }
    }, []);

    // 首次挂载：把默认窗口定为「已生效」并触发第一次请求（水合后才跑，能安全取当前时间）
    useEffect(() => {
        // 延后到下一个 tick：effect 内同步 setState 会触发级联渲染（react-hooks/set-state-in-effect）
        const timer = setTimeout(() => {
            const range = resolveDefaultRange();
            setFetchedRange(range);
        }, 0);
        return () => clearTimeout(timer);
    }, []);
    // 已生效区间变化 → 重新拉取（setState 都在 await 之后）
    useEffect(() => {
        if (!fetchedRange) return;
        // 延后到下一个 tick：effect 内同步 setState 会触发级联渲染（react-hooks/set-state-in-effect）
        const timer = setTimeout(() => void load(fetchedRange.start, fetchedRange.end), 0);
        return () => clearTimeout(timer);
    }, [fetchedRange, load]);

    /** 把输入框里的日期落成「已生效」区间；非法输入给提示并拒绝 */
    const applyRange = useCallback(() => {
        if (normalizeDateInput(startDate) === null || normalizeDateInput(endDate) === null) {
            toast.error("日期格式错误，应为 YYYY-MM-DD");
            return;
        }
        setFetchedRange({ start: startDate, end: endDate });
        // 区间没变时 setFetchedRange 写入的新对象语义相同、effect 依赖比较后不会重跑 —— 手动补一次刷新
        if (fetchedRange && fetchedRange.start === startDate && fetchedRange.end === endDate) {
            void load(startDate, endDate);
        }
    }, [startDate, endDate, fetchedRange, load]);

    // 聚合结果：只在 logs 变化时重算
    const ranks = useMemo(() => rankByDimension(logs, DIMENSION), [logs]);
    // 图例与饼图共用同一份「分母」：区间内实际参与聚合的条数（不是后端 total，避免百分比与图形不一致）
    const sampleTotal = ranks.reduce((sum, r) => sum + r.count, 0);
    const truncated = totalCount > logs.length;

    const dateInputCls =
        "h-7 rounded-lg border border-input bg-transparent px-2 text-xs tabular-nums outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

    return (
        <section className={cardCls} aria-label={`访问日志（按${DIMENSION.label}聚合）`}>
            {/* 卡头：图标徽章 + 卡名「访问日志」+ 右侧日期工具条。
                按用户要求删掉了「访问路径 Top 5」「仅显示前 10 条」这类小标题/过时文案；
                只有样本被截断时才补一句口径说明（否则「其他」占比会被误读成全量统计）。 */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className={iconBadgeCls}>
                    <ScrollText className="size-3.5" />
                </span>
                <h3 className="text-sm font-semibold">访问日志</h3>
                {truncated && (
                    <span className="text-[11px] text-muted-foreground">
                        区间内共 {totalCount} 条，图表基于最新 {logs.length} 条
                    </span>
                )}
                <div className="flex flex-wrap items-center gap-2">
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartInput(e.target.value)}
                        aria-label="开始日期"
                        className={dateInputCls}
                    />
                    <span className="text-xs text-muted-foreground">至</span>
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndInput(e.target.value)}
                        aria-label="结束日期"
                        className={dateInputCls}
                    />
                    <button
                        type="button"
                        disabled={loading}
                        onClick={applyRange}
                        className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-background px-2 text-xs transition-colors hover:bg-muted disabled:opacity-50 dark:border-input dark:bg-input/30"
                    >
                        {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                        刷新
                    </button>
                </div>
            </div>

            {loading && logs.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">加载中…</p>
            ) : ranks.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">该时间范围内暂无访问日志</p>
            ) : (
                // 桌面：左环图 13rem / 右数据 ≤20rem（≈40% / 60%，与「地域与来源」同款比例）。
                // 为什么用**固定列宽**而不是 fr：卡片是 max-content 宽度，fr 在不定宽容器里会按内容
                // 贡献反推，列宽会随路径长短飘；写死列宽才能既贴合内容又给长路径一个明确上限。
                // `minmax(0,20rem)`：长路径最多把数据列撑到 20rem，再长就 truncate —— 不用横向滚动条。
                // 窄屏（<768px）grid-cols-1 自动堆叠成「图在上、数据在下」。
                <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[13rem_minmax(0,1fr)]">
                    <PathPie items={ranks} />
                    <ol className="grid min-w-0 grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                        {ranks.slice(0, TOP_N).map((item, i) => {
                            const raw = sampleTotal > 0 ? (item.count / sampleTotal) * 100 : 0;
                            return (
                                // 只列前 5 名；第 6 名起合并进「其他」，只在饼图上体现（用户要求）
                                <li key={item.name}>
                                    <div className="flex items-center gap-2">
                                        {/* 色点与饼图第 i 段同色（同一个图表令牌），否则对不上号 */}
                                        <span
                                            className="size-2.5 shrink-0 rounded-full"
                                            style={{ backgroundColor: sliceColor(i) }}
                                        />
                                        <span className="min-w-0 flex-1 truncate text-sm" title={displayPath(item.name)}>
                                            {displayPath(item.name)}
                                        </span>
                                        <span className="shrink-0 text-xs font-medium tabular-nums">
                                            {formatPct(item.count, sampleTotal)}
                                        </span>
                                    </div>
                                    <div className="mt-1 flex items-center gap-2">
                                        {/* 进度条宽度按真实占比；下限 2% 是让占比极小的路径也看得见，否则条长为 0 像没渲染 */}
                                        <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                                            <span
                                                className="block h-full rounded-full bg-linear-to-r from-primary/45 to-primary/85"
                                                style={{ width: `${Math.max(raw, 2)}%` }}
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
            )}
        </section>
    );
}
