import type { Metadata } from "next";
import { LinkApplyConditions } from "@/components/(blog)/link-apply-conditions";
import { LinkSections } from "@/components/(blog)/link-sections";
import { getLinksByCategoryApi, getPublicLinkCategoriesApi, getPublicSiteConfigApi } from "@/lib/api";
import { generateBlogMetadata } from "@/lib/seo";

// 友链来自远端实时数据，不做构建期静态预渲染
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("友情链接");
}

export default async function Link() {
    // 站点配置（用于页脚自定义内容）
    const config = await getPublicSiteConfigApi().catch(() => null);

    // 获取分类列表，再按分类拉取友链。
    // 空分类默认隐藏；「推荐」例外——即使暂无友链也保留分区，展示占位文案。
    // 展示顺序：推荐永远最上、已失联永远最下，其余按管理员保存的排序（localStorage）或 API 顺序。
    const categories = await getPublicLinkCategoriesApi();

    const sections = await Promise.all(
        categories.map(async (category) => ({
            category,
            links: await getLinksByCategoryApi(category.id),
        }))
    );
    // 「推荐」空分类保留；其余空分类隐藏
    const visible = sections.filter(
        (section) => section.links.length > 0 || section.category.name === "推荐"
    );
    const totalLinks = visible.reduce((sum, section) => sum + section.links.length, 0);

    // 页脚自定义内容（后端已渲染好的 HTML）
    const customHtml = config?.FRIEND_LINK_APPLY_CUSTOM_CODE_HTML || "";
    // 友链申请条件（勾选全部后可申请）
    const applyConditions = config?.FRIEND_LINK_APPLY_CONDITION || [];

    return (
        <div className="linksetcion w-full space-y-4">
            {/* <div className="link-banner shadow-md">a</div> */}
            <header className="space-y-1">
                <h1 className="text-2xl font-bold tracking-tight">友情链接</h1>
                <p className="text-sm text-muted-foreground">
                    {totalLinks > 0 ? `共 ${totalLinks} 位朋友，感谢相遇` : "暂无友链"}
                </p>
            </header>

            {visible.length === 0 ? (
                <p className="py-16 text-center text-muted-foreground">暂无友情链接</p>
            ) : (
                /* 分区渲染：按管理员保存的分类顺序（LinkSections 内部读取 localStorage 重排） */
                <LinkSections sections={visible} />
            )}

            {/* 页脚自定义内容（免责声明 + 友链申请须知等，后端渲染好的 HTML，末尾含 yaml 示例框） */}
            {customHtml && (
                <div
                    className="FRIEND_LINK_APPLY_CUSTOM_CODE article-body"
                    dangerouslySetInnerHTML={{ __html: customHtml }}
                />
            )}

            {/* 申请条件：放在 yaml 示例框下方，全部勾选后可申请友链 */}
            <LinkApplyConditions conditions={applyConditions} />
        </div>
    );
}
