import Link from "next/link";
import { LinkIcon } from "lucide-react";

import { resolveAssetUrl } from "@/lib/utils";

/**
 * 前台页面顶部横幅（背景图 + 小字提示 + 标题 + 描述 + 可选按钮）。
 *
 * 为什么抽成组件：即刻（essay.home_enable）、朋友圈（moments.enable）、相册（album.banner）
 * 三处的版式与字段形状本来就一致，只是字段名不同（top_background / banner.background …），
 * 之前各写一份，改版式要改三遍。
 *
 * 纯展示、无状态：服务端页面（essay / fcircle）直接当服务端组件渲染；
 * 相册由客户端组件 AlbumExplorer 调用，自动并入客户端 bundle（内部只用 Link / 纯函数，无副作用）。
 */
export interface PageBannerProps {
    /** 背景图（后端多为相对路径，交给 resolveAssetUrl 拼站点前缀） */
    background?: string | null;
    /** 左上角小字提示 */
    tip?: string | null;
    /** 主标题 */
    title?: string | null;
    /** 底部描述（副标题） */
    description?: string | null;
    /** 右下角按钮（相册横幅没有按钮，不传即可） */
    action?: { text?: string | null; link?: string | null } | null;
}

export function PageBanner({ background, tip, title, description, action }: PageBannerProps) {
    const bg = resolveAssetUrl(background);
    // 既没背景图也没标题时整体不渲染，避免页面上留一条空白色块
    if (!bg && !title) return null;

    return (
        <div
            data-page-banner=""
            className={
                "relative flex h-56 flex-col justify-between overflow-hidden rounded-xl p-5 text-white md:h-75 md:p-8 " +
                // 没有配背景图时给一层主题色渐变：横幅文案是白字，纯浅色底上会"隐形"
                // （更新日志页就是固定文案、没有背景图的情况）
                (bg ? "" : "bg-gradient-to-br from-primary to-primary/55")
            }
        >
            {bg && (
                <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={bg} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    {/* 遮罩：白字压在任意背景图上都可读（深浅色主题一致） */}
                    <div className="absolute inset-0 bg-black/35" />
                </>
            )}

            <div className="relative z-10">
                {tip && <div className="mb-2 text-[.75rem] font-medium text-white/80">{tip}</div>}
                {title && <div className="text-3xl font-bold leading-[1.2] md:text-[2.25rem]">{title}</div>}
            </div>

            {(description || action?.text) && (
                <div className="relative z-10 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    {description && (
                        <div className="min-w-0 flex-1 line-clamp-2 text-[.875rem] leading-normal text-white/90">
                            {description}
                        </div>
                    )}
                    {action?.text && (
                        <Link
                            href={action.link || "#"}
                            className="flex shrink-0 items-center rounded-lg bg-white/20 px-3.5 py-1.5 text-sm font-medium backdrop-blur-sm transition-colors hover:bg-white/30"
                        >
                            <LinkIcon className="mr-1 size-4.5" />
                            {action.text}
                        </Link>
                    )}
                </div>
            )}
        </div>
    );
}
