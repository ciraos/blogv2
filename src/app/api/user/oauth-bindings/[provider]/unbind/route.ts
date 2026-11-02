import { authedProxyFetch } from "@/lib/admin-api";

// 用户中心 · 解绑第三方账号：DELETE /api/user/oauth-bindings/{provider}/unbind
// → 远端 PRO /pro/oauth/{provider}/unbind
export async function DELETE(_request: Request, { params }: { params: Promise<{ provider: string }> }) {
    const { provider } = await params;
    return authedProxyFetch(`/pro/oauth/${encodeURIComponent(provider)}/unbind`, { method: "DELETE" });
}
