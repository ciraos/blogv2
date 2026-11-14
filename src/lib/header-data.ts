import type { ComponentProps } from "react";
import { cookies } from "next/headers";

import type Header from "@/components/header";
import { getUserInfoApi } from "@/lib/api";
import { getAllPublicArticlesCached, getPublicArchivesCached } from "@/lib/public-content-cache";
import { collectTags } from "@/lib/articles";
import { ACCESS_TOKEN_KEY, isAdminUser } from "@/lib/auth";
import type { SiteConfig } from "@/types/site-config";

type HeaderProps = ComponentProps<typeof Header>;

/**
 * 站点 Header 需要的全部数据。
 *
 * (blog) 与 music 两个 layout 都要渲染这个 Header，所以把取数逻辑抽在这里，避免复制。
 * `authExpired` 不属于 Header 的 props，单独返回（供 AuthExpiredNotifier 用）。
 *
 * 注意：其中 mobileTags（移动端汉堡菜单的标签云）与 siteCreatedAt（建站天数）分别需要
 * 「全部文章」和「归档」两个较重的请求，但它们只服务于移动端菜单。
 */
export async function getHeaderData(
    config?: SiteConfig
): Promise<{ header: HeaderProps; authExpired: boolean }> {
    // httpOnly token 只能服务端读取，用来判断登录态
    const cookieStore = await cookies();
    const token = cookieStore.get(ACCESS_TOKEN_KEY)?.value;
    const isLoggedIn = !!token;

    // 已登录时取用户信息（头像/昵称/是否管理员）；token 过期（401）标记 authExpired
    let userAvatar: string | null = null;
    let userName: string | null = null;
    let isAdmin = false;
    let authExpired = false;
    if (token) {
        try {
            const userInfo = await getUserInfoApi(token);
            userAvatar = userInfo.avatar || null;
            userName = userInfo.nickname || userInfo.username || null;
            // 管理员判据（用户组 1）：决定用户菜单里是否显示后台 / 发布入口
            isAdmin = isAdminUser(userInfo);
        } catch (error) {
            // 注：不依赖 instanceof ApiError（RSC/浏览器边界类引用可能缺失），直接读 status
            const status = (error as { status?: number } | null)?.status ?? 0;
            if (status === 401) {
                authExpired = true;
            } else {
                console.error("获取用户信息失败", error);
            }
        }
    }

    // 移动端汉堡菜单：标签云（取全部文章聚合，前 12 个）
    let mobileTags: HeaderProps["mobileTags"] = [];
    try {
        const articles = await getAllPublicArticlesCached();
        mobileTags = collectTags(articles).slice(0, 12);
    } catch (error) {
        console.error("获取标签失败", error);
    }

    // 移动端汉堡菜单：网站信息（与侧边栏一致：文章数 / 字数 / 建站天数）
    let siteCreatedAt: string | undefined;
    try {
        const archive = await getPublicArchivesCached();
        const list = archive.list ?? [];
        if (list.length > 0) {
            const first = list[list.length - 1]; // 接口按时间倒序，最后一条最早
            siteCreatedAt = `${first.year}-${String(first.month).padStart(2, "0")}-01T00:00:00Z`;
        }
    } catch (error) {
        console.error("获取归档失败", error);
    }

    return {
        header: {
            menu: config?.header?.menu ?? [],
            appName: config?.APP_NAME ?? "博客",
            isLoggedIn,
            userpanel: config?.userpanel,
            userAvatar,
            userName,
            isAdmin,
            mobileTags,
            siteinfo: config?.sidebar?.siteinfo,
            siteCreatedAt,
            oneImage: config?.page?.one_image,
            // 页头附加项：显示时钟（header.nav.clock）
            showClock: config?.header?.nav?.clock === true,
            // 页头附加项：显示开往 travelling 入口（header.nav.travelling）
            showTravelling: config?.header?.nav?.travelling === true,
        },
        authExpired,
    };
}
