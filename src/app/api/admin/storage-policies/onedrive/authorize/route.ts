import { NextRequest, NextResponse } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";
import { sanitizeOneDriveAuthorize } from "@/lib/api-storage-policies-write";

// OneDrive 授权收尾：POST /api/admin/storage-policies/onedrive/authorize
// → 远端社区版 POST /api/policies/authorize/onedrive（router.go:533、handler.go:377-390）
// body: { code, state }（AuthorizeRequest，handler.go:359-363，两者都 binding:"required"）
//
// 官方前端 storage-policy.ts:52-55 就是 POST 这个路径 + { code, state }。
//
// ⚠️ 写操作本轮**只实现不实测**；代理层做参数校验（缺 code/state 本地 400）。
export async function POST(request: NextRequest) {
    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体不是合法 JSON", data: null }, { status: 400 });
    }

    const checked = sanitizeOneDriveAuthorize(raw);
    if (!checked.ok) {
        return NextResponse.json({ code: 400, message: checked.error, data: null }, { status: 400 });
    }

    return adminProxyFetch("/policies/authorize/onedrive", {
        method: "POST",
        body: JSON.stringify(checked.value),
    });
}
