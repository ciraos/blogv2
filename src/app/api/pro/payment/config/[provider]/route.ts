import { NextResponse } from "next/server";

import { authedProxyFetch } from "@/lib/admin-api";

type Params = Promise<{ provider: string }>;

/**
 * 保存某个支付方式的配置：
 *   POST /api/pro/payment/config/{provider} → 远端 POST /pro/payment/config/{provider}
 *
 * 路径段的 provider 是**小写 slug**（alipay / wechat / epay / hupijiao）。
 * 注意与 toggle / test 不同：那两个用的是大写枚举（ALIPAY / WECHAT / …），别混。
 * 白名单校验在这里做，避免把任意路径带进后端。
 */
const SLUGS = new Set(["alipay", "wechat", "epay", "hupijiao"]);

export async function POST(request: Request, { params }: { params: Params }) {
    const { provider } = await params;
    if (!SLUGS.has(provider)) {
        return NextResponse.json({ code: 400, message: "不支持的支付方式", data: null }, { status: 400 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json({ code: 400, message: "请求体格式错误", data: null }, { status: 400 });
    }

    return authedProxyFetch(`/pro/payment/config/${provider}`, {
        method: "POST",
        body: JSON.stringify(body),
    });
}
