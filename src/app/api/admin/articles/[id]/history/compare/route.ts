import type { NextRequest } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";

/**
 * GET /api/admin/articles/[id]/history/compare?v1=&v2= 取两个版本的内容用于对比。
 * 返回 { new_version, old_version }（均为完整历史版本，含 content_md / content_html）。
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const { search } = new URL(request.url);
    return adminProxyFetch(`/articles/${encodeURIComponent(id)}/history/compare${search}`, { method: "GET" });
}
