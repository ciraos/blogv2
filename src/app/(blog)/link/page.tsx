import type { Metadata } from "next";

import { LinkCard } from "@/components/(blog)/link-card";

import { getLinksByCategoryApi, getPublicLinkCategoriesApi } from "@/lib/api";
import { generateBlogMetadata } from "@/lib/seo";

// 友链来自远端实时数据，不做构建期静态预渲染
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("友情链接");
}

export default async function LinkPage() {
    // 先获取分类列表，再按分类拉取友链
    const categories = await getPublicLinkCategoriesApi();

    const sections = await Promise.all(
        categories.map(async (category) => ({
            category,
            links: await getLinksByCategoryApi(category.id),
        }))
    );
    // 只展示有友链的分类，保持接口返回顺序
    const visible = sections.filter((section) => section.links.length > 0);
    const totalLinks = visible.reduce((sum, section) => sum + section.links.length, 0);

    return (
        <div className="w-full space-y-8">
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
                        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {links.map((link) => (
                                <LinkCard key={link.id} link={link} />
                            ))}
                        </div>
                    </section>
                ))
            )}
        </div>
    );
}
