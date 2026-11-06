import type { Metadata } from "next";
import { FlinkBanner } from "@/components/(blog)/flink-banner";
import { LinkApplyConditions } from "@/components/(blog)/link-apply-conditions";
import { LinkCustomHtml } from "@/components/(blog)/link-custom-html";
import { LinkPond } from "@/components/(blog)/link-pond";
import { LinkSections } from "@/components/(blog)/link-sections";
import { PostComments } from "@/components/(blog)/post-comments";
import { getCommentsWithChildrenApi, getLinksByCategoryApi, getLinksGroupedByCategoryApi, getPublicLinkCategoriesApi, getRandomMomentPostApi } from "@/lib/api";
import { getCommentAuthor } from "@/lib/comment-author";
import { pickFishLine } from "@/lib/fish-lines";
import { requireSiteConfigs } from "@/lib/site-config";
import { generateBlogMetadata } from "@/lib/seo";
import { EmptyState } from "@/components/(blog)/empty-state";
import { Link2 } from "lucide-react";

/**
 * 友链页顶部横幅开关（默认关闭）。
 * 与其它布尔开关一致：只有 1 / true / yes / on 算开启，不设 / 0 / false 都算关闭。
 */
const LINK_BANNER_ENABLED = ["1", "true", "yes", "on"].includes(
    (process.env.NEXT_PUBLIC_LINK_BANNER_ENABLE ?? "").trim().toLowerCase()
);
// 友链来自远端实时数据，不做构建期静态预渲染
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("友情链接");
}

/**
 * 拆解后端那段「友链申请」自定义 HTML（`FRIEND_LINK_APPLY_CUSTOM_CODE_HTML`）。
 *
 * 后端给的一整段结构是：
 *   1. `<details>` 免责声明
 *   2. `<h2>友情链接申请</h2>` + 一段介绍文字
 *   3. `<details open>` 友情链接相关须知
 *   4. `<details class="md-editor-code">` yaml 示例代码块
 *
 * 用户要的页面顺序是：**标题+介绍 → 免责声明 → 须知 → 申请条件 → yaml**。
 * 也就是要把第 2 段提到最前面、第 4 段挪到申请条件之后。这里按「顶层块」切分再重排：
 * 只做块级节点的搬移，不改写块内任何内容。
 *
 * 任何一步没匹配上就保持原样（宁可顺序不对，也不能把 HTML 拆坏）。
 */
function splitLinkApplyCustomHtml(html: string): { header: string; middle: string; codeBlock: string } {
    if (!html.trim()) return { header: "", middle: "", codeBlock: "" };

    // ① 末尾的 yaml 代码块（最后一个 md-editor-code）
    const codePattern = /<details\b[^>]*\bmd-editor-code\b[^>]*>[\s\S]*?<\/details>/gi;
    let codeIndex = -1;
    let codeMatch: RegExpExecArray | null;
    while ((codeMatch = codePattern.exec(html)) !== null) codeIndex = codeMatch.index;
    const codeBlock = codeIndex >= 0 ? html.slice(codeIndex) : "";
    const body = (codeIndex >= 0 ? html.slice(0, codeIndex) : html).trim();

    // ② 把剩下的内容拆成顶层块（details / h2 / p …），块之间的空白原样保留在块尾
    const blockPattern = /<(details|h[1-6]|p|ul|ol|blockquote|pre|div)\b[^>]*>[\s\S]*?<\/\1>/gi;
    const blocks: string[] = [];
    let cursor = 0;
    let blockMatch: RegExpExecArray | null;
    while ((blockMatch = blockPattern.exec(body)) !== null) {
        const start = blockMatch.index;
        const end = start + blockMatch[0].length;
        blocks.push(body.slice(cursor, end));
        cursor = end;
    }
    if (cursor < body.length) blocks.push(body.slice(cursor));

    // ③ 「友情链接申请」标题所在的块开始，到第一个 details 之前，都算 header
    const headerStart = blocks.findIndex((block) => /<h[1-6]\b[^>]*>[^<]*友情链接/.test(block));
    if (headerStart < 0) return { header: "", middle: blocks.join("").trim(), codeBlock };

    let headerEnd = headerStart;
    while (headerEnd + 1 < blocks.length && !/^\s*<details\b/i.test(blocks[headerEnd + 1].trimStart())) {
        headerEnd++;
    }

    const header = blocks.slice(headerStart, headerEnd + 1).join("").trim();
    const middle = blocks
        .filter((_, index) => index < headerStart || index > headerEnd)
        .join("")
        .trim();

    return { header, middle, codeBlock };
}

