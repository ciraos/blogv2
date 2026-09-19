import type { Metadata } from "next";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";

import { UserCenterContent, type UserCenterUser } from "@/components/(blog)/user-center-content";
import { getUserInfoApi } from "@/lib/api";
import { isAdminUser } from "@/lib/auth";
import { generateBlogMetadata } from "@/lib/seo";
import { resolveAssetUrl } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("用户中心");
}

const GRAVATAR_URL = process.env.NEXT_PUBLIC_GRAVATAR_URL || "https://cravatar.cn/";

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

    let user: UserCenterUser | null = null;

    if (token) {
        try {
            const info = await getUserInfoApi(token);
            const email = info.email || "";
            // 头像：后端自定义头像优先，否则按邮箱 MD5 走 Cravatar（与评论区头像口径一致）
            const emailMd5 = email ? createHash("md5").update(email.trim().toLowerCase()).digest("hex") : "";
            const customAvatar = info.avatar ? resolveAssetUrl(info.avatar) : null;
            user = {
                id: info.id || "",
                username: info.username || "",
                nickname: info.nickname || "",
                email,
                website: info.website || "",
                avatar: customAvatar || (emailMd5 ? `${GRAVATAR_URL}avatar/${emailMd5}?d=mp` : null),
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
