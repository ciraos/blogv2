import { NextRequest } from "next/server";
import { adminProxyFetch } from "@/lib/admin-api";

// 管理员订单列表：GET 转发到远端 PRO 模块 /pro/admin/orders（需登录）。
// 后端不开放 CORS 且需鉴权，浏览器端不能直连，由本路由读取 httpOnly cookie 中的 token 转发。
// 查询参数（page / page_size / status / payment_provider / order_type / order_no / trade_no /
// user_email / start_date / end_date / sort_by / sort_order）原样透传。
export async function GET(request: NextRequest) {
    const qs = request.nextUrl.searchParams.toString();
    return adminProxyFetch(`/pro/admin/orders${qs ? `?${qs}` : ""}`, { method: "GET" });
}
