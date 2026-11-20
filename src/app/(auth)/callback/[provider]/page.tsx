import type { Metadata } from "next";

import { OAuthCallbackClient } from "@/components/(auth)/oauth-callback-client";

import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("第三方登录");
}

/**
 * 第三方登录回调页：服务商授权后回到 `/callback/{provider}?code=…&state=…`。
 * 真正的换取 token 在客户端调同源接口完成（服务端写 httpOnly cookie），
 * 所以这里只把 provider 传下去。
 */
export default async function OAuthCallbackPage({ params }: { params: Promise<{ provider: string }> }) {
    const { provider } = await params;

    return (
        <div className="py-6">
            <OAuthCallbackClient provider={provider} />
        </div>
    );
}
