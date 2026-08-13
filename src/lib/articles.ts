// 分类 / 标签聚合工具（从公开文章列表聚合统计）
import type { PostItem } from "@/types/articles";

export interface TaxonomyItem {
    id: string;
    name: string;
    count: number;
}

function collect<T extends { id: string; name: string }>(items: T[]): TaxonomyItem[] {
    const map = new Map<string, TaxonomyItem>();
    for (const item of items) {
        const existing = map.get(item.id);
        if (existing) {
            existing.count += 1;
        } else {
            map.set(item.id, { id: item.id, name: item.name, count: 1 });
        }
    }
    return [...map.values()].sort(
        (a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN")
    );
}

/** 统计文章分类（按文章数降序） */
export function collectCategories(articles: PostItem[]): TaxonomyItem[] {
    return collect(articles.flatMap((article) => article.post_categories));
}

/** 统计文章标签（按文章数降序） */
export function collectTags(articles: PostItem[]): TaxonomyItem[] {
    return collect(articles.flatMap((article) => article.post_tags));
}
