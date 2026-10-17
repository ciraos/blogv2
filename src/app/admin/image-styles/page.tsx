import { redirect } from "next/navigation";

/**
 * /admin/image-styles → /admin/image-styles/cache
 *
 * 这两条路由原本各有一份**内容完全相同**的页面（同一张「图片样式缓存」页挂两个 URL）。
 * 侧边栏指向的是 `/admin/image-styles/cache`，`/admin/image-styles` 只是历史入口/任务里提到过的路径。
 * 现在改成重定向：实现只保留一份（`cache/page.tsx`），老链接仍然可达。
 */
export default function ImageStylesRedirect() {
    redirect("/admin/image-styles/cache");
}
