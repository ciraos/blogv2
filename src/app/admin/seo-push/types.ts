/* =============================================================================
 * SEO 体检结果类型（客户端组件与代理路由共用）
 *
 * 为什么单独放一个文件：这些类型同时被「/api/admin/seo-check 路由」和
 * 「seo-push-manager 客户端组件」引用。客户端组件绝不能去 import 一个 route.ts
 * （会把服务端模块拖进客户端包），所以类型放在这个两边都能安全引用的文件里。
 *
 * 本文件只声明形状，不含任何逻辑。
 * ========================================================================== */

/** 单条体检结论：pass 通过 / fail 不通过 / info 中性信息（无法判定） */
export type CheckLevel = "pass" | "fail" | "info";

export interface SeoCheck {
    id: string;
    label: string;
    level: CheckLevel;
    /** 一句话结论 */
    message: string;
    /** 可核对证据：原文片段、URL、HTTP 状态等 */
    evidence?: string[];
}

/** robots.txt 里的一条 allow/disallow 规则 */
export interface RobotsDirective {
    /** 所属 User-agent 分组（* 表示未写 User-agent 的默认分组） */
    agent: string;
    type: "allow" | "disallow";
    path: string;
}

export interface RobotsInfo {
    url: string;
    ok: boolean;
    /** 响应正文（截断），供页面直接展示 */
    text: string;
    directives: RobotsDirective[];
    sitemaps: string[];
    /** 通配分组里是否写了 Disallow: /（整站禁止收录） */
    blanketDisallow: boolean;
    /** 除 /admin 之外的 Disallow（只提示，不判失败） */
    suspiciousDisallows: string[];
}

/** 被抽查页面的单个 meta 字段 */
export interface PageMetaField {
    key: string;
    label: string;
    ok: boolean;
    /** 解析到的真实值（截断） */
    value: string;
}

/** 被抽查页面的 meta 汇总（全部来自服务端抓取的真实 HTML） */
export interface PageMetaSample {
    url: string;
    status: number | null;
    error?: string;
    /** <title> 原文 */
    title: string;
    fields: PageMetaField[];
    metaRobots: string;
    ogType: string;
    keywords: string;
}

/** 订阅源探测结果 */
export interface FeedProbe {
    path: string;
    status: number | null;
    contentType: string;
    ok: boolean;
}

export interface SeoCheckResult {
    /** 检查发生时间（ISO） */
    checkedAt: string;
    /** 体检目标的 origin */
    siteUrl: string;
    /** siteUrl 的来源：env=环境变量 / config=站点配置 / none=都没取到 */
    siteUrlSource: "env" | "config" | "none";
    counts: { pass: number; fail: number; info: number };
    checks: SeoCheck[];
    /**
     * 站点公开配置里是否存在 seo.* 键。
     * 实测 /public/site-config 不返回 seo.*，这里如实记录，
     * 避免界面谎称「已读取到百度推送配置」。
     */
    seoKeys: { key: string; present: boolean; value: string }[];
    robots: RobotsInfo | null;
    feeds: FeedProbe[];
    sitemap: { url: string; count: number; urls: string[]; error?: string } | null;
    pages: PageMetaSample[];
}
