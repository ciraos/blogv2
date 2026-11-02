import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";

import { PageWithSidebar } from "@/components/(blog)/page-with-sidebar";
import { QaQuestions } from "@/components/(blog)/qa-questions";
import { API_URL } from "@/lib/api";
import { generateBlogMetadata } from "@/lib/seo";
import { isProEdition } from "@/lib/edition";

// 页面要读登录 cookie，本来就是动态渲染；显式声明避免被误当作可静态化（构建时也少一次探测）。
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
    // 与官方前台 /questions 的标题一致（线上 HTML 的 <title> 为「社区问答 | …」）
    return generateBlogMetadata("社区问答");
}

/**
 * 服务端先读一次开关（GET /pro/community-qa/config，公开接口，只读）。
 *
 * 为什么不由客户端首屏读：开关为 false 时整页要显示「社区问答尚未启用」，
 * 客户端读会出现「先闪一下搜索框与表单、再变成空态」。读不到就返回 null（交给客户端再确认一次）。
 * 这里读的路径与线上前端 chunk 的 communityQAApi.config() 完全一致（同一个后端键）。
 */
async function readQaEnabled(): Promise<boolean | null> {
    try {
        const res = await fetch(`${API_URL}/pro/community-qa/config`, {
            headers: { Accept: "application/json" },
            cache: "no-store",
        });
        if (!res.ok) return null;
        const json = (await res.json()) as { data?: { enabled?: unknown } };
        return typeof json?.data?.enabled === "boolean" ? json.data.enabled : null;
    } catch {
        return null;
    }
}

/**
 * 社区问答（前台 /questions）。
 *
 * 数据来源：我们自己的同源代理 /api/public/community-qa/*（见 src/app/api/public/community-qa/），
 * 它转发远端的 /api/pro/community-qa/*（路径逐字来自线上前台 chunk 模块 343577）。
 * 登录态由服务端 cookie 判断后下传：未登录不显示「我的提问」与提问表单，改为明确的登录引导。
 */
export default async function QuestionsPage() {
    // PRO 专属页面：社区版后端没有对应接口（/public/essays 等），直接按 404 处理
    if (!(await isProEdition())) notFound();

    const [enabled, cookieStore] = await Promise.all([readQaEnabled(), cookies()]);
    const isLoggedIn = Boolean(cookieStore.get("token")?.value);

    return (
        <PageWithSidebar>
            <QaQuestions isLoggedIn={isLoggedIn} initialEnabled={enabled} />
        </PageWithSidebar>
    );
}
