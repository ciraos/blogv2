import { LinkCard } from "@/components/(blog)/link-card";
import type { LinkCategoryGroup } from "@/types/links";
import { EmptyState } from "@/components/(blog)/empty-state";
import { Link2 } from "lucide-react";

/**
 * 友链分区列表（纯展示）：
 * 服务端已按分类 id 升序分组、分类内按后端返回顺序排好，此处直接渲染。
 *
 * 注：分区里只有状态 APPROVED 的友链 —— INVALID（失联）在访客侧拿不到，
 * 见 lib/api.ts 里 getLinksGroupedByCategoryApi 的注释。
 */
export function LinkSections({ sections }: { sections: LinkCategoryGroup[] }) {
    if (sections.length === 0) {
        return <EmptyState icon={Link2} title="暂无友情链接" description="还没有通过审核的友链，欢迎申请。" />;
    }

    return (
        <>
            {sections.map(({ category, links }) => (
                <section key={category.id}>
                    <h2 className="text-lg font-semibold">
                        {category.name}
                        <span className="ml-1 text-xs font-medium text-primary/80">({links.length})</span>
                    </h2>
                    {category.description && (
                        <p className="mt-0.5 text-sm text-muted-foreground">{category.description}</p>
                    )}
                    <div data-stagger
                className="link-grid mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {links.map((link) => (
                            <LinkCard key={link.id} link={link} />
                        ))}
                    </div>
                </section>
            ))}
        </>
    );
}
