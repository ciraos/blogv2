import { resolveBadgeSrc } from "@/lib/footer-runtime";
import type { FooterConfig } from "@/types/site-config";

interface FooterBadgesProps {
    /** footer.badge 配置段（enable + list[{message, link, shields}]） */
    config?: FooterConfig["badge"];
}

/**
 * 页脚徽章（官方 `footer.pug` 的 `p#ghbdages` / `.github-badge`）：
 *   每项渲染成「左侧文案 + 可点徽章图」，整块横向居中排列。
 *
 * 图片地址取 `shields`：完整 URL 直接用（后端默认值和线上值都是图床 SVG），
 * 只填片段（如 `badge/AnHeYu-v2-blue`）时补 `https://img.shields.io/` 前缀。
 * `message` 同时写进 `title` / `alt`（官方口径）并显示在图片左侧。
 * 未开启 `enable` 或列表为空时整块不渲染。
 */
export function FooterBadges({ config }: FooterBadgesProps) {
    if (!config?.enable) return null;

    const list = (config.list ?? []).filter((item) => item && resolveBadgeSrc(item.shields));
    if (list.length === 0) return null;

    return (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            {list.map((item) => (
                <a
                    key={`${item.link}-${item.shields}`}
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={item.message}
                    className="inline-flex items-center gap-1.5 transition-opacity hover:opacity-80"
                >
                    {item.message && <span className="text-xs text-muted-foreground">{item.message}</span>}
                    {/* 徽章图来自配置的外链（shields.io 或自建图床），固定 20px 高（官方 #ghbdages 同款） */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={resolveBadgeSrc(item.shields)} alt={item.message} loading="lazy" decoding="async" className="h-5 w-auto max-w-[150px] rounded" />
                </a>
            ))}
        </div>
    );
}
