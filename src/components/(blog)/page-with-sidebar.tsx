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
 *
 * `toc`：文章页的目录。目录原来长在右侧边栏里，侧栏下线后它就跟着消失了；
 * 现在由页面单独传进来，容器在 lg 起给它一条 208px 的窄边栏（版面注脚位），
 * 与 720px 正文正好凑满 .main 的 960px（720 + 32 间距 + 208）。
 */
const SHOW_SIDEBAR = false;

/** 目录边栏宽度：与 720 正文 + gap-8(32) 合计 960 = .main 的最大宽度 */
const TOC_RAIL_WIDTH = "w-[208px]";

export async function PageWithSidebar({
    children,
    toc,
}: {
    children: React.ReactNode;
    /** 文章页目录；不传 = 单栏（其它页面维持原样，纵向间距一点不动） */
    toc?: React.ReactNode;
}) {
    if (!SHOW_SIDEBAR) {
        if (!toc) {
            // 无侧栏：宽度由外层 .main 决定（960px），这里只负责纵向排布
            return <div className="mx-auto flex w-full flex-1 flex-col">{children}</div>;
        }

        return (
            // lg 不加 items-start：目录边栏要拉伸到与正文同高，里面的 sticky 才有可移动的空间
            <div className="mx-auto flex w-full flex-1 flex-col lg:flex-row lg:gap-8">
                <div className="min-w-0 flex-1">{children}</div>
                {/* 目录只在桌面端占位（移动端入口是右下角悬浮按钮的目录抽屉，避免和正文抢地方） */}
                <aside className={`hidden shrink-0 lg:block ${TOC_RAIL_WIDTH}`}>
                    <div className="sticky top-24">{toc}</div>
                </aside>
            </div>
        );
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
