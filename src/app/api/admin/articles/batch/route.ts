import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

// 文章批量删除：DELETE /api/admin/articles/batch → 远端 DELETE /articles/batch。
//
// 远端契约（router.go:379 → pkg/handler/article/handler.go:794-850）：
//   body JSON { ids: string[] }（binding:"required"，**字段名是 ids 不是 article_ids**，
//   官方旧前端 post-management.ts:100 传的 article_ids 在这个版本上会被判为「文章ID列表不能为空」）；
//   1..100 篇（handler.go:828-836），响应 data = { success_count, failed_count, failed_ids }。
//
// 这里与 /api/admin/comments 的批量删除同一写法：本地先做参数校验（非法 body 直接 400，
// 不做必然失败的往返），通过后交给 adminProxyFetch 转发（它负责读 httpOnly token 与 401/502）。
const MAX_BATCH_DELETE = 100;

export async function DELETE(request: NextRequest) {
    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误（需 JSON）", data: null }, { status: 400 });
    }

    if (typeof raw !== "object" || raw === null) {
        return NextResponse.json({ code: 400, message: "请求体必须是 JSON 对象", data: null }, { status: 400 });
    }

    const ids = (raw as { ids?: unknown }).ids;
    if (!Array.isArray(ids)) {
        return NextResponse.json({ code: 400, message: "缺少 ids 字段（字符串数组）", data: null }, { status: 400 });
    }
    if (ids.length === 0) {
        return NextResponse.json({ code: 400, message: "ids 不能为空", data: null }, { status: 400 });
    }
    if (ids.length > MAX_BATCH_DELETE) {
        return NextResponse.json(
            { code: 400, message: `单次最多删除 ${MAX_BATCH_DELETE} 篇文章`, data: null },
            { status: 400 }
        );
    }
    for (const id of ids) {
        if (typeof id !== "string" || id.trim() === "") {
            return NextResponse.json(
                { code: 400, message: "ids 只能是非空字符串（文章公共 ID）", data: null },
                { status: 400 }
            );
        }
    }

    const clean = (ids as string[]).map((id) => id.trim());
    return adminProxyFetch("/articles/batch", { method: "DELETE", body: JSON.stringify({ ids: clean }) });
}
