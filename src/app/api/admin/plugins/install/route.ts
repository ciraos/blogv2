import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { adminProxyFetch } from "@/lib/admin-api";
import { API_URL } from "@/lib/api";
import { ACCESS_TOKEN_KEY } from "@/lib/auth";

// 插件安装：POST /api/admin/plugins/install → 远端 POST /admin/plugins/install。
//
// 参数形式（权威证据 pkg/handler/plugin_admin/handler.go:105-142）：
//   **multipart/form-data 上传 zip 安装包**，字段名固定 `file`；
//   只接受 .zip（117-120 行），远端上限 100MB（23 行 maxUploadSize）。
//   不是传 URL / 插件名 —— 后端直接 c.FormFile("file") 并通过 InstallFromZip 落盘。
//
// 为什么安装这条不复用 adminProxyFetch：它会给带 body 的请求补 JSON Content-Type，
// 把 multipart 的 boundary 破坏掉（src/lib/admin-api.ts:24-26 的注释也这么写）。
// 所以这里照 /api/admin/articles/uploads 系列的做法手动转发，并**原样带上传入的 Content-Type**
// （含 boundary），避免重新解析 FormData 造成一次 100MB 级别的内存复制。
//
// ⚠️ 本站中间件 src/proxy.ts 覆盖全站，Next 16 会为中间件克隆请求体，
//    默认上限 10MB（next.config.ts 的 experimental.proxyClientMaxBodySize，超限只缓冲前 10MB、
//    不报错），而 proxy.ts 与 next.config.ts 都不在本次可改范围内 ——
//    因此这里显式做 10MB 前置校验，超限就直接给出明确错误，不让用户拿到一个「已截断的坏 zip」。
const MAX_BODY_BYTES = 10 * 1024 * 1024;

/** POST /api/admin/plugins/install 安装（或升级）插件：上传 zip 安装包，字段名 file */
export async function POST(request: NextRequest) {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
        return NextResponse.json(
            { code: 400, message: "安装插件需以 multipart/form-data 上传 zip 安装包（字段名 file）", data: null },
            { status: 400 }
        );
    }

    const declaredLength = Number(request.headers.get("content-length") ?? "");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
        return NextResponse.json(
            {
                code: 413,
                message: `安装包超过本站 10MB 转发上限（${(declaredLength / 1024 / 1024).toFixed(1)}MB）；后端本身允许 100MB，需先调大 proxyClientMaxBodySize`,
                data: null,
            },
            { status: 413 }
        );
    }

    // 走到这里说明没登录（否则中间件已跳转）：直接沿用统一代理，返回 401 信封
    const token = (await cookies()).get(ACCESS_TOKEN_KEY)?.value;
    if (!token) {
        return adminProxyFetch("/admin/plugins/install", { method: "POST" });
    }

    // 整体读出再转发：multipart 的 boundary 在 Content-Type 里，透传原始头即可，
    // 无需自己拼 FormData（这一点与原图上传路由的写法不同，理由见文件头注释）。
    const body = await request.arrayBuffer();

    let res: Response;
    try {
        res = await fetch(`${API_URL}/admin/plugins/install`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": contentType,
            },
            body,
            cache: "no-store",
        });
    } catch {
        return NextResponse.json({ code: 502, message: "无法连接后端服务", data: null }, { status: 502 });
    }

    const json: unknown = await res.json().catch(() => null);
    if (!res.ok || !json) {
        const envelope = json as { code?: number; message?: string } | null;
        return NextResponse.json(
            {
                code: envelope?.code ?? res.status,
                message: envelope?.message || `插件安装失败（HTTP ${res.status}）`,
                data: null,
            },
            { status: res.status }
        );
    }
    return NextResponse.json(json);
}
