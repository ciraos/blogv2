import { NextRequest, NextResponse } from "next/server";

import { rawAdminProxyFetch } from "@/lib/admin-api";
import { isValidPolicyId, type OneDriveAuthUrlData } from "@/lib/api-storage-policies-write";

// OneDrive 授权链接：GET /api/admin/storage-policies/onedrive/connect/[id]
// → 远端社区版 GET /api/policies/connect/onedrive/:id（router.go:532、handler.go:341-357）。
//
// ⚠️ 无论上游是哪种形态，本路由**始终回 JSON**，绝不把 302 直接透给浏览器：
//   前端是用 fetch 调本路由的（同源 XHR），302 到微软属于跨域跳转 ——
//   fetch 会自动跟随并被 CORS 拦下，授权链接根本拿不到。所以：
//   a) 上游返回 JSON { code, message, data: { url } }（官方前端的用法，storage-policy.ts:47-50）→ 原样回；
//   b) 上游自己 302 到微软授权页（OAuth 常见做法）→ 取 Location 塞进 data.url，
//      由前端 window.location.href 做整窗跳转（官方前端 storage/[id]/page.tsx:89-91 同样整窗跳）。
//
// 授权完成后微软会回到后端登记的 redirect_uri，由后端自己收尾（社区版 ConnectOneDrive
// 只负责生成链接，所以回调落在后端而不是本站前端）。

type Params = { params: Promise<{ id: string }> };

/** GET /api/admin/storage-policies/onedrive/connect/[id] —— 获取授权链接 */
export async function GET(_request: NextRequest, { params }: Params) {
    const { id } = await params;
    if (!isValidPolicyId(id)) {
        return NextResponse.json({ code: 400, message: "策略 ID 不合法", data: null }, { status: 400 });
    }

    let upstream: Response | null;
    try {
        upstream = await rawAdminProxyFetch(`/policies/connect/onedrive/${encodeURIComponent(id)}`, {
            method: "GET",
        });
    } catch {
        return NextResponse.json({ code: 502, message: "无法连接后端服务", data: null }, { status: 502 });
    }
    if (!upstream) {
        return NextResponse.json({ code: 401, message: "未登录", data: null }, { status: 401 });
    }

    // 情况 b：上游给重定向 → 把 Location 当授权链接回给前端（见文件头说明）
    if (upstream.status >= 300 && upstream.status < 400) {
        const location = upstream.headers.get("location");
        if (location) {
            const data: OneDriveAuthUrlData = { url: location };
            return NextResponse.json({ code: 200, message: "获取成功", data }, { status: 200 });
        }
    }

    // 情况 a：上游给 JSON（信封形状与 adminProxyFetch 保持一致）
    const text = await upstream.text();
    let json: { code?: number; message?: string; data?: OneDriveAuthUrlData } | null = null;
    try {
        json = JSON.parse(text) as { code?: number; message?: string; data?: OneDriveAuthUrlData };
    } catch {
        // 非 JSON（例如网关返回 HTML）：走下面的统一兜底
    }

    if (!json) {
        return NextResponse.json(
            { code: upstream.status, message: text || `请求失败（HTTP ${upstream.status}）`, data: null },
            { status: upstream.ok ? 502 : upstream.status }
        );
    }

    if (upstream.ok && (json.code === 200 || json.code === 0)) {
        return NextResponse.json(json, { status: 200 });
    }

    return NextResponse.json(json, { status: upstream.ok ? 502 : upstream.status });
}
