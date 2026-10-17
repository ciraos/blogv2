import { NextResponse } from "next/server";

import { authedProxyFetch } from "@/lib/admin-api";

type Params = Promise<{ provider: string }>;

/**
 * 测试某个支付方式的连接：
 *   POST /api/pro/payment/config/{provider}/test → 远端 POST /pro/payment/config/{PROVIDER}/test
 *
 * 同 toggle：远端路径段用大写枚举，这里把 slug 映射过去。
 * 无请求体；远端成功时 message 里带说明文案（面板直接展示）。
 */
const PROVIDER_ENUM: Record<string, string> = {
    alipay: "ALIPAY",
    wechat: "WECHAT",
    epay: "EPAY",
    hupijiao: "HUPIJIAO",
};

export async function POST(_request: Request, { params }: { params: Params }) {
    const { provider } = await params;
    const target = PROVIDER_ENUM[provider];
    if (!target) {
        return NextResponse.json({ code: 400, message: "不支持的支付方式", data: null }, { status: 400 });
    }

    return authedProxyFetch(`/pro/payment/config/${target}/test`, { method: "POST" });
}
