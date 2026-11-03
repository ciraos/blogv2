import type { Metadata } from "next";

import { AboutEquipmentMini, AboutSiteMap, AboutStatsGrid, AboutTimeline, type TimelineItem } from "@/components/(blog)/about-sections";
import { AboutNowBar } from "@/components/(blog)/about-now-bar";

import { getLatestCommentsApi, getPublicArticlesApi, getPublicEssaysApi } from "@/lib/api";
import { getMusicPlaylist } from "@/lib/music";
import { getSiteConfigs, requireSiteConfigs } from "@/lib/site-config";
import { generateBlogMetadata } from "@/lib/seo";
import { resolveAssetUrl } from "@/lib/utils";
import type { PostListData } from "@/types/articles";
import type { CommentListData } from "@/lib/api";
import type { EssayListData } from "@/types/essays";

export const dynamic = "force-dynamic";

// 各块取数失败时的空列表兜底（必须带齐 page / pageSize 等字段，否则类型不成立）
const EMPTY_POSTS: PostListData = { list: [], total: 0, page: 1, pageSize: 1 };
const EMPTY_ESSAYS: EssayListData = { list: [], total: 0, page: 1, page_size: 1 };
const EMPTY_COMMENTS: CommentListData = { list: [], total: 0, page: 1, pageSize: 1, total_with_children: 0 };

export async function generateMetadata(): Promise<Metadata> {
    const config = await getSiteConfigs();
    const name = config?.about?.page?.name || "";
    const description = config?.about?.page?.description || "关于本站";
    return {
        ...(await generateBlogMetadata("关于")),
        description: name ? `关于 ${name} - ${description}` : description,
    };
}

/** 取某个 Promise 的结果，失败时给兜底值（关于页任何一块挂了都不影响其它块） */
async function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
    try {
        return await promise;
    } catch {
        return fallback;
    }
}

/**
 * 建站天数。
 *
 * ⚠️ footer.owner.since 在后端**不是时间戳**：线上实测值是 `2026`（年份）。
 * 所以按「年份 → 该年 1 月 1 日」理解；如果将来后端改成年月日字符串或秒级时间戳，
 * 这里也能吃（字符串交给 Date 解析，10 位数字按秒处理）。
 * 抽成模块级函数：在组件 render 里直接调 Date.now() 会被 react-hooks/purity 判为不纯。
 */
function daysSince(since: number | string): number {
    let startMs: number;
    if (typeof since === "string") {
        const parsed = Date.parse(since);
        startMs = Number.isNaN(parsed) ? Date.now() : parsed;
    } else if (since > 1e12) {
        startMs = since; // 毫秒时间戳
    } else if (since > 1e9) {
        startMs = since * 1000; // 秒时间戳
    } else {
        startMs = new Date(since, 0, 1).getTime(); // 年份，如 2026
    }
    return Math.max(1, Math.floor((Date.now() - startMs) / 86400000));
}

