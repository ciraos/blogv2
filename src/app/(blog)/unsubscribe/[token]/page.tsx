import type { Metadata } from "next";

import { UnsubscribeClient } from "@/components/(blog)/unsubscribe-client";
import { PageWithSidebar } from "@/components/(blog)/page-with-sidebar";
import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("退订");
}

/**
 * 邮件退订落地页：`/unsubscribe/{token}`。
 * 真正的退订请求在客户端发（走同源 /api 代理），这里只把 token 传下去。
 */
export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;

    return (
        <PageWithSidebar>
            <UnsubscribeClient token={token} />
        </PageWithSidebar>
    );
}
