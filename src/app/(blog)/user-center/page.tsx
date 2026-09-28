import type { Metadata } from "next";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";

import { UserCenterContent, type UserCenterUser } from "@/components/(blog)/user-center-content";
import { getUserInfoApi } from "@/lib/api";
import { resolveCommentAvatar } from "@/lib/avatar";
import { isAdminUser } from "@/lib/auth";
import { generateBlogMetadata } from "@/lib/seo";
import { getSiteConfigs } from "@/lib/site-config";
import { resolveAssetUrl } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("用户中心");
}

/** 注册时间：固定时区格式化（服务端算好再传下去，避免客户端时区差异导致水合不一致） */
function formatJoinDate(iso?: string): string {
    if (!iso) return "未知";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "未知";
    return d.toLocaleDateString("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "long",
        day: "numeric",
    });
}

/**
 * 用户中心（对齐官方 anheyu-app-frontend 的 (frontend)/user-center）：
 * 服务端读 httpOnly token 取用户信息后传给客户端组件；未登录 / token 失效时传 null，
 * 由客户端渲染「请先登录」空态（与官方一致）。
 */
export default async function UserCenter() {
    const token = (await cookies()).get("token")?.value;
    // 头像配置（站点配置 GRAVATAR_URL / DEFAULT_GRAVATAR_TYPE）：与评论区同一口径，
    // 邮箱没有注册头像时由 d= 生成兜底头像，所以头像地址永远有值
    const config = await getSiteConfigs();
    const gravatar = { url: config?.GRAVATAR_URL, defaultType: config?.DEFAULT_GRAVATAR_TYPE };

    let user: UserCenterUser | null = null;

    if (token) {
        try {
            const info = await getUserInfoApi(token);
            const email = info.email || "";
            // 头像：后端自定义头像优先，否则按邮箱 MD5 走 Gravatar（与评论区/侧边栏同一口径，
            // 无自定义头像时用站点配置的 DEFAULT_GRAVATAR_TYPE 兜底）
            const emailMd5 = email ? createHash("md5").update(email.trim().toLowerCase()).digest("hex") : "";
            const customAvatar = info.avatar ? resolveAssetUrl(info.avatar) : null;
            user = {
                id: info.id || "",
                username: info.username || "",
                nickname: info.nickname || "",
                email,
                website: info.website || "",
                avatar: resolveCommentAvatar({ avatar_url: customAvatar, email_md5: emailMd5 }, gravatar),
                joinedText: formatJoinDate(info.created_at),
                isAdmin: isAdminUser(info),
            };
        } catch {
            // token 失效 / 用户不存在：按未登录处理（页面显示「请先登录」）
            user = null;
        }
    }

    return <UserCenterContent user={user} />;
}
