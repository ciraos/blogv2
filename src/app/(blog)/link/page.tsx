import type { Metadata } from "next";
import { FlinkBanner } from "@/components/(blog)/flink-banner";
import { LinkApplyConditions } from "@/components/(blog)/link-apply-conditions";
import { LinkCustomHtml } from "@/components/(blog)/link-custom-html";
import { LinkPond } from "@/components/(blog)/link-pond";
import { LinkSections } from "@/components/(blog)/link-sections";
import { PostComments } from "@/components/(blog)/post-comments";
import { getCommentsWithChildrenApi, getLinksByCategoryApi, getPublicLinkCategoriesApi, getPublicSiteConfigApi, getRandomMomentPostApi } from "@/lib/api";
import { generateBlogMetadata } from "@/lib/seo";

// 友链来自远端实时数据，不做构建期静态预渲染
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("友情链接");
}

export default async function Link() {
    // 站点配置（用于页脚自定义内容）
    const config = await getPublicSiteConfigApi().catch(() => null);

    // 获取分类列表，再按分类拉取友链。
    // 顺序：按分类 id 升序（创建越早越靠前，id 越大越往下）；
    // 空分类（含推荐/已失联）一律隐藏不展示。
    const categories = await getPublicLinkCategoriesApi();

    const sections = await Promise.all(
        categories.map(async (category) => ({
            category,
            links: await getLinksByCategoryApi(category.id),
        }))
    );
    // 按 id 升序；过滤空分类
    const visible = sections
        .filter((section) => section.links.length > 0)
        .sort((a, b) => a.category.id - b.category.id);

    // 页脚自定义内容（后端已渲染好的 HTML）
    const customHtml = config?.FRIEND_LINK_APPLY_CUSTOM_CODE_HTML || "";
    // 友链申请条件（勾选全部后可申请）
    const applyConditions = config?.FRIEND_LINK_APPLY_CONDITION || [];

    // 友链页评论：挂载路径 /link（后端 target_path 支持任意路径；失败降级为空列表）
    const comments = await getCommentsWithChildrenApi("/link");

    // 友链鱼塘：随机一篇友链朋友圈文章（失败降级 null，组件内显示空态 + 可重试）
    let randomPost = null;
    try {
        randomPost = await getRandomMomentPostApi();
    } catch {
        // 忽略，显示空态
    }

    // 顶部 Banner 用友链 logo 墙：收集所有分区下的友链（不重复）
    const allLinks = [...new Map(visible.flatMap((s) => s.links).map((l) => [l.id, l])).values()];

    return (
        <div className="linksetcion w-full space-y-4">
            {/* 顶部 Banner：与数百名博主无限进步 + 随机访问/申请友链 + logo 波浪墙 */}
            <FlinkBanner links={allLinks} />

            {/* 友链鱼塘：随机一篇友链朋友圈文章 */}
            <LinkPond initial={randomPost} />

            {visible.length === 0 ? (
                <p className="py-16 text-center text-muted-foreground">暂无友情链接</p>
            ) : (
                /* 分区渲染：按管理员保存的分类顺序（LinkSections 内部读取 localStorage 重排） */
                <LinkSections sections={visible} />
            )}

            {/* 页脚自定义内容（免责声明 + 友链申请须知等，后端渲染好的 HTML，末尾含 yaml 示例框） */}
            {customHtml && <LinkCustomHtml html={customHtml} />}

            {/* 申请条件：放在 yaml 示例框下方，全部勾选后可申请友链 */}
            <LinkApplyConditions conditions={applyConditions} />

            {/* 友链页评论区：展示该路径下的评论（发送接口待接入） */}
            <PostComments targetPath="/link" comments={comments} />
        </div>
    );
}
