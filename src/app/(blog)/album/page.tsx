import type { Metadata } from "next";

import { AlbumExplorer, type AlbumPageConfig } from "@/components/(blog)/album-explorer";
import { PostComments } from "@/components/(blog)/post-comments";

import {
    getCommentsWithChildrenApi,
    getPublicAlbumCategoriesApi,
    getPublicAlbumsApi,
    type Album,
} from "@/lib/api";
import { getCommentAuthor } from "@/lib/comment-author";
import { requireSiteConfigs } from "@/lib/site-config";
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

/**
 * 相册页（在 (blog) 路由组内，与其它前台页面共用 Header / 页脚 / 悬浮按钮组）。
 * 版式、横幅、列数、间距、每页数量、评论开关全部读后端 site-config 的 album 字段：
 *   layout_mode / banner / page_size / waterfall.column_count / waterfall.gap /
 *   default_thumb_param / about_link / enable_comment
 */
export default async function AlbumPage() {
    // 分类 + 全量图片 + 站点配置（版式与页脚信息），互不阻塞
    const [categories, albums, config] = await Promise.all([
        getPublicAlbumCategoriesApi().catch(() => []),
        getAllAlbums(),
        requireSiteConfigs().catch(() => null),
    ]);

    const album = config?.album;
    const layoutMode = album?.layout_mode === "grid" ? "grid" : "waterfall";
    const enableComment = album?.enable_comment === true;

    const pageConfig: AlbumPageConfig = {
        layoutMode,
        pageSize: album?.page_size ?? 24,
        banner: {
            background: album?.banner?.background ?? "",
            title: album?.banner?.title ?? "",
            tip: album?.banner?.tip ?? "",
            description: album?.banner?.description ?? "",
        },
        waterfall: {
            large: album?.waterfall?.column_count?.large ?? 4,
            medium: album?.waterfall?.column_count?.medium ?? 3,
            small: album?.waterfall?.column_count?.small ?? 1,
            gap: album?.waterfall?.gap ?? 16,
        },
        defaultThumbParam: album?.default_thumb_param ?? "",
        // 「关于」留空时回落到全局关于链接
        aboutLink: album?.about_link || config?.ABOUT_LINK || "",
    };

    /** 过滤条右侧的公安备案（ICP 由 (blog) 布局的页脚展示，这里不重复） */
    const footer = {
        policeNumber: config?.POLICE_RECORD_NUMBER ?? "",
        policeIcon: config?.POLICE_RECORD_ICON ?? "",
    };

    // 评论区：按 album.enable_comment 开关（target_path 用本页路由，和后端字面匹配）
    const targetPath = "/album";
    const comments = enableComment ? await getCommentsWithChildrenApi(targetPath).catch(() => []) : [];
    const author = enableComment ? await getCommentAuthor() : null;

    return (
        <div className="mx-auto w-full">
            <AlbumExplorer albums={albums} categories={categories} config={pageConfig} footer={footer}>
                {enableComment ? <PostComments targetPath={targetPath} comments={comments} author={author} /> : null}
            </AlbumExplorer>
        </div>
    );
}
