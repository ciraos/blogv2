"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";

import type { MomentItem } from "@/types/moments";
import { toPlainText, useCommentQuote } from "@/hooks/use-comment-quote";
import { resolveAssetUrl } from "@/lib/utils";

function formatTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function initials(name: string): string {
    return name.trim().charAt(0) || "友";
}

/** 朋友圈卡片（flex 纵向：内容顶对齐，时间贴底，适配 grid 等高拉伸） */
export function MomentCard({
    moment,
    commentTargetPath,
}: {
    moment: MomentItem;
    /** 本页评论区的 target_path：点右下角「评论」时用它派发引用事件，须与 <PostComments> 一致 */
    commentTargetPath: string;
}) {
    const logo = resolveAssetUrl(moment.link_logo);
    // 头像加载失败或数据里就是占位图时，切到首字圆形兜底
    const [avatarFailed, setAvatarFailed] = useState(false);
    const isPlaceholderLogo = !!logo && /404|placeholder|default/i.test(logo);
    const showInitials = avatarFailed || isPlaceholderLogo || !logo;

    // 点「评论」：把这条动态的标题（无标题时退回摘要 / 友链名）作为引用送进页面底部评论区并滚过去
    const setQuote = useCommentQuote(commentTargetPath);

    return (
        <div className="flex h-full flex-col soft-surface p-3.5 transition-shadow hover:shadow-md">
            <a
                href={moment.post_url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="block flex-1"
            >
                {/* 友链信息 */}
                <div className="flex items-center gap-2">
                    {logo && !showInitials ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={logo}
                            alt=""
                            loading="lazy"
                            onError={() => setAvatarFailed(true)}
                            className="size-6 shrink-0 rounded-full object-cover"
                        />
                    ) : (
                        <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                            {initials(moment.link_name)}
                        </div>
                    )}
                    <span className="truncate text-xs font-medium text-muted-foreground">{moment.link_name}</span>
                </div>

                {/* 文章标题 */}
                <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-snug group-hover:text-primary">
                    {moment.post_title}
                </h3>

                {/* 摘要 */}
                {moment.post_summary && (
                    <p className="mt-1.5 line-clamp-4 text-xs leading-relaxed text-muted-foreground">
                        {moment.post_summary}
                    </p>
                )}
            </a>

            {/* 底部信息条：时间在左，「评论」按钮在右（与即刻卡片一致的操作位） */}
            <div className="mt-2.5 flex items-center justify-between gap-2 border-t pt-2 text-[11px] text-muted-foreground">
                <span>{formatTime(moment.published_at)}</span>
                <button
                    type="button"
                    onClick={() =>
                        setQuote(toPlainText(moment.post_title || moment.post_summary || moment.link_name))
                    }
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="评论这条动态"
                    title="评论这条动态"
                >
                    <MessageCircle className="size-4" />
                </button>
            </div>
        </div>
    );
}
