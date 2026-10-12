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
        // 移动端纵向堆叠（正文在前、侧边栏在下方整块跟随文档流），lg 起才恢复「正文 + 右侧 300px 侧边栏」的横向布局。
        // 不用 order-* 反转：DOM 顺序本来就是正文在前，纵向堆叠时自然落在下方。
        <div className="flex flex-1 flex-col gap-6 lg:flex-row">
            {/* 主体内容区（container query 容器：收缩侧边栏时撑满，网格列数随宽度自适应） */}
            <div className="min-w-0 flex-1 @container/main">{children}</div>

            {/* 侧边栏（移动端排在正文下方且全宽；lg 起恢复右侧 300px 固定栏，收起/展开等桌面语义见 CollapsibleAside） */}
            {config && <BlogSidebar config={config} />}
        </div>
    );
}
