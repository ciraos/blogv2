import fallbackReleases from "@/data/frontend-changelog.json";

/**
 * 前端（ciraos/blogv2）自己的更新日志。
 *
 * 仓库已开源，所以数据全部从 GitHub 取，**不再依赖本地 git**：
 *   1. 优先 GitHub Releases：GET /repos/ciraos/blogv2/releases
 *   2. 没有发 Release 时退到 Tags：GET /repos/ciraos/blogv2/tags，
 *      再逐个取 tag 指向的提交（GET /repos/ciraos/blogv2/commits/{sha}）拿提交说明当更新内容
 *      —— 这等价于以前脚本里 `git tag` + `git log -1` 做的事，只是换成了走 API
 *   3. 都拿不到（断网 / 限流）时回退到仓库内的 src/data/frontend-changelog.json 快照
 *
 * 未鉴权的 GitHub API 限流是 60 次/小时/IP；这里按 1 小时缓存（与页面 revalidate 一致），
 * 单实例一小时最多 1 次 releases + 1 次 tags + N 次 commits（N ≤ 10），足够。
 */

const REPO = "ciraos/blogv2";
const API = `https://api.github.com/repos/${REPO}`;
const PER_PAGE = 10;

export interface FrontendRelease {
    version: string;
    date: string;
    title: string;
    body: string;
    url: string;
}

interface GithubRelease {
    tag_name?: string;
    name?: string | null;
    body?: string | null;
    published_at?: string | null;
    created_at?: string | null;
    html_url?: string;
    draft?: boolean;
}

interface GithubTag {
    name?: string;
    commit?: { sha?: string };
}

interface GithubCommit {
    commit?: {
        message?: string;
        committer?: { date?: string };
        author?: { date?: string };
    };
}

const FETCH_OPTS = {
    headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    },
} as const;

async function getJson<T>(path: string): Promise<T | null> {
    try {
        const res = await fetch(`${API}${path}`, {
            // 与页面的 revalidate 对齐：一小时一次
            next: { revalidate: 3600 },
            ...FETCH_OPTS,
        });
        if (!res.ok) return null;
        return (await res.json()) as T;
    } catch {
        return null;
    }
}

/**
 * Release / 提交说明里的【小节标题】转成 Markdown 二级标题。
 * 早期发版说明是用这个格式写的，转成 `## 小节` 后由时间线组件渲染成小标题。
 */
function normalizeBody(markdown: string): string {
    return markdown.replace(/^\s*【(.+?)】\s*$/gm, "## $1").trim();
}

/** 提交/Release 说明的第一行常写成「chore(release): v1.4.0 —— 摘要」，取出摘要当标题 */
function titleFromBody(text: string): string {
    const firstLine = text.split("\n").find((line) => line.trim() !== "") ?? "";
    const plainFirst = firstLine.replace(/^#+\s*/, "").trim();
    return plainFirst.includes("——") ? plainFirst.split("——").slice(1).join("——").trim() : "";
}

/** 1) GitHub Releases */
async function fromReleases(): Promise<FrontendRelease[]> {
    const list = await getJson<GithubRelease[]>(`/releases?per_page=${PER_PAGE}`);
    if (!Array.isArray(list) || list.length === 0) return [];
    return list
        .filter((release) => release && release.draft !== true && typeof release.tag_name === "string")
        .map((release) => {
            const body = normalizeBody(release.body ?? "");
            return {
                version: release.tag_name ?? "",
                date: release.published_at ?? release.created_at ?? "",
                title: (release.name ?? "").trim() || titleFromBody(body),
                body,
                url: release.html_url ?? `https://github.com/${REPO}/releases/tag/${release.tag_name}`,
            };
        });
}

/** 2) Tags + 各自指向的提交说明（等价于 `git tag` + `git log -1`） */
async function fromTags(): Promise<FrontendRelease[]> {
    const tags = await getJson<GithubTag[]>(`/tags?per_page=${PER_PAGE}`);
    if (!Array.isArray(tags) || tags.length === 0) return [];

    const releases = await Promise.all(
        tags
            .filter((tag) => tag?.name && tag.commit?.sha)
            .map(async (tag) => {
                const sha = tag.commit!.sha!;
                const commit = await getJson<GithubCommit>(`/commits/${sha}`);
                const message = commit?.commit?.message ?? "";
                const date = commit?.commit?.committer?.date ?? commit?.commit?.author?.date ?? "";
                const [firstLine, ...rest] = message.split("\n");
                return {
                    version: tag.name!,
                    date,
                    title: titleFromBody(firstLine ?? ""),
                    body: normalizeBody(rest.join("\n")),
                    url: `https://github.com/${REPO}/releases/tag/${tag.name}`,
                } satisfies FrontendRelease;
            })
    );
    return releases.filter((item) => item.version);
}

/** 前端发版记录：Releases → Tags → 仓库内 JSON 快照 */
export async function getFrontendReleases(): Promise<FrontendRelease[]> {
    const releases = await fromReleases();
    if (releases.length > 0) return releases;

    const fromTagList = await fromTags();
    if (fromTagList.length > 0) return fromTagList;

    return (fallbackReleases as FrontendRelease[]).map((release) => ({ ...release }));
}
