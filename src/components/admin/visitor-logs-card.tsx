"use client";

// 访问日志（仪表盘**最后一块整宽卡片**）：卡头（图标 + 卡内小标题 + 日期/刷新）+
// 前 10 条记录（整宽用表格排版；窄屏表格横向滚动）。
//
// 位置约定（用户要求，务必保持）：
//   仪表盘顺序 = 评论区（左最新 / 右待审）→ 快速操作 → 统计 → **访问日志（整宽）**；
//   **以后新增的仪表盘卡片一律追加在「访问日志」卡片下方**，不要插到它上面。
//   它由仪表盘页面（src/app/admin/dashboard/page.tsx）直接渲染，不再嵌在统计网格里；
//   卡内小标题是"卡片自己的标题"，不是区块级大标题。
//
// 数据源：GET /api/admin/statistics/visitor-logs（同源代理 → 远端 GET /statistics/visitor-logs）。
// 字段按后端 VisitorLogDTO 实际返回渲染（pkg/handler/statistics/statistics_handler.go:320-327）：
// created_at / url_path / city / ip_address / user_agent / duration。
// page_size=10（后端按 page/page_size 切片，handler.go:302-317），只展示前 10 条，故不渲染分页控件。

import { useCallback, useEffect, useState } from "react";
import { Loader2, MapPin, RefreshCw, ScrollText } from "lucide-react";
import { toast } from "sonner";

import { getVisitorLogsApi, normalizeDateInput, type VisitorLog } from "@/lib/api-notifications";

/** 只展示前 10 条（不翻页） */
const VISITOR_LOG_LIMIT = 10;

/** 卡片外壳：与统计区其它卡片一致（rounded-xl border bg-card p-4 shadow-sm），整宽（w-full） */
const cardCls = "w-full rounded-xl border bg-card p-4 shadow-sm";

/** 卡头图标徽章（与统计卡 GroupTitle 同款） */
const iconBadgeCls = "flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary";

/** 表头/单元格密度：表头 px-2 py-2 text-xs、行 px-2 py-3 */
const thCls = "px-2 py-2 text-left text-xs font-medium whitespace-nowrap";
const tdCls = "px-2 py-3 text-xs text-muted-foreground";

/** 完整日期时间（YYYY-MM-DD HH:MM:SS） */
function formatDateTime(iso?: string): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 浏览器压成短名（完整 UA 放到 title 里，列宽不被撑破） */
function shortenUserAgent(ua: string): string {
    const s = (ua || "").trim();
    if (!s) return "—";
    if (s.includes("Edg/")) return "Edge";
    if (s.includes("OPR/") || s.includes("Opera")) return "Opera";
    if (s.includes("Firefox/")) return "Firefox";
    if (s.includes("Chrome/") || s.includes("CriOS/")) return "Chrome";
    if (s.includes("Safari/")) return "Safari";
    if (s.includes("curl/")) return "curl";
    if (s.includes("bot") || s.includes("Bot") || s.includes("spider")) return "爬虫";
    return s.length > 18 ? `${s.slice(0, 18)}…` : s;
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

/** 访问日志卡：图标 + 卡内标题 + 日期区间 / 刷新 + 前 10 条（整宽表格，窄屏横向滚动） */
export function VisitorLogsCard() {
    const [logs, setLogs] = useState<VisitorLog[]>([]);
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

    /** 拉取指定日期区间的前 10 条（normalizeDateInput 兜底非法输入） */
    const load = useCallback(async (start: string, end: string) => {
        if (normalizeDateInput(start) === null || normalizeDateInput(end) === null) return;
        setLoading(true);
        try {
            const data = await getVisitorLogsApi({
                startDate: start,
                endDate: end,
                page: 1,
                pageSize: VISITOR_LOG_LIMIT,
            });
            setLogs(data.list ?? []);
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

    const dateInputCls =
        "h-7 rounded-lg border border-input bg-transparent px-2 text-xs tabular-nums outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

    return (
        <section className={cardCls}>
            {/* 卡头：图标徽章 + 卡内小标题 + 右侧日期工具条（整宽一行；窄屏自动换行） */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className={iconBadgeCls}>
                    <ScrollText className="size-3.5" />
                </span>
                <h3 className="text-sm font-semibold">访问日志</h3>
                <span className="text-[11px] text-muted-foreground">仅显示前 {VISITOR_LOG_LIMIT} 条</span>
                <div className="ml-auto flex flex-wrap items-center gap-2">
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
            ) : logs.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">该时间范围内暂无访问日志</p>
            ) : (
                // 整宽表格：table-fixed + 各列 w-* + truncate（title 悬浮看全），长路径 / UA 不会撑破；
                // 窄屏（<760px）由外层 overflow-x-auto 横向滚动，不挤压列内容
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] table-fixed border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-border/60 text-muted-foreground">
                                <th className={`${thCls} w-[150px]`}>时间</th>
                                <th className={`${thCls} w-[34%]`}>路径</th>
                                <th className={`${thCls} w-[104px]`}>城市</th>
                                <th className={`${thCls} w-[132px]`}>IP</th>
                                <th className={`${thCls} w-[104px]`}>浏览器</th>
                                <th className={`${thCls} w-[76px] text-right`}>时长</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map((log, i) => (
                                <tr
                                    key={`${log.created_at}-${log.ip_address}-${i}`}
                                    className="border-b border-border/40 last:border-b-0 hover:bg-muted/40"
                                >
                                    <td className={`${tdCls} whitespace-nowrap tabular-nums`}>{formatDateTime(log.created_at)}</td>
                                    <td className="px-2 py-3 text-xs text-foreground">
                                        <span className="block truncate" title={log.url_path}>
                                            {log.url_path || "—"}
                                        </span>
                                    </td>
                                    <td className={`${tdCls} whitespace-nowrap`}>
                                        {log.city ? (
                                            <span className="inline-flex items-center gap-1">
                                                <MapPin className="size-3" />
                                                {log.city}
                                            </span>
                                        ) : (
                                            "—"
                                        )}
                                    </td>
                                    <td className={`${tdCls} whitespace-nowrap tabular-nums`}>{log.ip_address || "—"}</td>
                                    <td className={tdCls}>
                                        <span className="block truncate" title={log.user_agent}>
                                            {shortenUserAgent(log.user_agent)}
                                        </span>
                                    </td>
                                    <td className={`${tdCls} whitespace-nowrap text-right tabular-nums`}>{log.duration}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
