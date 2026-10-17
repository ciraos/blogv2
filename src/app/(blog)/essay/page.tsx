import type { Metadata } from "next";

import { EssayWaterfall } from "@/components/(blog)/essay-waterfall";
import { NumberedPagination } from "@/components/(blog)/numbered-pagination";
import { PageBanner } from "@/components/(blog)/page-banner";
import { PostComments } from "@/components/(blog)/post-comments";
import { PageWithSidebar } from "@/components/(blog)/page-with-sidebar";

import { ApiError, getCommentsWithChildrenApi, getPublicEssaysApi } from "@/lib/api";
import { getCommentAuthor } from "@/lib/comment-author";
import { generateBlogMetadata } from "@/lib/seo";
import { getSiteConfigs } from "@/lib/site-config";

const PAGE_SIZE = 10;

interface EssaySearchParams {
    page?: string;
}

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("即刻");
}

export default async function Essay({ searchParams }: { searchParams: Promise<EssaySearchParams> }) {
    const config = await getSiteConfigs();
    const { page: pageRaw } = await searchParams;
    const page = Math.max(1, parseInt(pageRaw ?? "1", 10) || 1);

    // /pro/essays 为公开接口，失败时展示友好提示
    let data;
    let errorMessage: string | null = null;
    try {
        data = await getPublicEssaysApi({ page, page_size: PAGE_SIZE });
    } catch (err) {
        errorMessage = err instanceof ApiError ? err.message : "网络请求失败";
        data = null;
    }

    // 空态 / 错误态
    if (!data || data.list.length === 0) {
        return (
            <PageWithSidebar>
                <div className="w-full space-y-6">
                    <h1 className="text-2xl font-bold tracking-tight">即刻</h1>
                    <p className="py-16 text-center text-sm text-muted-foreground">
                        {errorMessage ? `暂时无法获取内容：${errorMessage}` : "暂无内容，敬请期待"}
                    </p>
                </div>
            </PageWithSidebar>
        );
    }

    const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

    // 评论区：target_path 用本页路由路径（后端字面匹配）
    const targetPath = "/essay";
    const comments = await getCommentsWithChildrenApi(targetPath);

    return (
        <PageWithSidebar>
            <div className="w-full space-y-6">

                {/* 顶部横幅：与朋友圈/相册共用同一个组件（字段名映射到 PageBanner 的中性 props） */}
                {config?.essay.home_enable ? (
                    <PageBanner
                        background={config.essay.top_background}
                        tip={config.essay.tips}
                        title={config.essay.title}
                        description={config.essay.subtitle}
                        action={{ text: config.essay.button_text, link: config.essay.button_link }}
                    />
                ) : (<h1 className="text-2xl font-bold tracking-tight">即刻</h1>)}

                {/* JS 瀑布流：桌面 3 列 / 平板 2 列 / 移动端 1 列，最短列放置；图片可点击打开看图器；
                    卡片右下角「评论」会把该条说说作为引用送到下方评论区（沿用同一个 target_path） */}
                <EssayWaterfall essays={data.list} commentTargetPath={targetPath} />

                <NumberedPagination
                    page={page}
                    totalPages={totalPages}
                    makePageHref={(p) => `/essay?page=${p}`}
                />

                {/* 评论区 */}
                <PostComments targetPath={targetPath} comments={comments}  author={await getCommentAuthor()} />
            </div>
        </PageWithSidebar>
    );
}
