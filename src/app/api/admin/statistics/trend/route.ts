import { NextRequest } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

/** GET /api/admin/statistics/trend 访问趋势（period=daily/weekly/monthly，days 默认 30，上限 365） */
export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl;
    const allowed = ["period", "days"];
    const qs = new URLSearchParams();
    for (const key of allowed) {
        const value = searchParams.get(key);
        if (value !== null && value !== "") {
            qs.set(key, value);
        }
    }
    const query = qs.toString();
    return adminProxyFetch(`/statistics/trend${query ? `?${query}` : ""}`, { method: "GET" });
}
