import type { Metadata } from "next";

import { EquipmentList } from "@/components/(blog)/equipment-list";
import { PageBanner } from "@/components/(blog)/page-banner";
import { PageWithSidebar } from "@/components/(blog)/page-with-sidebar";
import { PostComments } from "@/components/(blog)/post-comments";

import { getCommentsWithChildrenApi } from "@/lib/api";
import { getCommentAuthor } from "@/lib/comment-author";
import { generateBlogMetadata } from "@/lib/seo";
import { getSiteConfigs } from "@/lib/site-config";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("我的装备");
}

/** 我的装备页：顶部横幅 + 装备清单（都来自 site-config 的 equipment.*）+ 评论区 */
export default async function Equipment() {
    const targetPath = "/equipment";
    // 横幅与装备清单都来自站点配置（后台「页面显示 → 装备页面」）
    const config = await getSiteConfigs();
    const equipment = config?.equipment;

    // 有标题或背景图才渲染横幅，否则回落到纯文字标题（避免一条空白块）。
    // ⚠️ 字段与官方前端的用法是**错位**的（对着线上页面的 DOM 核过）：
    //   banner.title       → 横幅左上角小字（官方 bannerTips）
    //   banner.description → 横幅大字标题（官方 bannerTitle）
    //   banner.tip         → 横幅底部说明（官方 bannerDesc）
    const banner =
        equipment?.banner && (equipment.banner.title || equipment.banner.background) ? (
            <PageBanner
                background={equipment.banner.background}
                tip={equipment.banner.title}
                title={equipment.banner.description}
                description={equipment.banner.tip}
            />
        ) : null;

    const comments = await getCommentsWithChildrenApi(targetPath);

    return (
        <PageWithSidebar>
            <div className="w-full space-y-6">
                <header>{banner ?? <h1 className="text-2xl font-bold tracking-tight">我的装备</h1>}</header>

                <EquipmentList groups={equipment?.list} />

                <PostComments targetPath={targetPath} comments={comments} author={await getCommentAuthor()} />
            </div>
        </PageWithSidebar>
    );
}