export default async function Link() {
    // 站点配置（用于页脚自定义内容）
    const config = await requireSiteConfigs().catch(() => null);

    // 友链分区：按分类展示该分类下的「全部友链」——包含状态为 INVALID 的已失联友链，
    // 所以分区标题里的计数是该分类的总条数（不是其中「已通过」的条数）。
    // 全状态公开接口不可用时回退到「仅已通过」的旧路径（/public/link-categories + /public/links）。
    let sections = await getLinksGroupedByCategoryApi();
    if (!sections) {
        const categories = await getPublicLinkCategoriesApi();
        sections = (
            await Promise.all(
                categories.map(async (category) => ({
                    category,
                    links: await getLinksByCategoryApi(category.id),
                }))
            )
        ).sort((a, b) => a.category.id - b.category.id);
    }
    // 顺序：按分类 id 升序（创建越早越靠前，id 越大越往下）；空分类一律隐藏不展示。
    const visible = sections.filter((section) => section.links.length > 0);

    // 自定义内容拆成三段：header（「友情链接申请」标题+介绍）/ middle（免责声明 + 须知）/ codeBlock（yaml 示例）
    const { header: customHeader, middle: customMiddle, codeBlock: customCodeBlock } = splitLinkApplyCustomHtml(
        config?.FRIEND_LINK_APPLY_CUSTOM_CODE_HTML || ""
    );
    // 友链申请条件（勾选全部后可申请）
    const applyConditions = config?.FRIEND_LINK_APPLY_CONDITION || [];
    // 申请表单的占位文案（后台「友链 → 表单占位文案」）。
    // 以前这 5 个框是写死的，改后台不生效；现在按 FRIEND_LINK_PLACEHOLDER_* 透传，
    // 某一项为空时由表单组件回退到默认文案。
    const applyPlaceholders = {
        name: config?.FRIEND_LINK_PLACEHOLDER_NAME,
        url: config?.FRIEND_LINK_PLACEHOLDER_URL,
        logo: config?.FRIEND_LINK_PLACEHOLDER_LOGO,
        description: config?.FRIEND_LINK_PLACEHOLDER_DESCRIPTION,
        siteshot: config?.FRIEND_LINK_PLACEHOLDER_SITESHOT,
    };

    // 友链鱼塘：随机一篇友链朋友圈文章（失败降级 null，组件内显示空态 + 可重试）
    let randomPost = null;
    try {
        randomPost = await getRandomMomentPostApi();
    } catch {
        // 忽略，显示空态
    }

    // 顶部 Banner 用友链 logo 墙：收集所有分区下的友链（不重复）
    const allLinks = [...new Map(visible.flatMap((s) => s.links).map((l) => [l.id, l])).values()];

    // 友链页评论区：target_path 用页面自身路径（/link），失败降级为空列表
    let comments: Awaited<ReturnType<typeof getCommentsWithChildrenApi>> = [];
    try {
        comments = await getCommentsWithChildrenApi("/link");
    } catch {
        // 忽略，评论区显示空态
    }

    return (
        <div className="linksetcion mx-auto w-full space-y-4">
            {/* 顶部 Banner（友链 logo 滚动墙）：显隐与文案都由环境变量控制，默认关闭。
                · NEXT_PUBLIC_LINK_BANNER_ENABLE=1 才渲染（1/true/yes/on 为开启）
                · 文案可用 NEXT_PUBLIC_LINK_BANNER_LABEL / NEXT_PUBLIC_LINK_BANNER_TITLE 覆盖 */}
            {LINK_BANNER_ENABLED && (
                <FlinkBanner
                    links={allLinks}
                    label={process.env.NEXT_PUBLIC_LINK_BANNER_LABEL?.trim() || undefined}
                    title={process.env.NEXT_PUBLIC_LINK_BANNER_TITLE?.trim() || undefined}
                />
            )}

            {/* 友链鱼塘：随机一篇友链朋友圈文章（首屏趣味前缀在服务端抽签，避免水合文本不一致） */}
            <LinkPond initial={randomPost} initialPrefix={pickFishLine()} />

            {visible.length === 0 ? (
                <EmptyState icon={Link2} title="暂无友情链接" description="还没有通过审核的友链，欢迎在下方申请。" />
            ) : (
                /* 分区渲染：按分类 id 升序，分区内按友链 id 降序（新友链在前） */
                <LinkSections sections={visible} />
            )}

            {/* 自定义内容拆成三段渲染（见 splitLinkApplyCustomHtml 的说明）：
                ① 「友情链接申请」标题 + 介绍
                ② 免责声明 + 相关须知
                ③ 申请条件（勾选后展开表单）
                ④ yaml 示例代码块 */}
            {customHeader && <LinkCustomHtml html={customHeader} />}
            {customMiddle && <LinkCustomHtml html={customMiddle} />}

            {/* 申请条件：全部勾选后自动在下方展开申请表单 */}
            <LinkApplyConditions conditions={applyConditions} placeholders={applyPlaceholders} />

            {/* yaml 示例（原 HTML 末尾的 md-editor 代码块） */}
            {customCodeBlock && <LinkCustomHtml html={customCodeBlock} />}

            {/* 评论区：与页面评论一致，target_path = /link */}
            <PostComments targetPath="/link" comments={comments}  author={await getCommentAuthor()} />
        </div>
    );
}
