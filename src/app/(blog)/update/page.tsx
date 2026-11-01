import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";

import frontendReleases from "@/data/frontend-changelog.json";
import { ChangelogTabs } from "@/components/(blog)/changelog-tabs";
import { ChangelogTimeline, type ChangelogListItem } from "@/components/(blog)/changelog-timeline";
import { PageBanner } from "@/components/(blog)/page-banner";

import { getChangelogEntries, getInstalledVersion } from "@/lib/changelog";
import { generateBlogMetadata } from "@/lib/seo";

/** 更新日志来自官方 changelog 接口：整页缓存一小时，和接口那边的缓存口径一致 */
export const revalidate = 3600;

const GITHUB_RELEASES_URL = "https://github.com/anzhiyu-c/anheyu-app/releases";
const FRONTEND_REPO_URL = "https://github.com/ciraos/blogv2";

/** 前端发版记录的结构（由 scripts/gen-frontend-changelog.mjs 从 git tag 生成后提交） */
interface FrontendRelease {
    version: string;
    date: string;
    title: string;
    body: string;
    url: string;
}

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("更新日志");
}

/**
 * 更新日志页：两个 tab —— 后端 anheyu-app / 前端 ciraos/blogv2。
 *
 * - 后端：官方官网的 changelog 聚合接口（见 lib/changelog.ts），公开只读，服务端直连；
 * - 前端：本仓库是私有仓库，GitHub API 拿不到 Release，所以由本地 git tag 生成
 *   src/data/frontend-changelog.json 并随版本提交（每次发版重跑一次生成脚本）。
 * 两个 tab 的条目最后都归一成 ChangelogListItem，共用同一个时间线组件。
 */
export default async function Update() {
    const [backendEntries, installedVersion] = await Promise.all([getChangelogEntries(), getInstalledVersion()]);

    const backendItems: ChangelogListItem[] = (backendEntries ?? []).map((entry) => ({
        id: `backend-${entry.id}`,
        version: entry.tagName,
        date: entry.publishedAt,
        badge: entry.isLatest ? "最新" : null,
        href: entry.htmlUrl,
        body: entry.body,
    }));

    const frontendItems: ChangelogListItem[] = (frontendReleases as FrontendRelease[]).map((release, index) => ({
        id: `frontend-${release.version}`,
        version: release.version,
        date: release.date,
        // 数组按版本倒序生成，第一条即最新
        badge: index === 0 ? "最新" : null,
        href: release.url,
        // 标题单独一行（加粗），正文接在后面
        body: release.title ? `**${release.title}**\n\n${release.body}` : release.body,
    }));

    const backendPanel =
        backendItems.length > 0 ? (
            <ChangelogTimeline entries={backendItems} />
        ) : (
            <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
                <p>暂时无法获取后端更新日志。</p>
                <a
                    href={GITHUB_RELEASES_URL}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="mt-2 inline-flex items-center gap-1 text-primary hover:underline"
                >
                    去 GitHub Releases 查看
                    <ExternalLink className="size-3.5" aria-hidden />
                </a>
            </div>
        );

    const frontendPanel =
        frontendItems.length > 0 ? (
            <ChangelogTimeline entries={frontendItems} />
        ) : (
            <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
                暂无前端发版记录。
            </div>
        );

    return (
        <div className="w-full space-y-6">
            <PageBanner tip="更新日志" title="更新日志" description="每一次更新，都是一次成长" />

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {installedVersion && (
                    <span>
                        当前后端版本：<span className="font-medium text-foreground">{installedVersion}</span>
                    </span>
                )}
                <span>
                    前端版本：<span className="font-medium text-foreground">{frontendItems[0]?.version ?? "—"}</span>
                </span>
            </div>

            <ChangelogTabs
                tabs={[
                    { id: "backend", label: "后端 anheyu-app", count: backendItems.length, content: backendPanel },
                    { id: "frontend", label: "前端 ciraos/blogv2", count: frontendItems.length, content: frontendPanel },
                ]}
            />

            {/* 底部：两个仓库的完整历史入口（接口只取最近 10 条） */}
            <div className="flex flex-wrap justify-center gap-2 pt-2">
                <a
                    href={GITHUB_RELEASES_URL}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-1.5 rounded-full bg-muted px-4 py-2 text-xs font-medium text-foreground/80 transition-colors hover:bg-primary/12 hover:text-primary"
                >
                    后端完整更新历史
                    <ExternalLink className="size-3.5" aria-hidden />
                </a>
                <a
                    href={FRONTEND_REPO_URL}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-1.5 rounded-full bg-muted px-4 py-2 text-xs font-medium text-foreground/80 transition-colors hover:bg-primary/12 hover:text-primary"
                >
                    前端仓库
                    <ExternalLink className="size-3.5" aria-hidden />
                </a>
            </div>
        </div>
    );
}
