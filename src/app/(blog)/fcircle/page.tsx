import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowUpDown } from "lucide-react";

import { MomentCard } from "@/components/(blog)/moment-card";
import { MomentsRefreshButton } from "@/components/(blog)/moments-refresh-button";
import { NumberedPagination } from "@/components/(blog)/numbered-pagination";
import { PageBanner } from "@/components/(blog)/page-banner";
import { PostComments } from "@/components/(blog)/post-comments";
import { PageWithSidebar } from "@/components/(blog)/page-with-sidebar";

import { ApiError, getCommentsWithChildrenApi, getPublicMomentsApi } from "@/lib/api";
import { getCommentAuthor } from "@/lib/comment-author";
import { generateBlogMetadata } from "@/lib/seo";
import { getSiteConfigs } from "@/lib/site-config";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("朋友圈");
}

interface FcircleSearchParams {
    page?: string;
    sort_type?: string;
}

export default async function Fcircle({ searchParams }: { searchParams: Promise<FcircleSearchParams> }) {
    const sp = await searchParams;
    const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
    // 排序：published_at（发布时间，默认）/ created_at（抓取时间）
    const sortType = sp.sort_type === "created_at" ? "created_at" : "published_at";

    // 站点配置（服务端取数；横幅文案/背景图与每页条数全部由 moments.* 驱动）
    const config = await getSiteConfigs();
    const moments = config?.moments;
    // 每页条数取 moments.display_limit；配置缺失或非法（0/负数）时回落到 20
    const pageSize = moments?.display_limit && moments.display_limit > 0 ? moments.display_limit : 20;

    // 横幅：moments.enable 为真才渲染；字段缺失时回落到原页面文案
    const banner = moments?.enable ? (
        <PageBanner
            background={moments.top_background}
            tip={moments.tips}
            title={moments.title || "朋友圈"}
            description={moments.subtitle}
            action={{ text: moments.button_text, link: moments.button_link }}
        />
    ) : null;

    // 登录态：httpOnly cookie 有 token 即视为已登录
    const cookieStore = await cookies();
    const isLoggedIn = !!cookieStore.get("token")?.value;

    let data;
    let errorMessage: string | null = null;
    try {
        data = await getPublicMomentsApi({ page, page_size: pageSize, sort_type: sortType });
    } catch (err) {
        errorMessage = err instanceof ApiError ? err.message : "网络请求失败";
        data = null;
    }

    // 空态 / 错误态
    if (!data || data.list.length === 0) {
        return (
            <PageWithSidebar>
                <div className="w-full space-y-6">
                    {banner ?? <h1 className="text-2xl font-bold tracking-tight">朋友圈</h1>}
                    <p className="py-16 text-center text-sm text-muted-foreground">
                        {errorMessage ? `暂时无法获取内容：${errorMessage}` : "暂无内容，敬请期待"}
                    </p>
                </div>
            </PageWithSidebar>
        );
    }

    const totalPages = Math.max(1, Math.ceil(data.total / pageSize));
    const stats = data.statistics;
    // 评论区：target_path 用本页路由路径（后端字面匹配）
    const targetPath = "/fcircle";
    const comments = await getCommentsWithChildrenApi(targetPath);
    // 分页链接保留排序参数
    const pageHref = (p: number) =>
        `/fcircle?${sortType !== "published_at" ? `sort_type=${sortType}&` : ""}page=${p}`;

    return (
        <PageWithSidebar>
            <div className="w-full space-y-6">
                <header>
                    {banner ?? <h1 className="text-2xl font-bold tracking-tight">朋友圈</h1>}
                    {/* 统计 + 排序按钮（移动端纵向堆叠，桌面端同行；有横幅时与横幅留出间距） */}
                    <div
                        className={`${banner ? "mt-4" : "mt-1"} flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center`}
                    >
                        <p className="text-sm text-muted-foreground">
                            {stats
                                ? `${stats.active_links} 个活跃友链 · ${stats.total_moments} 篇动态`
                                : `共 ${data.total} 篇动态`}
                        </p>
                        <Link
                            href={sortType === "published_at" ? "/fcircle?sort_type=created_at" : "/fcircle?sort_type=published_at"}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
                        >
                            <ArrowUpDown className="size-3.5" />
                            {sortType === "published_at" ? "按发布时间" : "按抓取时间"}
                        </Link>
                    </div>
                </header>

                {/* 网格：严格从左到右、逐行排列（最新在前）。grid-cols-1 保证移动端单列不按内容撑宽；
                    卡片右下角「评论」会把该条动态作为引用送到下方评论区（沿用同一个 target_path） */}
                <div className="fcircle-grid grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {data.list.map((moment) => (
                        <MomentCard key={moment.id} moment={moment} commentTargetPath={targetPath} />
                    ))}
                </div>

                <NumberedPagination page={page} totalPages={totalPages} makePageHref={pageHref} />

                {/* 上次抓取时间 + 刷新按钮（右下角） */}
                {stats?.last_updated_time && (
                    <p className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
                        上次抓取更新：{stats.last_updated_time}
                        <MomentsRefreshButton isLoggedIn={isLoggedIn} />
                    </p>
                )}

                {/* 评论区 */}
                <PostComments targetPath={targetPath} comments={comments}  author={await getCommentAuthor()} />
            </div>
        </PageWithSidebar>
    );
}
