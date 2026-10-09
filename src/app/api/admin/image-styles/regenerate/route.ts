import { NextRequest, NextResponse } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

// 重新生成单张缩略图：POST /api/admin/image-styles/regenerate → 远端 POST /thumbnail/regenerate
// 远端 body { id: string }，id 是**文件公共ID**（publicID，不是自增数字）
// 证据：pkg/handler/thumbnail/handler.go:75-125（binding:"required"，成功 202 + {status:"processing"}）；
//      router.go:397-402（thumbnail 组只需 JWTAuth）。
//
// 为什么放在 image-styles 代理目录下而不是复用 /api/admin/thumbnail：现有
// /api/admin/thumbnail/[id] 代理的是「取签名」这一个 GET，语义不同；新建动作路由更清楚，
// 也避免改动别人的文件。
export async function POST(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误（需 JSON）", data: null }, { status: 400 });
    }

    const id = typeof body === "object" && body !== null ? (body as { id?: unknown }).id : undefined;
    if (typeof id !== "string" || id.trim() === "") {
        return NextResponse.json({ code: 400, message: "id 必须是非空字符串（文件公共ID）", data: null }, { status: 400 });
    }

    return adminProxyFetch("/thumbnail/regenerate", {
        method: "POST",
        body: JSON.stringify({ id: id.trim() }),
    });
}
