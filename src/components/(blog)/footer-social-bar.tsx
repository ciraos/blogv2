import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import { resolveAssetUrl } from "@/lib/utils";
import type { FooterSocialItem } from "@/types/site-config";

interface FooterSocialBarProps {
    /** 左侧社交项 */
    left?: FooterSocialItem[];
    /** 右侧社交项 */
    right?: FooterSocialItem[];
    /** 中间头像（相对路径需拼前缀） */
    centerImg?: string;
}

function SocialItem({ item }: { item: FooterSocialItem }) {
    const isExternal = item.link.startsWith("http");
    return (
        <Link
            href={item.link}
            title={item.title}
            {...(isExternal ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
            className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
        >
            <Icon name={item.icon} className="text-lg leading-none" />
        </Link>
    );
}

/**
 * 页脚社交栏：左右各一排社交图标，中间站点头像（config.footer.socialBar）。
 * 复刻 anzhiyu 主题 footer 社交效果。
 */
export function FooterSocialBar({ left = [], right = [], centerImg }: FooterSocialBarProps) {
    if (left.length === 0 && right.length === 0 && !centerImg) return null;
    const avatar = resolveAssetUrl(centerImg);

    return (
        <div className="mb-8">
            <div className="flex flex-wrap items-center justify-center gap-6">
                {/* 左：社交图标 */}
                <div className="flex items-center gap-1">
                    {left.map((item) => (
                        <SocialItem key={item.title + item.link} item={item} />
                    ))}
                </div>

                {/* 中：头像 */}
                {avatar && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={avatar}
                        alt="site avatar"
                        loading="lazy"
                        className="size-10 rounded-full border-2 border-border object-cover"
                    />
                )}

                {/* 右：社交图标 */}
                <div className="flex items-center gap-1">
                    {right.map((item) => (
                        <SocialItem key={item.title + item.link} item={item} />
                    ))}
                </div>
            </div>
        </div>
    );
}
