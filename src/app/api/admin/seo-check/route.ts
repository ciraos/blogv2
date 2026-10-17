import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getSiteConfigs } from "@/lib/site-config";
// 类型放页面目录：客户端组件也要用同一份形状，但不能 import route.ts（会把服务端模块拖进客户端包）
import type {
    FeedProbe,
    PageMetaField,
    PageMetaSample,
    RobotsDirective,
    RobotsInfo,
    SeoCheck,
    SeoCheckResult,
} from "@/app/admin/seo-push/types";
import { ACCESS_TOKEN_KEY } from "@/lib/auth";

/* =============================================================================
 * SEO 本地检查 · 同源代理（只读）
 *
 * 为什么有这个路由：
 *  本部署的后端【没有】任何 SEO 推送 / 提交接口（9 条候选路径全 404，源码侧只有
 *  sitemap / robots / RSS）。所以「SEO 推送」页不做假列表，改为「本地体检」：
 *  由服务端去抓本站的真实资源与页面，解析后给出可核对的结论。
 *
 * 安全边界（重要）：
 *  1. 目标 origin **只能**来自服务端环境变量 NEXT_PUBLIC_SITE_URL，或站点配置里的
 *     SITE_URL；路径只能是下方固定白名单（探针路径 + sitemap 里解析出来的同源路径）。
 *     浏览器无法传入任意 URL —— 从设计上杜绝 SSRF（本路由需要管理员登录才可用）。
 *  2. 全部是 GET 只读请求，不调用任何写接口（尤其是 /settings/update 一律不碰）。
 *
 * 与 lib/api.ts 的 request() 不同：这里必须拿到【原始响应头与正文片段】
 * （状态码 / Content-Type / robots.txt 原文），所以直接用 fetch，不走 JSON 包装。
 * ========================================================================== */

/** 探针：站点地图与爬虫协议（固定路径） */
const PROBE_PATHS = ["/sitemap.xml", "/robots.txt"] as const;

/** 探针：订阅源候选（Next 只实现了 rss.xml，其余是部署层别名，逐个探测而不是想当然） */
const FEED_PATHS = ["/rss.xml", "/feed.xml", "/atom.xml"] as const;

/** 单次请求超时（毫秒）：体检是一次性动作，宁可给结论「超时」也不要页面挂住 */
const FETCH_TIMEOUT_MS = 12_000;

/**
 * 正文读取上限（字节）。
 * 为什么要 2MB：Next 的 App Router 在**流式渲染**下会把 metadata 推到很后面 ——
 * 实测文章页的 </head> 在 5.7KB 处就闭合了，而真正的 <title>/description/canonical/og:*
 * 在约 240KB 处才出现（首页较早，文章页最晚）。早期版本按 256KB 截断 + 读到 </head> 就停，
 * 两种做法都会把文章页的 meta 切掉，导致「文章页 meta 抽查」被误判为缺失。
 * 所以：不按 </head> 提前停，改为读完整个响应（上限 2MB 兜底，避免异常大响应拖垮内存）。
 */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

/** 证据片段展示上限（字符） */
const EVIDENCE_MAX = 400;

/** sitemap 里最多解析多少条 URL（同时决定最多抽查几个页面，避免一次体检打太多请求） */
const MAX_SITEMAP_URLS = 200;

/** 页面元信息抽查上限（首页 + 少量文章页/静态页） */
const MAX_PAGE_SAMPLES = 4;

// ===================== 基础工具 =====================

function truncate(text: string, max = EVIDENCE_MAX): string {
    const flat = text.replace(/\s+/g, " ").trim();
    return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function decodeEntities(text: string): string {
    return text
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&");
}

/** 归一化 origin：只要协议 + 主机 + 端口，去掉尾部斜杠与任何自带的路径 */
function normalizeOrigin(raw: string): string {
    try {
        return new URL(raw).origin;
    } catch {
        return "";
    }
}

/**
 * 按字节上限读取响应正文。
 * 为什么手动读流而不用 res.text()：异常大的响应会把整份正文读进内存，
 * 这里读满上限就主动 cancel 掉剩余流（robots/sitemap/feed 都很小，正常都会读完）。
 */
async function readBodyLimited(res: Response): Promise<string> {
    const reader = res.body?.getReader();
    if (!reader) return "";
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
                chunks.push(value);
                size += value.byteLength;
                if (size >= MAX_BODY_BYTES) break;
            }
        }
    } catch {
        // 读流中断：返回已经拿到的部分（够解析 robots / 判断 meta 了）
    } finally {
        await reader.cancel().catch(() => undefined);
    }
    return new TextDecoder("utf-8").decode(concatChunks(chunks, size));
}

