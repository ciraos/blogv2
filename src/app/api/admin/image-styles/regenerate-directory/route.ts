import { NextRequest, NextResponse } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

// 按目录批量重新生成缩略图：POST /api/admin/image-styles/regenerate-directory
// → 远端 POST /thumbnail/regenerate/directory
// 远端 body { directoryId: string }，是**目录公共ID**（publicID）；目标必须是文件夹，
// 否则远端 400「目标不是一个文件夹。」
// 证据：pkg/handler/thumbnail/handler.go:128-169；router.go:404-405。
export async function POST(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误（需 JSON）", data: null }, { status: 400 });
    }

    const directoryId =
        typeof body === "object" && body !== null ? (body as { directoryId?: unknown }).directoryId : undefined;
    if (typeof directoryId !== "string" || directoryId.trim() === "") {
        return NextResponse.json(
            { code: 400, message: "directoryId 必须是非空字符串（目录公共ID）", data: null },
            { status: 400 }
        );
    }

    return adminProxyFetch("/thumbnail/regenerate/directory", {
        method: "POST",
        body: JSON.stringify({ directoryId: directoryId.trim() }),
    });
}
