/**
 * JSON-LD 结构化数据（schema.org）构造器。
 *
 * 为什么需要：搜索结果里的「富摘要」（文章标题 + 时间 + 作者 + 缩略图、面包屑路径）
 * 全靠页面里的 `application/ld+json`。之前全站 **0 处**，Google / 百度都只能按普通网页收录。
 *
 * 口径：
 *   - 只用 schema.org 官方字段，不塞私有字段（塞错会被判为垃圾结构化数据，反而扣分）；
 *   - 值一律从真实数据来（文章标题/时间/封面/作者/分类标签），**不编造**；
 *   - 输出前由 JsonLd 组件统一做 `</script>` 转义。
 */

/** 站点级信息（首页 / 全站共用） */
export interface SiteSchemaInput {
    name: string;
    url: string;
    description?: string;
    logo?: string;
}

/** 文章级信息 */
export interface ArticleSchemaInput {
    title: string;
    description?: string;
    url: string;
    image?: string;
    /** ISO 时间（后端给的是 RFC3339） */
    datePublished?: string;
    dateModified?: string;
    authorName: string;
    authorUrl?: string;
    publisherName: string;
    publisherLogo?: string;
    keywords?: string[];
    section?: string;
    wordCount?: number;
}

/** 面包屑的一项 */
export interface BreadcrumbItem {
    name: string;
    url: string;
}

/** WebSite + 站内搜索动作（放在全站 layout，帮助搜索引擎直接给「站内搜索」框） */
export function websiteSchema(site: SiteSchemaInput) {
    return {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: site.name,
        url: site.url,
        ...(site.description ? { description: site.description } : {}),
        ...(site.url ? { potentialAction: {
            "@type": "SearchAction",
            target: { "@type": "EntryPoint", urlTemplate: `${site.url.replace(/\/$/, "")}/search?q={search_term_string}` },
            "query-input": "required name=search_term_string",
        } } : {}),
    };
}

/** 文章主体（BlogPosting，比 Article 更精确，Google 两者都认） */
export function articleSchema(article: ArticleSchemaInput) {
    return {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: article.title,
        ...(article.description ? { description: article.description } : {}),
        mainEntityOfPage: { "@type": "WebPage", "@id": article.url },
        url: article.url,
        ...(article.image ? { image: [article.image] } : {}),
        ...(article.datePublished ? { datePublished: article.datePublished } : {}),
        ...(article.dateModified ? { dateModified: article.dateModified } : {}),
        ...(article.keywords && article.keywords.length > 0 ? { keywords: article.keywords.join(",") } : {}),
        ...(article.section ? { articleSection: article.section } : {}),
        ...(article.wordCount && article.wordCount > 0 ? { wordCount: article.wordCount } : {}),
        author: {
            "@type": "Person",
            name: article.authorName,
            ...(article.authorUrl ? { url: article.authorUrl } : {}),
        },
        publisher: {
            "@type": "Organization",
            name: article.publisherName,
            ...(article.publisherLogo ? { logo: { "@type": "ImageObject", url: article.publisherLogo } } : {}),
        },
    };
}

/** 面包屑（首页 → 栏目 → 当前页），Google 用它替换搜索结果里的 URL 显示 */
export function breadcrumbSchema(items: BreadcrumbItem[]) {
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: item.name,
            item: item.url,
        })),
    };
}