/** 合并分块（避免每块都重新分配大数组） */
function concatChunks(chunks: Uint8Array[], size: number): Uint8Array {
    if (chunks.length === 1 && chunks[0].byteLength === size) return chunks[0];
    const merged = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return merged;
}

interface FetchOutcome {
    status: number | null;
    contentType: string;
    body: string;
    error?: string;
}

/** 只允许「origin + 白名单路径」的 GET 探测；timeout 用 AbortSignal.timeout（Node 18+ 原生） */
async function probe(origin: string, path: string): Promise<FetchOutcome> {
    const url = `${origin}${path}`;
    try {
        const res = await fetch(url, {
            method: "GET",
            cache: "no-store",
            redirect: "follow",
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            headers: {
                // 有些站点/网关会对空 UA 直接拒绝，这里明确表明身份（只读体检）
                "User-Agent": "blogv2-admin-seo-check/1.0 (+local self-check)",
                Accept: "text/html,application/xhtml+xml,application/xml,text/plain,*/*",
            },
        });
        const body = await readBodyLimited(res);
        return {
            status: res.status,
            contentType: res.headers.get("content-type") ?? "",
            body,
        };
    } catch (error) {
        const reason =
            error instanceof Error && error.name === "TimeoutError"
                ? `请求超时（>${FETCH_TIMEOUT_MS / 1000}s）`
                : error instanceof Error
                  ? error.message
                  : "请求失败";
        return { status: null, contentType: "", body: "", error: reason };
    }
}

// ===================== robots.txt 解析 =====================

/** 解析 robots.txt：按 User-agent 分组收集 allow/disallow 与 Sitemap 声明 */
function parseRobots(text: string, url: string, ok: boolean): RobotsInfo {
    const directives: RobotsDirective[] = [];
    const sitemaps: string[] = [];
    let currentAgents: string[] = [];
    let lastLineWasAgent = false;

    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.replace(/#.*$/, "").trim();
        if (!line) continue;
        const idx = line.indexOf(":");
        if (idx < 0) continue;
        const field = line.slice(0, idx).trim().toLowerCase();
        const value = line.slice(idx + 1).trim();

        if (field === "user-agent") {
            // 连续的 User-agent 行属于同一个分组；一旦插入过规则就开新分组
            if (!lastLineWasAgent) currentAgents = [];
            currentAgents.push(value || "*");
            lastLineWasAgent = true;
            continue;
        }

        lastLineWasAgent = false;
        if (field === "sitemap") {
            if (value) sitemaps.push(value);
            continue;
        }
        if (field === "allow" || field === "disallow") {
            if (!value) continue; // "Disallow:" 空值表示不禁止，跳过
            const agents = currentAgents.length > 0 ? currentAgents : ["*"];
            for (const agent of agents) {
                directives.push({ agent, type: field, path: value });
            }
        }
    }

    // 通配分组是否整站禁止：Disallow: /（精确是根路径，而不是 /admin/ 之类的前缀）
    const blanketDisallow = directives.some(
        (d) => d.agent === "*" && d.type === "disallow" && d.path.replace(/\/+$/, "") === "",
    );

    // 除 /admin（后台本来就不该被收录）之外的 Disallow：只做提示，不判失败
    const suspiciousDisallows = directives
        .filter((d) => d.type === "disallow")
        .filter((d) => !d.path.startsWith("/admin"))
        .map((d) => `${d.agent === "*" ? "*" : d.agent} → ${d.path}`);

    return {
        url,
        ok,
        text: truncate(text, 1200),
        directives,
        sitemaps,
        blanketDisallow,
        suspiciousDisallows: [...new Set(suspiciousDisallows)],
    };
}

// ===================== sitemap.xml 解析 =====================

