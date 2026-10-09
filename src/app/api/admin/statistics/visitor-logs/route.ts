import { NextRequest, NextResponse } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

/**
 * GET /api/admin/statistics/visitor-logs —— 访客访问日志（管理员，分页）。
 *
 * 远端契约（源码证据）：
 *  - internal/infra/router/router.go:691-707 statisticsAdmin 组（JWTAuth + AdminAuth）
 *    注册 GET /statistics/visitor-logs（router.go:706）。
 *  - pkg/handler/statistics/statistics_handler.go:263-355 GetVisitorLogs：
 *      查询参数 start_date / end_date（YYYY-MM-DD，格式错 → 400）、page（默认 1）、
 *      page_size（默认 20，**上限 200**，handler.go:273-279）；不传日期时后端默认最近 7 天（handler.go:281-283）。
 *      data = { list, total, page, page_size }（handler.go:349-354），
 *      list 项为精简 DTO（handler.go:320-327）：
 *      { user_agent, ip_address, city, url_path, duration, created_at }。
 *
 * 代理层参数校验（只放行后端真会接受的值，非法即 400，不再多打一次必然失败的远端请求）：
 *  - 透传白名单：start_date / end_date / page / page_size，其余参数一律丢弃；
 *  - 日期必须是严格的 YYYY-MM-DD 且是真实存在的日期；
 *  - page >= 1，1 <= page_size <= 200。
 * 本接口是纯读接口，不涉及写操作。
 */

/** 后端对 page_size 的硬上限（statistics_handler.go:277-279） */
const MAX_PAGE_SIZE = 200;

/** YYYY-MM-DD 严格校验（含「真实存在的日期」检查） */
function normalizeDate(value: string | null): string | null | undefined {
    if (value === null) return undefined; // 未传 → 交给后端默认（最近 7 天 / 今天）
    const trimmed = value.trim();
    if (trimmed === "") return undefined;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (!m) return null;
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(`${trimmed}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10) === trimmed ? trimmed : null;
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;

    const start = normalizeDate(searchParams.get("start_date"));
    const end = normalizeDate(searchParams.get("end_date"));
    if (start === null) {
        return NextResponse.json({ code: 400, message: "开始日期格式错误，应为 YYYY-MM-DD", data: null }, { status: 400 });
    }
    if (end === null) {
        return NextResponse.json({ code: 400, message: "结束日期格式错误，应为 YYYY-MM-DD", data: null }, { status: 400 });
    }

    const rawPage = Number(searchParams.get("page") ?? "1");
    const rawPageSize = Number(searchParams.get("page_size") ?? "20");
    const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
    const pageSize = Number.isFinite(rawPageSize) && rawPageSize >= 1 ? Math.min(Math.floor(rawPageSize), MAX_PAGE_SIZE) : 20;

    const qs = new URLSearchParams();
    if (start !== undefined) qs.set("start_date", start);
    if (end !== undefined) qs.set("end_date", end);
    qs.set("page", String(page));
    qs.set("page_size", String(pageSize));

    return adminProxyFetch(`/statistics/visitor-logs?${qs.toString()}`, { method: "GET" });
}
