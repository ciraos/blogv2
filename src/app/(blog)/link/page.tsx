import type { Metadata } from "next";
import { LinkCard } from "@/components/(blog)/link-card";
import { LinkApplyConditions } from "@/components/(blog)/link-apply-conditions";
import { getLinksByCategoryApi, getPublicLinkCategoriesApi, getPublicSiteConfigApi } from "@/lib/api";
import { generateBlogMetadata } from "@/lib/seo";

// 友链来自远端实时数据，不做构建期静态预渲染
export const dynamic = "force-dynamic";

// 友链分类展示顺序（按名称匹配；未匹配到的分类排在最后）
// 「推荐」分区当前无好友，自动隐藏；以后有友链会出现在 大佬们 之后、小伙伴 之前
const CATEGORY_ORDER = ["冰糖红茶", "大佬们", "推荐", "小伙伴", "已失联"];

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("友情链接");
}

export default async function Link() {
    // 站点配置（用于页脚自定义内容）
    const config = await getPublicSiteConfigApi().catch(() => null);

    // 先获取分类列表，再按分类拉取友链；按 CATEGORY_ORDER 顺序排列（空分类自动隐藏）
    const categories = await getPublicLinkCategoriesApi();

    const sections = await Promise.all(
        categories.map(async (category) => ({
            category,
            links: await getLinksByCategoryApi(category.id),
        }))
    );
    // 只展示有友链的分类；顺序：冰糖红茶 → 大佬们 → 小伙伴 → 已失联，未匹配分类放最后
    const sorted = sections.slice().sort((a, b) => {
        const ia = CATEGORY_ORDER.indexOf(a.category.name);
        const ib = CATEGORY_ORDER.indexOf(b.category.name);
        return (ia === -1 ? CATEGORY_ORDER.length : ia) - (ib === -1 ? CATEGORY_ORDER.length : ib);
    });
    const visible = sorted.filter((section) => section.links.length > 0);
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
                visible.map(({ category, links }) => (
                    <section key={category.id}>
                        <h2 className="text-lg font-semibold">{category.name}</h2>
                        {category.description && (
                            <p className="mt-0.5 text-sm text-muted-foreground">{category.description}</p>
                        )}
                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {links.map((link) => (
                                <LinkCard key={link.id} link={link} />
                            ))}
                        </div>
                    </section>
                ))
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