/** 抓出 sitemap 里的 <loc>；同时只保留与站点同源的 URL（跨域条目只计数不探测） */
function parseSitemap(
    body: string,
    sitemapUrl: string,
    origin: string,
): { urls: string[]; sameOriginPaths: string[] } {
    const urls: string[] = [];
    const sameOriginPaths: string[] = [];
    // sitemap 就是 XML，<loc> 不会有嵌套；用非贪婪匹配即可（不引第三方 XML 库）
    const re = /<loc>\s*([\s\S]*?)\s*<\/loc>/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(body)) !== null) {
        const loc = decodeEntities(match[1]).trim();
        if (!loc) continue;
        urls.push(loc);
        try {
            const parsed = new URL(loc, sitemapUrl);
            if (parsed.origin === origin && !sameOriginPaths.includes(parsed.pathname)) {
                sameOriginPaths.push(parsed.pathname);
            }
        } catch {
            // 非法 URL：忽略（不计入同源待抽查列表）
        }
        if (urls.length >= MAX_SITEMAP_URLS) break;
    }
    return { urls, sameOriginPaths };
}

// ===================== 页面 meta 解析 =====================

/** 读 meta 的 content：兼容 name/property 在前或在后两种写法 */
function metaContent(head: string, attr: "name" | "property", value: string): string {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
        new RegExp(`<meta[^>]*\\b${attr}\\s*=\\s*["']${escaped}["'][^>]*\\bcontent\\s*=\\s*["']([^"']*)["'][^>]*>`, "i"),
        new RegExp(`<meta[^>]*\\bcontent\\s*=\\s*["']([^"']*)["'][^>]*\\b${attr}\\s*=\\s*["']${escaped}["'][^>]*>`, "i"),
    ];
    for (const pattern of patterns) {
        const hit = pattern.exec(head);
        if (hit) return decodeEntities(hit[1]).trim();
    }
    return "";
}

function linkHref(head: string, rel: string): string {
    const escaped = rel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
        new RegExp(`<link[^>]*\\brel\\s*=\\s*["']${escaped}["'][^>]*\\bhref\\s*=\\s*["']([^"']*)["'][^>]*>`, "i"),
        new RegExp(`<link[^>]*\\bhref\\s*=\\s*["']([^"']*)["'][^>]*\\brel\\s*=\\s*["']${escaped}["'][^>]*>`, "i"),
    ];
    for (const pattern of patterns) {
        const hit = pattern.exec(head);
        if (hit) return decodeEntities(hit[1]).trim();
    }
    return "";
}

/**
 * 解析单页的 SEO 关键字段（缺什么、值是什么，全部来自真实 HTML）。
 *
 * 这里刻意在**整份 HTML**里找标签，而不是只搜 <head>：Next 的 App Router 流式渲染下，
 * 文章页的 <title>/description/canonical/og:* 会出现在 </head> 之后（实测文章页头部 5.7KB 闭合，
 * meta 在约 240KB 处才流出来）。已核对：RSC 转义载荷里只有 \"robots\" 这类键名，
 * 没有 <title>/<meta> 标签，所以整篇正则不会误匹配转义内容。
 */
function parsePageMeta(html: string): Omit<PageMetaSample, "url" | "status" | "error"> {
    const head = html;
    const titleHit = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head);
    const title = titleHit ? decodeEntities(titleHit[1]).trim() : "";
    const description = metaContent(head, "name", "description");
    const ogTitle = metaContent(head, "property", "og:title");
    const ogDescription = metaContent(head, "property", "og:description");
    const ogImage = metaContent(head, "property", "og:image");
    const ogUrl = metaContent(head, "property", "og:url");
    const ogType = metaContent(head, "property", "og:type");
    const metaRobots = metaContent(head, "name", "robots");
    const keywords = metaContent(head, "name", "keywords");
    const canonical = linkHref(head, "canonical");

    /** og:image / canonical 必须是绝对地址，相对地址在分享与收录时会被忽略 */
    const isAbsolute = (value: string) => /^https?:\/\//i.test(value);

    const fields: PageMetaField[] = [
        {
            key: "title",
            label: "<title>",
            ok: title.length > 0,
            value: title || "（未渲染 <title>）",
        },
        {
            key: "description",
            label: "meta description",
            // 太短（<40 字）搜索引擎多半会自己截取正文，所以判为不通过并给出长度
            ok: description.length >= 40,
            value: description
                ? `${description.length} 字：${truncate(description, 160)}`
                : "（缺失，搜索引擎会自行摘取正文）",
        },
        {
            key: "og:title",
            label: "og:title",
            ok: ogTitle.length > 0,
            value: ogTitle || "（缺失，分享卡片标题会退化为 URL）",
        },
        {
            key: "og:description",
            label: "og:description",
            ok: ogDescription.length > 0,
            value: ogDescription ? truncate(ogDescription, 120) : "（缺失，分享卡片没有摘要）",
        },
        {
            key: "og:image",
            label: "og:image",
            ok: isAbsolute(ogImage),
            value: ogImage ? (isAbsolute(ogImage) ? truncate(ogImage, 160) : `非绝对地址：${ogImage}`) : "（缺失，分享无缩略图）",
        },
        {
            key: "og:url",
            label: "og:url",
            ok: isAbsolute(ogUrl),
            value: ogUrl ? (isAbsolute(ogUrl) ? truncate(ogUrl, 160) : `非绝对地址：${ogUrl}`) : "（缺失）",
        },
        {
            key: "canonical",
            label: "canonical",
            ok: isAbsolute(canonical),
            value: canonical
                ? isAbsolute(canonical)
                    ? truncate(canonical, 160)
                    : `非绝对地址：${canonical}`
                : "（缺失，多入口访问时容易被判重复内容）",
        },
    ];

    return { title, fields, metaRobots, ogType, keywords };
}

