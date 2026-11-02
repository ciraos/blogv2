import { authedProxyFetch } from "@/lib/admin-api";

// 用户中心 · 发起第三方账号绑定：POST /api/user/oauth-bindings/{provider}/bind
// → 远端 PRO /pro/oauth/{provider}/bind（返回获取授权地址所需的数据）
export async function POST(_request: Request, { params }: { params: Promise<{ provider: string }> }) {
    const { provider } = await params;
    return authedProxyFetch(`/pro/oauth/${encodeURIComponent(provider)}/bind`, {
        method: "POST",
        body: JSON.stringify({}),
    });
}
