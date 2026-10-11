import type { Metadata } from "next";
import { cookies } from "next/headers";

import { PageWithSidebar } from "@/components/(blog)/page-with-sidebar";
import { QaQuestionDetail } from "@/components/(blog)/qa-question-detail";
import { generateBlogMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

interface QuestionDetailPageProps {
    params: Promise<{ id: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
    // 问题标题要发一次详情请求才能拿到；为避免首屏两次请求，这里用固定标题（官方也是先渲染再用客户端数据填充）
    return generateBlogMetadata("问题详情");
}

/**
 * 社区问答 · 问题详情（前台 /questions/[id]）。
 *
 * 这个路由的存在性有确证：线上前台 chunk（模块 538679）里提问成功后执行
 * `router.push(`/questions/${e.data.id}`)` —— 官方就是同一路径。
 * 远端数据由客户端组件经 /api/public/community-qa/questions/{id} 拉取
 * （详情响应结构未取证，见组件内的容错解析与诚实说明）。
 */
export default async function QuestionDetailPage({ params }: QuestionDetailPageProps) {
    const { id } = await params;
    const isLoggedIn = Boolean((await cookies()).get("token")?.value);

    return (
        <PageWithSidebar>
            <QaQuestionDetail id={id} isLoggedIn={isLoggedIn} />
        </PageWithSidebar>
    );
}
