import type { NextRequest } from "next/server";

import { authedProxyFetch } from "@/lib/admin-api";

// 文件管理 · 直链：POST /api/admin/direct-links → 远端 POST /direct-links
// body: { file_ids: ["文件的公共ID"] }，返回 [{ link: "/api/f/xxx/name.png", file_url: "anzhiyu://my/name.png" }]
//
// 用途：设置里上传图片到文件管理后，用它拿到可直接写进站点配置的图片地址。
export async function POST(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return Response.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    return authedProxyFetch("/direct-links", { method: "POST", body: JSON.stringify(body) });
}
