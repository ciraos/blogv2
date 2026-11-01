import { API_URL } from "@/lib/api";

/**
 * 版本更新日志的数据源：官方官网的 changelog 接口（官方前端 /update 页用的就是它）。
 *
 *   GET https://anheyuofficialwebsiteapi.anheyu.com/api/v1/changelog?page=1&limit=10&detail=true&prerelease=false&draft=false
 *   → { code, message, data: { list: [{ id, tagName, name, body, publishedAt, htmlUrl, isLatest }], total } }
 *
 * 为什么直接打这个接口、而不是自己维护一份更新日志：
 *   - 更新内容来自 anheyu-app 的 GitHub Release，官方网站做了聚合与解析，我们照着官方页面展示即可；
 *   - 它是**公开只读**接口，服务端直连没有 CORS 问题；
 *   - 后端站点配置里没有任何 update 页相关的键（查过 configdef），所以页面文案与数据都只能来自这里/写死。
 */

const CHANGELOG_API = "https://anheyuofficialwebsiteapi.anheyu.com/api/v1/changelog";
/** 与官方页面一致：一次取 10 条 */
const CHANGELOG_LIMIT = 10;

export interface ChangelogEntry {
    id: number;
    /** 版本号，如 v1.9.1 */
    tagName: string;
    /** Release 标题，如 Anheyu App v1.9.1 */
    name: string;
    /** 更新内容（Markdown） */
    body: string;
    publishedAt: string;
    /** GitHub Release 页面 */
    htmlUrl: string;
    /** 官方标记的最新版（用于「最新」徽标） */
    isLatest: boolean;
}

interface ChangelogResponse {
    code: number;
    message: string;
    data: { list: ChangelogEntry[]; total: number };
}

/** 拉取更新日志；网络失败 / 结构异常一律返回 null（页面显示降级提示，不整页 500） */
export async function getChangelogEntries(limit = CHANGELOG_LIMIT): Promise<ChangelogEntry[] | null> {
    const url = `${CHANGELOG_API}?page=1&limit=${limit}&detail=true&prerelease=false&draft=false`;
    try {
        const res = await fetch(url, {
            // 更新日志不是实时数据：缓存一小时，避免每次访问都打官方接口
            next: { revalidate: 3600 },
            headers: { Accept: "application/json" },
        });
        if (!res.ok) return null;
        const json = (await res.json()) as ChangelogResponse;
        const list = json?.data?.list;
        if (!Array.isArray(list)) return null;
        return list
            .filter((item) => item && typeof item.tagName === "string")
            .map((item) => ({
                id: item.id,
                tagName: item.tagName,
                name: item.name ?? item.tagName,
                body: item.body ?? "",
                publishedAt: item.publishedAt ?? "",
                htmlUrl: item.htmlUrl ?? "",
                isLatest: Boolean(item.isLatest),
            }));
    } catch {
        return null;
    }
}

/** 当前安装的后端版本（GET /pro/version，公开）：取不到返回 null */
export async function getInstalledVersion(): Promise<string | null> {
    if (!API_URL) return null;
    try {
        const res = await fetch(`${API_URL}/pro/version`, {
            next: { revalidate: 600 },
            headers: { Accept: "application/json" },
        });
        if (!res.ok) return null;
        const json = (await res.json()) as { data?: { version?: string; community_version?: string } };
        return json?.data?.version ?? json?.data?.community_version ?? null;
    } catch {
        return null;
    }
}
