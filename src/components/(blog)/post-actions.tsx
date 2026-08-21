"use client";
import Link from "next/link";
import {
    Bell,
    Coins,
    Share2
} from "lucide-react";

export interface PostActionsConfig {
    /** 站点名称 */
    siteName: string;
    /** 作者 */
    author: string;
    /** 站点口号（副标题） */
    subtitle: string;
    /** 站点首页链接 */
    siteUrl: string;
    /** 站长头像（已解析为完整 URL，来自 site-config USER_AVATAR） */
    userAvatar?: string | null;
    /** 备案号 */
    icp: string;
    /** 是否显示 打赏/订阅/分享 按钮（来自 post.copyright） */
    showRewardButton: boolean;
    showSubscribeButton: boolean;
    showShareButton: boolean;
}

interface PostActionsProps extends PostActionsConfig {
    /** 文章标题（分享用，接口预留） */
    title?: string;
    /** 当前文章链接（分享用，接口预留） */
    url?: string;
}

/**
 * 文章末尾操作块：版权信息 + 打赏 / 订阅 / 分享（对齐线上 PostCopyright）。
 * 数据由服务端组件（文章页）从 /public/site-config 获取后通过 props 传入，
 * 客户端组件内不做网络请求（避免浏览器直连后端 CORS 问题）。
 */
export function PostActions({
    siteName,
    subtitle,
    siteUrl,
    userAvatar,
    showRewardButton,
    showSubscribeButton,
    showShareButton,
    title,
    url,
}: PostActionsProps) {
    // TODO: 打赏 —— 打开打赏弹层（post.reward 二维码等，接口预留）
    function handleReward() {
        // 接口预留：openRewardModal()
    }

    // TODO: 订阅 —— 打开订阅弹层（post.subscribe，接口预留）
    function handleSubscribe() {
        // 接口预留：openSubscribeModal()
    }

    // TODO: 分享 —— 优先 navigator.share，降级复制链接
    function handleShare() {
        // 接口预留：sharePost(title, url)
        void title;
        void url;
    }

    const showButtons = showRewardButton || showSubscribeButton || showShareButton;

    return (
        <div className="mt-16 w-full rounded-lg border border-border/40 bg-card/40 py-4">
            <div className="flex flex-col items-center gap-2">
                {userAvatar && (
                    <Link href={siteUrl} target="_blank" className="block relative z-10 -mt-12">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={userAvatar}
                            alt="站长头像"
                            className="size-16 rounded-full border-2 border-white object-cover shadow-sm dark:border-border"
                        />
                    </Link>
                )}
                <div className="m-0 text-center">
                    <div>{siteName}</div>
                    <div className="text-xs text-muted-foreground">{subtitle}</div>
                </div>
            </div>

            {showButtons && (
                <div className="my-2.5 flex items-center justify-center gap-5">
                    {showRewardButton && (
                        <button
                            type="button"
                            onClick={handleReward}
                            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-red-500 px-5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                            aria-label="打赏作者"
                        >
                            <Coins className="size-4" />
                            打赏作者
                        </button>
                    )}
                    {showSubscribeButton && (
                        <button
                            type="button"
                            onClick={handleSubscribe}
                            className="inline-flex h-9 items-center gap-1.5 rounded-full border bg-green-500 px-5 text-sm font-medium text-white transition-colors hover:opacity-90"
                            aria-label="订阅"
                        >
                            <Bell className="size-4" />
                            订阅
                        </button>
                    )}
                    {showShareButton && (
                        <button
                            type="button"
                            onClick={handleShare}
                            className="inline-flex h-9 items-center gap-1.5 rounded-full border bg-blue-500 px-5 text-sm font-medium text-white transition-colors hover:opacity-90"
                            aria-label="分享"
                        >
                            <Share2 className="size-4" />
                            分享
                        </button>
                    )}
                </div>
            )}

            <div className="text-center text-xs text-muted-foreground">
                <span>本文是原创文章，采用</span>
                <Link
                    href="https://creativecommons.org/licenses/by-nc-sa/4.0/"
                    target="_blank"
                    className="underline decoration-dotted"
                >
                    &nbsp;CC BY-NC-SA 4.0 &nbsp;
                </Link>
                <span>协议，完整转载请注明来自</span>
                <Link href={siteUrl} target="_blank" className="underline decoration-dotted">
                    &nbsp;{siteName}&nbsp;
                </Link>
            </div>
        </div>
    );
}
