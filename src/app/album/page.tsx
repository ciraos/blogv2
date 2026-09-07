import type { Metadata } from "next";

import { AlbumExplorer } from "@/components/(blog)/album-explorer";

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

/** 一次拉取全部相册（前端本地做分类/排序/分页；按 total 分页遍历） */
async function getAllAlbums(): Promise<Album[]> {
    const first = await getPublicAlbumsApi({ page: 1, pageSize: 100 }).catch(() => null);
    if (!first) return [];
    const list = [...(first.list ?? [])];
    if (first.total > list.length) {
        const pages = Math.ceil(first.total / 100);
        for (let p = 2; p <= pages; p++) {
            const data = await getPublicAlbumsApi({ page: p, pageSize: 100 }).catch(() => null);
            if (!data) break;
            list.push(...(data.list ?? []));
        }
    }
    return list;
}

export default async function AlbumPage() {
    // 分类 + 全量图片 + 站点配置（页脚头像/备案），互不阻塞
    const [categories, albums, config] = await Promise.all([
        getPublicAlbumCategoriesApi().catch(() => []),
        getAllAlbums(),
        getPublicSiteConfigApi().catch(() => null),
    ]);

    const pageSize = config?.album?.page_size ?? 24;
    const footer = {
        avatar: config?.USER_AVATAR ?? "",
        siteName: config?.APP_NAME ?? "博客",
        icp: config?.ICP_NUMBER ?? "",
        policeNumber: config?.POLICE_RECORD_NUMBER ?? "",
        policeIcon: config?.POLICE_RECORD_ICON ?? "",
    };

    return (
        <div className="album-main w-full">
            {/* 顶部直接展示相册 + 居中分页 + 底部固定工具条 */}
            <AlbumExplorer albums={albums} categories={categories} pageSize={pageSize} footer={footer} />
        </div>
    );
}