/** meta robots 里是否含 noindex（大小写与空格不敏感） */
function isNoindex(value: string): boolean {
    return /noindex/i.test(value);
}

// ===================== 主流程 =====================

export async function GET(request: NextRequest) {
    // 与其它同源管理路由一致：先确认已登录（真正的权限边界始终在后端）
    if (!request.cookies.get(ACCESS_TOKEN_KEY)?.value) {
        return NextResponse.json({ code: 401, message: "未登录", data: null }, { status: 401 });
    }

    const checks: SeoCheck[] = [];
    const pushCheck = (check: SeoCheck) => {
        checks.push(check);
    };

    // ---- 0. 确定体检目标（唯一能决定被请求域名的地方） ----
    const config = await getSiteConfigs();
    const envSiteUrl = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL ?? "");
    const configSiteUrl = normalizeOrigin(config?.SITE_URL ?? "");
    const origin = envSiteUrl || configSiteUrl;
    const siteUrlSource: SeoCheckResult["siteUrlSource"] = envSiteUrl
        ? "env"
        : configSiteUrl
          ? "config"
          : "none";

    // ---- 0.1 站点公开配置里是否存在 seo.* 键（只读，不臆造值） ----
    const seoKeyNames = ["seo.baidu.enable", "seo.baidu.site", "seo.baidu.token"];
    const configRecord = (config ?? undefined) as Record<string, unknown> | undefined;
    const seoNode = configRecord?.["seo"];
    const seoKeys = seoKeyNames.map((key) => {
        const short = key.split(".").slice(1).join("."); // baidu.enable
        const [section, field] = short.split(".");
        const sectionValue = (seoNode as Record<string, unknown> | undefined)?.[section];
        const value = (sectionValue as Record<string, unknown> | undefined)?.[field];
        return {
            key,
            present: value !== undefined && value !== null,
            value: value === undefined || value === null ? "" : String(value),
        };
    });

    if (!origin) {
        pushCheck({
            id: "site-url",
            label: "站点地址",
            level: "fail",
            message: "取不到站点地址（NEXT_PUBLIC_SITE_URL 未设置，站点配置也没有 SITE_URL），无法进行任何 URL 探测",
            evidence: [`NEXT_PUBLIC_SITE_URL=${process.env.NEXT_PUBLIC_SITE_URL ?? "（空）"}`, `站点配置 SITE_URL=${config?.SITE_URL ?? "（空）"}`],
        });
        const counts = countLevels(checks);
        const result: SeoCheckResult = {
            checkedAt: new Date().toISOString(),
            siteUrl: "",
            siteUrlSource,
            counts,
            checks,
            seoKeys,
            robots: null,
            feeds: [],
            sitemap: null,
            pages: [],
        };
        return NextResponse.json({ code: 200, message: "ok", data: result });
    }

    pushCheck({
        id: "site-url",
        label: "站点地址",
        level: "pass",
        message: `体检目标：${origin}（来源：${siteUrlSource === "env" ? "环境变量 NEXT_PUBLIC_SITE_URL" : "站点配置 SITE_URL"}）`,
        evidence: [`${origin}/sitemap.xml`, `${origin}/robots.txt`],
    });

    // ---- 1. robots.txt 与 sitemap.xml 可访问性 ----
    const probeResults = await Promise.all(PROBE_PATHS.map((path) => probe(origin, path)));
    const probeMap = new Map<string, FetchOutcome>();
    PROBE_PATHS.forEach((path, index) => probeMap.set(path, probeResults[index]));

    const sitemapProbe = probeMap.get("/sitemap.xml");
    const sitemapOk = sitemapProbe?.status === 200 && sitemapProbe.body.trim().length > 0;
    pushCheck({
        id: "sitemap-reachable",
        label: "sitemap.xml 可访问",
        level: sitemapOk ? "pass" : "fail",
        message: sitemapOk
            ? `HTTP 200，返回 ${sitemapProbe.body.length} 字节（Content-Type: ${sitemapProbe.contentType || "未声明"}）`
            : sitemapProbe?.error
              ? `请求失败：${sitemapProbe.error}`
              : `HTTP ${sitemapProbe?.status}，正文 ${sitemapProbe?.body.trim() ? "非空" : "为空"}`,
        evidence: [`GET ${origin}/sitemap.xml`, truncate(sitemapProbe?.body ?? "", 200)],
    });

    const robotsProbe = probeMap.get("/robots.txt");
    const robotsOk = robotsProbe?.status === 200 && robotsProbe.body.trim().length > 0;
    const robots = robotsOk ? parseRobots(robotsProbe.body, `${origin}/robots.txt`, true) : null;
    pushCheck({
        id: "robots-reachable",
        label: "robots.txt 可访问",
        level: robotsOk ? "pass" : "fail",
        message: robotsOk
            ? `HTTP 200，${robotsProbe.body.split(/\r?\n/).filter((line) => line.trim()).length} 行有效内容`
            : robotsProbe?.error
              ? `请求失败：${robotsProbe.error}`
              : `HTTP ${robotsProbe?.status}，正文 ${robotsProbe?.body.trim() ? "非空" : "为空"}`,
        evidence: [`GET ${origin}/robots.txt`, truncate(robotsProbe?.body ?? "", EVIDENCE_MAX)],
    });

    // ---- 2. robots.txt 是否误 Disallow 了整站 / 关键路径 ----
    if (robots) {
        pushCheck({
            id: "robots-blanket",
            label: "robots.txt 未屏蔽整站",
            level: robots.blanketDisallow ? "fail" : "pass",
            message: robots.blanketDisallow
                ? "robots.txt 里存在 User-agent: * 的 Disallow: /，搜索引擎会被要求放弃整站收录"
                : "没有 User-agent: * 的 Disallow: /（后台 /admin/ 的屏蔽属正常做法）",
            evidence:
                robots.directives.length > 0
                    ? robots.directives.slice(0, 12).map((d) => `${d.agent} → ${d.type === "allow" ? "Allow" : "Disallow"}: ${d.path}`)
                    : ["（robots.txt 里没有任何 Allow/Disallow 规则）"],
        });

        const sitemapDeclared =
            robots.sitemaps.length > 0 &&
            robots.sitemaps.some((item) => {
                try {
                    return new URL(item, `${origin}/robots.txt`).pathname === "/sitemap.xml";
                } catch {
                    return false;
                }
            });
        pushCheck({
            id: "robots-sitemap-declared",
            label: "robots.txt 里声明了 sitemap",
            level: sitemapDeclared ? "pass" : "fail",
            message: sitemapDeclared
                ? "已声明 sitemap 地址，爬虫能顺着 robots.txt 找到站点地图"
                : robots.sitemaps.length > 0
                  ? `声明了 ${robots.sitemaps.length} 条 Sitemap，但没有指向本站 /sitemap.xml`
                  : "robots.txt 里没有 Sitemap: 行，爬虫需要靠常规路径猜测",
            evidence: robots.sitemaps.length > 0 ? robots.sitemaps : [`对照：${origin}/sitemap.xml`],
        });
    }

    // ---- 3. 订阅源候选逐个探测（Next 只实现了 rss.xml，其余是别名，不能想当然） ----
    const feedOutcomes = await Promise.all(FEED_PATHS.map((path) => probe(origin, path)));
    const feeds: FeedProbe[] = FEED_PATHS.map((path, index) => ({
        path,
        status: feedOutcomes[index].status,
        contentType: feedOutcomes[index].contentType,
        ok: feedOutcomes[index].status === 200 && feedOutcomes[index].body.trim().length > 0,
    }));
    const reachableFeeds = feeds.filter((feed) => feed.ok);
    pushCheck({
        id: "feeds-reachable",
        label: "订阅源可访问",
        level: reachableFeeds.length > 0 ? "pass" : "fail",
        message:
            reachableFeeds.length > 0
                ? `${reachableFeeds.length}/${feeds.length} 个订阅源返回 200：${reachableFeeds.map((f) => f.path).join("、")}`
                : "rss.xml / feed.xml / atom.xml 三个候选路径都没有可用正文",
        // 证据直接用探测结果（含失败原因），不去查 feeds 数组——那里按设计只保留结果形状
        evidence: FEED_PATHS.map((path, index) => {
            const outcome = feedOutcomes[index];
            return outcome.error
                ? `${path} → ${outcome.error}`
                : `${path} → HTTP ${outcome.status}${outcome.contentType ? ` (${outcome.contentType})` : ""}`;
        }),
    });

    // ---- 4. sitemap 内容与条目数 ----
    let sitemap: SeoCheckResult["sitemap"] = null;
    let sameOriginPaths: string[] = [];
    if (sitemapOk && sitemapProbe) {
        const parsed = parseSitemap(sitemapProbe.body, `${origin}/sitemap.xml`, origin);
        sameOriginPaths = parsed.sameOriginPaths;
        sitemap = { url: `${origin}/sitemap.xml`, count: parsed.urls.length, urls: parsed.urls.slice(0, 20) };
        pushCheck({
            id: "sitemap-content",
            label: "sitemap 已列出 URL",
            level: parsed.urls.length > 0 ? "pass" : "fail",
            message:
                parsed.urls.length > 0
                    ? `解析到 ${parsed.urls.length} 条 <loc>，其中 ${sameOriginPaths.length} 条与本站同源（可用于抽查页面 meta）`
                    : "sitemap.xml 里没有解析到任何 <loc>，搜索引擎拿不到可收录地址",
            evidence: parsed.urls.slice(0, 6),
        });
    } else {
        pushCheck({
            id: "sitemap-content",
            label: "sitemap 已列出 URL",
            level: "fail",
            message: "sitemap.xml 不可用，无法解析条目",
        });
        sitemap = { url: `${origin}/sitemap.xml`, count: 0, urls: [], error: "sitemap.xml 不可访问" };
    }

    // ---- 5. 页面 meta 抽查（服务端抓取本站页面并解析真实 HTML） ----
    // 首页必查，其余从 sitemap 同源条目里挑（跳过 sitemap/robots/feed 这类非 HTML 资源）
    const candidates: string[] = ["/"];
    for (const path of sameOriginPaths) {
        if (candidates.length >= MAX_PAGE_SAMPLES) break;
        if (/\.(xml|txt|json|rss|atom)$/i.test(path)) continue;
        if (path === "/") continue;
        candidates.push(path);
    }

    const pages: PageMetaSample[] = [];
    for (const path of candidates) {
        const outcome = await probe(origin, path);
        if (outcome.error || outcome.status === null) {
            pages.push({
                url: `${origin}${path}`,
                status: outcome.status,
                error: outcome.error ?? "请求失败",
                title: "",
                fields: [],
                metaRobots: "",
                ogType: "",
                keywords: "",
            });
            continue;
        }
        pages.push({
            url: `${origin}${path}`,
            status: outcome.status,
            ...parsePageMeta(outcome.body),
        });
    }

    const parsedPages = pages.filter((page) => page.fields.length > 0);
    // 首页单独判定（最能代表站点整体）
    const home = pages.find((page) => page.url === `${origin}/`);
    if (home && home.fields.length > 0) {
        const missing = home.fields.filter((field) => !field.ok);
        pushCheck({
            id: "home-meta",
            label: "首页 <title> / description / og / canonical",
            level: missing.length === 0 ? "pass" : "fail",
            message:
                missing.length === 0
                    ? "首页 title、description、og:title/description/image/url、canonical 全部齐全"
                    : `首页缺少或不达标 ${missing.length} 项：${missing.map((field) => field.label).join("、")}`,
            evidence: home.fields.map((field) => `${field.ok ? "✓" : "✗"} ${field.label}：${field.value}`),
        });
    } else if (home) {
        pushCheck({
            id: "home-meta",
            label: "首页 <title> / description / og / canonical",
            level: "fail",
            message: `抓取首页失败：${home.error ?? "无有效 HTML"}`,
            evidence: [`GET ${home.url}`],
        });
    }

    // 文章页（sitemap 里 /posts/xxx 的第一条）：文章页是收录主力，单独给结论
    const article = pages.find((page) => /\/posts\//.test(page.url) && page.fields.length > 0);
    if (article) {
        const missing = article.fields.filter((field) => !field.ok);
        pushCheck({
            id: "article-meta",
            label: "文章页 meta 抽查",
            level: missing.length === 0 ? "pass" : "fail",
            message:
                missing.length === 0
                    ? `${new URL(article.url).pathname} 的 title / description / og / canonical 全部齐全`
                    : `${new URL(article.url).pathname} 缺少或不达标 ${missing.length} 项：${missing.map((field) => field.label).join("、")}`,
            evidence: article.fields.map((field) => `${field.ok ? "✓" : "✗"} ${field.label}：${field.value}`),
        });
    } else if (sitemapOk) {
        pushCheck({
            id: "article-meta",
            label: "文章页 meta 抽查",
            level: "info",
            message: "sitemap 里没有可用的 /posts/ 条目（或抓取失败），本次未抽查文章页",
        });
    }

    // ---- 6. 是否被 noindex 意外屏蔽（robots.txt 与 meta robots 两处都看） ----
    const homeNoindex = home ? isNoindex(home.metaRobots) : false;
    if (!robotsOk || !home) {
        pushCheck({
            id: "noindex",
            label: "未被 noindex 屏蔽",
            level: "info",
            message: "robots.txt 或首页抓取失败，无法判定 noindex",
        });
    } else if (robots?.blanketDisallow || homeNoindex) {
        pushCheck({
            id: "noindex",
            label: "未被 noindex 屏蔽",
            level: "fail",
            message: robots?.blanketDisallow
                ? "robots.txt 用 Disallow: / 屏蔽了整站，搜索引擎不会收录"
                : `首页 <meta name="robots"> 含 noindex（当前值：${home.metaRobots}），搜索引擎会主动丢弃该页`,
            evidence: [
                robots?.blanketDisallow ? "robots.txt → User-agent: * / Disallow: /" : "",
                homeNoindex ? `首页 meta robots → ${home.metaRobots}` : "",
            ].filter(Boolean),
        });
    } else {
        pushCheck({
            id: "noindex",
            label: "未被 noindex 屏蔽",
            level: "pass",
            message: `首页没有被 noindex：<meta name="robots"> = ${home.metaRobots || "（未声明，默认允许收录）"}`,
            evidence: [
                `robots.txt 未整站禁止（${robots?.directives.length ?? 0} 条规则中无通配 Disallow: /）`,
                `首页 meta robots：${home.metaRobots || "未声明"}`,
            ],
        });
    }

    if (parsedPages.length > 0) {
        const noindexPages = parsedPages.filter((page) => isNoindex(page.metaRobots));
        pushCheck({
            id: "page-noindex",
            label: "抽查页面无 noindex",
            level: noindexPages.length === 0 ? "pass" : "info",
            message:
                noindexPages.length === 0
                    ? `已抽查 ${parsedPages.length} 个页面，均未出现 noindex`
                    : `${noindexPages.length}/${parsedPages.length} 个抽查页面声明了 noindex：${noindexPages.map((page) => new URL(page.url).pathname).join("、")}`,
            evidence: parsedPages.map((page) => `${new URL(page.url).pathname} → ${page.metaRobots || "未声明"}`),
        });
    }

    const result: SeoCheckResult = {
        checkedAt: new Date().toISOString(),
        siteUrl: origin,
        siteUrlSource,
        counts: countLevels(checks),
        checks,
        seoKeys,
        robots,
        feeds,
        sitemap,
        pages,
    };

    return NextResponse.json({ code: 200, message: "ok", data: result });
}

function countLevels(checks: SeoCheck[]): { pass: number; fail: number; info: number } {
    return {
        pass: checks.filter((check) => check.level === "pass").length,
        fail: checks.filter((check) => check.level === "fail").length,
        info: checks.filter((check) => check.level === "info").length,
    };
}
