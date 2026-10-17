import { NextResponse } from "next/server";

import { authedProxyFetch } from "@/lib/admin-api";

type Params = Promise<{ provider: string }>;

/**
 * 启用 / 停用某个支付方式：
 *   POST /api/pro/payment/config/{provider}/toggle → 远端 POST /pro/payment/config/{PROVIDER}/toggle
 *
 * 远端路径段是**大写枚举**（ALIPAY / WECHAT / EPAY / HUPIJIAO），
 * 与本应用这条同源路由用的小写 slug 不同，所以这里必须做一次映射。
 */
const PROVIDER_ENUM: Record<string, string> = {
    alipay: "ALIPAY",
    wechat: "WECHAT",
    epay: "EPAY",
    hupijiao: "HUPIJIAO",
};

export async function POST(request: Request, { params }: { params: Params }) {
    const { provider } = await params;
    const target = PROVIDER_ENUM[provider];
    if (!target) {
        return NextResponse.json({ code: 400, message: "不支持的支付方式", data: null }, { status: 400 });
    }

    let body: { enabled?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    if (typeof body?.enabled !== "boolean") {
        return NextResponse.json({ code: 400, message: "enabled 必须是布尔值", data: null }, { status: 400 });
    }

    return authedProxyFetch(`/pro/payment/config/${target}/toggle`, {
        method: "POST",
        body: JSON.stringify({ enabled: body.enabled }),
    });
}
