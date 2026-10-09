import { NextRequest, NextResponse } from "next/server";
import { adminProxyFetch } from "@/lib/admin-api";

// 缓存管理：POST 转发到远端 /admin/cache/manage（需登录），body 形如 { type: "page" | "image" | "index" }
// （pkg/handler/cache/handler.go:34-58，type 必填，取值须命中远端 Configure 注册的 actions）。
//
// 这一层做一次 type 白名单校验，原因：远端对未知 type 只会回 400「当前运行模式不支持此操作」，
// 语义含糊；在代理层拦住拼错的 type 能给出更准确的错误，也避免无意义地打扰线上后端。
// 远端路由证据：cmd/server/cache_management.go:27
const ALLOWED_TYPES = ["page", "image", "index"] as const;

export async function POST(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }

    const type = typeof body === "object" && body !== null ? (body as { type?: unknown }).type : undefined;
    if (typeof type !== "string" || !ALLOWED_TYPES.includes(type as (typeof ALLOWED_TYPES)[number])) {
        return NextResponse.json(
            { code: 400, message: "缓存类型无效，仅支持 page / image / index", data: null },
            { status: 400 }
        );
    }

    return adminProxyFetch("/admin/cache/manage", { method: "POST", body: JSON.stringify({ type }) });
}
