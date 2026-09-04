// llms.txt：给 AI 爬虫/大模型阅读的站点内容清单
// 规范参考 https://llmstxt.org/ ；复用 feed 的取数（站点配置 + 全量公开文章）
import { getFeedData } from "@/lib/feed";

// 内容随站点配置与文章变化（fetch 属 request-time API，需动态生成）
export const dynamic = "force-dynamic";

export async function GET() {
    const { name, description, siteUrl, articles } = await getFeedData();

    const lines: string[] = [];
    lines.push(`# ${name}`);
    if (description) lines.push("");
    if (description) lines.push(`> ${description}`);
    lines.push("");
    lines.push(`${name} 是一个个人博客，主要发布技术文章与生活随笔。`);
    lines.push("");
    lines.push(`网站地址：${siteUrl}`);
    if (articles.length > 0) {
        lines.push("");
        lines.push("## 文章");
        lines.push("");
        for (const a of articles) {
            const title = a.title.replace(/\s+/g, " ").trim();
            const summary = a.summary.replace(/\s+/g, " ").trim();
            lines.push(summary ? `- [${title}](${a.link}): ${summary}` : `- [${title}](${a.link})`);
        }
    }
    lines.push("");

    return new Response(lines.join("\n"), {
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
        },
    });
}
