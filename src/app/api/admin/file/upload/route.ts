import type { NextRequest } from "next/server";

import { authedProxyFetch } from "@/lib/admin-api";

// 文件管理 · 分片上传会话：PUT /api/admin/file/upload → 远端 PUT /file/upload
// body: { uri: "anzhiyu://my/xxx.png", size: 123456, policy_id: 公共ID, overwrite?: boolean }
// 返回：{ upload_method: "server" | "client", session_id?, chunk_size?, upload_url? … }
//
// 说明：站点设置里的「站长头像」上传走的就是这套文件管理上传（PUT 建会话 + POST 分片），
// 目的是让头像落进「我的文件」根目录，和已有的 avatar.avif 同级，而不是落到文章图片目录。
export async function PUT(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return Response.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    return authedProxyFetch("/file/upload", { method: "PUT", body: JSON.stringify(body) });
}

/** 放弃上传会话：DELETE /api/admin/file/upload → 远端 DELETE /file/upload */
export async function DELETE(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return Response.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    return authedProxyFetch("/file/upload", { method: "DELETE", body: JSON.stringify(body) });
}
