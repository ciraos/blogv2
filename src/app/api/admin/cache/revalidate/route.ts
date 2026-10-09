import { NextRequest, NextResponse } from "next/server";
import { adminProxyFetch } from "@/lib/admin-api";

// 重新验证（清 Next.js 前端缓存）：POST 转发到远端 /admin/cache/revalidate（需登录）。
// 远端 body 形如 { type: "all" | "article" | "config" | "categories" | "tags" | "links", slug? }
// （pkg/handler/cache/handler.go:67-71 的 binding:"required,oneof=..."，slug 仅在 type=article 时必填）。
//
// 这里把 body 原样透传给远端，不在代理层做白名单校验：
// 远端已经用 binding 校验过，前端重复实现一份只会两处漂移。
// 远端路由证据：cmd/server/cache_management.go:26
export async function POST(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    return adminProxyFetch("/admin/cache/revalidate", { method: "POST", body: JSON.stringify(body) });
}
