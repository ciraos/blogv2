import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { API_URL } from "@/lib/api";
import { ACCESS_TOKEN_KEY } from "@/lib/auth";

// 文章分类（单条）：PUT / DELETE /api/admin/article-categories/[id] → 远端 /post-categories/{id}。
//
// 远端契约（router.go:319-320、pkg/handler/post_category/handler.go:85-132）：
//   PUT    body = model.UpdatePostCategoryRequest（字段全是指针，可只传要改的：
//          name / slug / description / is_series / sort_order）→ data = PostCategoryResponse
//   DELETE 无 body → data = null
const REMOTE = `${API_URL}/post-categories`;

interface RouteContext {
    params: Promise<{ id: string }>;
}

/** id 只允许非空、无斜杠的公共 ID（防止拼出跨路径请求） */
function safeId(id: string | undefined): string | null {
    if (!id) return null;
    const trimmed = id.trim();
    if (trimmed === "" || trimmed.includes("/") || trimmed.includes("..")) return null;
    return encodeURIComponent(trimmed);
}

async function forward(request: NextRequest, id: string | undefined, method: "PUT" | "DELETE") {
    const encoded = safeId(id);
    if (!encoded) {
        return NextResponse.json({ code: 400, message: "分类 ID 无效", data: null }, { status: 400 });
    }

    let body: string | undefined;
    if (method === "PUT") {
        let raw: unknown;
        try {
            raw = await request.json();
        } catch {
            return NextResponse.json({ code: 400, message: "请求体格式错误（需 JSON）", data: null }, { status: 400 });
        }
        if (typeof raw !== "object" || raw === null) {
            return NextResponse.json({ code: 400, message: "请求体必须是 JSON 对象", data: null }, { status: 400 });
        }
        // name 传了就不能是空串（远端 name 是可空指针，空串会把分类名改成空白）
        const name = (raw as { name?: unknown }).name;
        if (name !== undefined && (typeof name !== "string" || name.trim() === "")) {
            return NextResponse.json({ code: 400, message: "分类名称不能为空", data: null }, { status: 400 });
        }
        body = JSON.stringify(raw);
    }

    const token = request.cookies.get(ACCESS_TOKEN_KEY)?.value;
    if (!token) {
        return NextResponse.json({ code: 401, message: "未登录", data: null }, { status: 401 });
    }

    let res: Response;
    try {
        res = await fetch(`${REMOTE}/${encoded}`, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                ...(body ? { "Content-Type": "application/json" } : {}),
            },
            body,
            cache: "no-store",
        });
    } catch {
        return NextResponse.json({ code: 502, message: "无法连接后端服务", data: null }, { status: 502 });
    }

    const json: unknown = await res.json().catch(() => null);
    if (!res.ok || !json) {
        return NextResponse.json(
            {
                code: (json as { code?: number } | null)?.code ?? res.status,
                message:
                    (json as { message?: string } | null)?.message ||
                    `${method === "PUT" ? "更新" : "删除"}分类失败（HTTP ${res.status}）`,
                data: null,
            },
            { status: res.status }
        );
    }
    return NextResponse.json(json, { status: 200 });
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
    const { id } = await params;
    return forward(request, id, "PUT");
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
    const { id } = await params;
    return forward(request, id, "DELETE");
}
