import type { Metadata } from "next";

import { AlbumWaterfall } from "@/components/(blog)/album-waterfall";

import {
    getPublicAlbumCategoriesApi,
    getPublicAlbumsApi,
    getPublicSiteConfigApi,
    type Album,
} from "@/lib/api";
import { generateBlogMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("相册集");
}

export default async function AlbumPage() {
    const config = await getPublicSiteConfigApi().catch(() => null);
    const banner = config?.album?.banner;

    // 分类 + 图片列表（分类失败不影响图片展示）
    const [categories, albumData] = await Promise.all([
        getPublicAlbumCategoriesApi().catch(() => []),
        getPublicAlbumsApi({ page: 1, pageSize: 24 }).catch(() => null),
    ]);

    const images = (albumData?.list ?? []) as Album[];

    return (
        <div className="w-full space-y-6">

            {/* 分类筛选 */}
            {categories.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                        全部
                    </span>
                    {categories.map((category) => (
                        <span
                            key={category.id}
                            className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground"
                        >
                            {category.name}
                        </span>
                    ))}
                </div>
            )}

            {/* 图片 JS 瀑布流（最短列放置）：桌面 4 列 / 平板 3 列 / 移动单列 */}
            {images.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-20 text-sm text-muted-foreground">
                    <span className="text-4xl">📷</span>
                    <span>暂无相册，敬请期待</span>
                </div>
            ) : (
                <AlbumWaterfall images={images} />
            )}

            {/* Banner */}
            {banner && (banner.title || banner.description) && (
                <div className="relative flex flex-col gap-3 overflow-hidden rounded-b-xl bg-linear-to-br from-primary/90 to-primary p-8 text-primary-foreground sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <div className="text-sm opacity-80">{banner.tip}</div>
                        <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">{banner.title || "相册"}</h1>
                        <p className="mt-2 text-sm opacity-85">{banner.description}</p>
                    </div>
                    {/* ICP 备案（来自 site-config ICP_NUMBER） */}
                    {config?.ICP_NUMBER && (
                        <div className="icp-beian self-end text-xs opacity-75">
                            <a
                                href="https://beian.miit.gov.cn"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="transition-opacity hover:opacity-100"
                            >
                                {config.ICP_NUMBER}
                            </a>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
