import { cache } from "react";

import { getAllPublicArticlesApi, getPublicArchivesApi } from "@/lib/api";

/**
 * 「重查询」的同请求去重。
 *
 * 背景：`getAllPublicArticlesApi()` 会分页遍历 `/public/articles`（最多 20 页 × 50 条），
 * `getPublicArchivesApi()` 拿全量归档摘要。这两份数据在**同一次页面渲染**里被多处需要：
 *   - (blog)/layout → lib/header-data.ts（移动端标签云 + 建站天数）
 *   - PageWithSidebar → blog-sidebar 的标签卡 / 归档卡 / 站点信息卡
 *   - 页面本身（/tags、/categories 的「全部分类/标签」态、/archives 的年月时间轴）
 * 结果是打开一页要打好几次同一个接口。
 *
 * React 的 `cache()` 作用域是一次请求：同一渲染里多次调用只真正执行一次。
 * **不加跨请求缓存**——文章列表要立刻反映后台的增删改；需要更长的缓存应显式加
 * revalidate，不要在这里偷偷加。
 *
 * 只能在 Server Component / Route Handler 里用（react 的 cache 在客户端组件里不可用）。
 */
export const getAllPublicArticlesCached = cache(() => getAllPublicArticlesApi());

export const getPublicArchivesCached = cache(() => getPublicArchivesApi());
