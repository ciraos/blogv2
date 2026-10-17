import type { NextRequest } from "next/server";

import { publicProxy } from "@/lib/public-proxy";

/**
 * GET /api/auth/check-email?email=… → 远端 GET /auth/check-email
 *
 * 远端返回 data.exists（该邮箱是否已注册，见 scripts/swagger.yaml 的 /auth/check-email）。
 * 供「注册前查重」与「找回密码前预检」使用；邮箱格式交给后端判（400），这里只做 trim。
 */
export async function GET(request: NextRequest) {
    const email = (request.nextUrl.searchParams.get("email") ?? "").trim();
    return publicProxy("/auth/check-email", {
        method: "GET",
        searchParams: email ? new URLSearchParams({ email }) : undefined,
    });
}
