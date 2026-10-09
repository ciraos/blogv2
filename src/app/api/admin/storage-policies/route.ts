import { NextRequest, NextResponse } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";
import { sanitizePolicyInput, toRemotePolicyBody } from "@/lib/api-storage-policies-write";

// 存储策略集合：GET 列表 / POST 新建，同源代理到远端社区版 /api/policies。
//
// 路径依据（2026-10 实测 + 源码复核）：
//   - src/app/api/admin/storage-policies/route.ts 原先的 GET 已线上探活确认为 /api/policies，
//     社区版 router.go:528-531 里也只有 `policies.GET("")` / `policies.POST("")`；
//     旧 swagger 里的 /api/storage-policies 线上 404，仍不采用。
//   - 官方前端（scripts/theme/theme-anheyu-next-main/src/lib/api/storage-policy.ts:16）用的是
//     PRO 前缀 /api/pro/policies，但同一文件 L48/L54 的 OneDrive 两个接口用的是社区版
//     /api/policies/** —— 说明官方前端本身就是「PRO 资源 + 社区版 OneDrive」混用。
//     本项目已经跑通的读路径是社区版 /policies，写路径与它保持一致，
//     避免出现「列表读社区版、写入 PRO 版」这种会把数据写到不同后端的状态。
//
// ⚠️ 写操作本轮**只实现不实测**：创建 / 修改存储策略会影响上传落盘与已有文件寻址。
// 代理层做参数校验（非法 body 本地 400），不给远端送脏数据。

// 存储策略列表：GET 转发到远端 /policies（需登录）。
// 后端不开放 CORS 且需鉴权，浏览器端不能直连，由本路由读取 httpOnly cookie 中的 token 转发。
// ⚠️ 路径修正（2026-10 实测）：线上真实路由是 /api/policies（社区版 router.go:528），
//    旧 swagger 里的 /api/storage-policies 线上返回 404 —— 原先转发到它会取不到任何数据。
// 响应形状 { list, total }（无分页）。
export async function GET(request: NextRequest) {
    const qs = request.nextUrl.searchParams.toString();
    return adminProxyFetch(`/policies${qs ? `?${qs}` : ""}`, { method: "GET" });
}

/**
 * POST /api/admin/storage-policies —— 新建存储策略
 * 远端：POST /api/policies，请求体 = CreatePolicyRequest（handler.go:26-39）
 * body: { name, type, flag?, server?, bucket_name?, is_private?, access_key?, secret_key?,
 *         max_size?, base_path?, virtual_path?, settings? }
 */
export async function POST(request: NextRequest) {
    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体不是合法 JSON", data: null }, { status: 400 });
    }

    // 代理层本地校验：不合格直接 400，不把脏数据透传给远端
    const checked = sanitizePolicyInput(raw);
    if (!checked.ok) {
        return NextResponse.json({ code: 400, message: checked.error, data: null }, { status: 400 });
    }

    return adminProxyFetch("/policies", {
        method: "POST",
        body: JSON.stringify(toRemotePolicyBody(checked.value)),
    });
}