/** yyyy.MM.dd */
function formatDay(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

/** 把轻量 Markdown 的标记去掉，用于时间轴里的纯文本摘要 */
function plainText(text: string): string {
    return (text ?? "")
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/\*\*|~~|`/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

// ===================== 页面主体 =====================

export default async function About() {
    const config = await requireSiteConfigs();
    const page = config.about.page;
    const enable = page.enable;
    const avatar = resolveAssetUrl(config.USER_AVATAR || page.avatar_img);

    // 建站天数：footer.owner.since 是秒级时间戳
    const since = config.footer?.owner?.since;
    const days = since ? daysSince(since) : null;

    // 数据全部并行取；任何一块失败只影响自己（兜底值必须是完整的列表结构，见 types 里的 PostListData / EssayListData）
    const [articles, essays, comments, songs] = await Promise.all([
        safe(getPublicArticlesApi({ page: 1, pageSize: 1 }), EMPTY_POSTS),
        safe(getPublicEssaysApi({ page: 1, page_size: 1 }), EMPTY_ESSAYS),
        safe(getLatestCommentsApi({ page: 1, pageSize: 1 }), EMPTY_COMMENTS),
        safe(getMusicPlaylist(config?.music?.player?.custom_playlist), []),
    ]);

    // 最近动态：最近 3 篇文章 + 3 条说说，按时间混排
    const [recentPosts, recentEssays] = await Promise.all([
        safe(getPublicArticlesApi({ page: 1, pageSize: 3 }), EMPTY_POSTS),
        safe(getPublicEssaysApi({ page: 1, page_size: 3 }), EMPTY_ESSAYS),
    ]);

    const timeline: TimelineItem[] = [
        ...(recentPosts.list ?? []).map((post) => ({
            key: `post-${post.id}`,
            kind: "post" as const,
            date: formatDay(post.created_at),
            title: post.title,
            // summaries 是 string[]（后端每段一个元素），取第一段当摘要
            excerpt: plainText(Array.isArray(post.summaries) ? (post.summaries[0] ?? "") : "").slice(0, 90),
            href: `/posts/${post.id}`,
        })),
        ...(recentEssays.list ?? []).map((essay) => {
            // 说说可能带轻量 Markdown：标题取第一行，摘要取「除第一行之外的正文」，避免两行说同一句话
            const lines = essay.content.split("\n");
            const title = plainText(lines[0] ?? "").slice(0, 40) || "一条说说";
            const rest = plainText(lines.slice(1).join(" "));
            return {
                key: `essay-${essay.id}`,
                kind: "essay" as const,
                date: formatDay(essay.created_at),
                title,
                excerpt: rest.slice(0, 90),
                href: "/essay",
            };
        }),
    ]
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 5);

    // 装备：取第一组的 4 件
    const equipmentGroup = config.equipment?.list?.[0];
    const equipmentItems = (equipmentGroup?.equipment_list ?? []).slice(0, 4).map((item) => ({
        name: item.name,
        description: item.description ?? "",
        image: item.image ? (resolveAssetUrl(item.image) ?? "") : "",
    }));

    const stats = [
        { label: "文章", value: articles.total ?? 0, unit: "篇", note: "慢慢写，不着急" },
        { label: "说说", value: essays.total ?? 0, unit: "条", note: "想到就发" },
        { label: "评论", value: comments.total ?? 0, unit: "条", note: "谢谢你们不嫌弃" },
        { label: "歌曲", value: songs.length, unit: "首", note: "够听一整天" },
    ];

    return (
        <div className="space-y-8">
            {/* ===== 作者头像框（头像 + 两侧技能标签） ===== */}
            {enable.author_box && (
                <div className="flex items-center justify-center">
                    <div className="hidden flex-col items-end md:flex">
                        {(page.avatar_skills_left || []).map((skill, i) => {
                            const n = page.avatar_skills_left?.length ?? 1;
                            // 弧形环绕：首尾贴齐，中间两颗略外推
                            const push = i === 0 || i === n - 1 ? 0 : 12;
                            return (
                                <span key={i} className="about-tag" style={{ marginRight: push }}>
                                    {skill}
                                </span>
                            );
                        })}
                    </div>

                    {avatar && (
                        <div className="avatar-wrap mx-3 md:mx-4">
                            <div className="avatar-img">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={avatar} alt="avatar" />
                            </div>
                            <span className="avatar-online" aria-hidden="true" />
                        </div>
                    )}

                    <div className="hidden flex-col items-start md:flex">
                        {(page.avatar_skills_right || []).map((skill, i) => {
                            const n = page.avatar_skills_right?.length ?? 1;
                            const push = i === 0 || i === n - 1 ? 0 : 12;
                            return (
                                <span key={i} className="about-tag" style={{ marginLeft: push }}>
                                    {skill}
                                </span>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ===== 此刻：正在听 + 站点小计 ===== */}
            <AboutNowBar songs={songs.length} articles={articles.total ?? 0} essays={essays.total ?? 0} days={days} />

            {/* ===== 数据一览 ===== */}
            <section className="space-y-3">
                <h2 className="text-sm font-semibold text-foreground">这个站有一点东西</h2>
                <AboutStatsGrid stats={stats} />
            </section>

            {/* ===== 本站地图 ===== */}
            <section className="space-y-3">
                <h2 className="text-sm font-semibold text-foreground">去哪儿逛</h2>
                <AboutSiteMap />
            </section>

            {/* ===== 最近动态 ===== */}
            {timeline.length > 0 && (
                <section className="space-y-3">
                    <h2 className="text-sm font-semibold text-foreground">最近在干嘛</h2>
                    <AboutTimeline items={timeline} />
                </section>
            )}

            {/* ===== 装备 ===== */}
            {equipmentItems.length > 0 && (
                <section className="space-y-3">
                    <h2 className="text-sm font-semibold text-foreground">吃饭的家伙</h2>
                    <AboutEquipmentMini items={equipmentItems} groupTitle={equipmentGroup?.description} />
                </section>
            )}
        </div>
    );
}
