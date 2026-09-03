import { LinkCard } from "@/components/(blog)/link-card";
import type { FriendLink, LinkCategory } from "@/types/links";

export interface LinkSection {
    category: LinkCategory;
    links: FriendLink[];
}

/**
 * 友链分区列表（纯展示）：
 * 服务端已按分类 id 升序排列并过滤空分类，此处直接渲染。
 * 排序规则：分类按创建顺序（id 升序，id 越大越往下）；
 * 后端暂无分类排序字段，等 API 支持后再扩展。
 */
export function LinkSections({ sections }: { sections: LinkSection[] }) {
    if (sections.length === 0) {
        return <p className="py-16 text-center text-muted-foreground">暂无友情链接</p>;
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
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {links.map((link) => (
                            <LinkCard key={link.id} link={link} />
                        ))}
                    </div>
                </section>
            ))}
        </>
    );
}
