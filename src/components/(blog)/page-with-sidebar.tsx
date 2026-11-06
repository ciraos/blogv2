import { BlogSidebar } from "@/components/(blog)/blog-sidebar";
import { getSiteConfigs } from "@/lib/site-config";
import type { SiteConfig } from "@/types/site-config";

/**
 * 页面容器（原「带右侧边栏」版）。
 *
 * 现在**不再渲染右侧边栏**：用户觉得它碍事、占宽度。侧栏组件 `BlogSidebar` 保留在仓库里，
 * 想恢复时把下面 `SHOW_SIDEBAR` 改回 true（或直接取消注释 renderSidebar 那段）即可。
 *
 * 保留这层容器本身的价值：所有页面统一走同一个入口，将来换布局只改这里。
 */
const SHOW_SIDEBAR = false;

export async function PageWithSidebar({ children }: { children: React.ReactNode }) {
    if (!SHOW_SIDEBAR) {
        // 无侧栏：正文仍按 1200px 居中（.main 的宽度），这里只负责纵向排布
        // 阅读宽度：无侧栏时不再铺满 1200，收到 960 居中，行长更舒服（大屏上也不会一行近百字）
        return <div className="mx-auto flex w-full max-w-300 flex-1 flex-col">{children}</div>;
    }

    // 走 lib/site-config 里被 React `cache()` 包住的实现：同一次渲染内 layout / 页面 / 侧边栏
    // 各取一次配置，实际只发一个请求（以前这里单独调 getPublicSiteConfigApi，会多打一次）。
    // 取不到时降级为「不显示侧边栏」，页面主体照常渲染。
    let config: SiteConfig | null = null;
    try {
        config = (await getSiteConfigs()) ?? null;
    } catch {
        config = null;
    }

    return (
        <div className="flex flex-1 flex-col gap-10 py-8 lg:flex-row lg:justify-center">
            {/* 主体内容区（container query 容器：网格列数随宽度自适应） */}
            <div className="min-w-0 flex-1 @container/main">{children}</div>

            {config && <BlogSidebar config={config} />}
        </div>
    );
}
