import { BlogSidebar } from "@/components/(blog)/blog-sidebar";
import { getPublicSiteConfigApi } from "@/lib/api";
import type { SiteConfig } from "@/types/site-config";

/**
 * 带右侧边栏的页面容器（对齐官方 anheyu-app-frontend 的做法：
 * 侧边栏由「页面」决定是否渲染，而不是全局布局统一挂）。
 *
 * 用法：需要侧边栏的页面把内容包起来 ——
 *   return <PageWithSidebar>{内容}</PageWithSidebar>
 * 不需要侧边栏的页面直接返回内容即可（(blog)/layout.tsx 只提供居中容器与内边距）。
 */
export async function PageWithSidebar({ children }: { children: React.ReactNode }) {
    // 服务端取站点配置（同一请求内 Next 会复用已有请求）。
    // 取不到时降级为「不显示侧边栏」，页面主体照常渲染 —— 与原来 layout 里 getSiteConfigs 的容错口径一致。
    let config: SiteConfig | null = null;
    try {
        config = await getPublicSiteConfigApi();
    } catch {
        config = null;
    }

    return (
        <div className="flex flex-1 gap-6">
            {/* 主体内容区（container query 容器：收缩侧边栏时撑满，网格列数随宽度自适应） */}
            <div className="min-w-0 flex-1 @container/main">{children}</div>

            {/* 右侧边栏（300px，桌面端显示；移动端隐藏） */}
            {config && <BlogSidebar config={config} />}
        </div>
    );
}
