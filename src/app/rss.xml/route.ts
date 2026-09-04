// RSS 2.0 订阅源：https://blog.ciraos.top/rss.xml
import { escapeXml, getFeedData, toRfc822 } from "@/lib/feed";

// feed 由站点配置与文章数据驱动（fetch 属 request-time API，需动态生成）
export const dynamic = "force-dynamic";

export async function GET() {
    const { name, description, siteUrl, latestUpdated, articles } = await getFeedData();

    // 建站/更新时间：取全部文章里最新的 updated_at（无文章时已回退为当前时间）

    const items = articles
        .map((a) => {
            const pubDate = toRfc822(a.published);
            const summary = a.summary ? `<description>${escapeXml(a.summary)}</description>` : "";
            return `    <item>
      <title>${escapeXml(a.title)}</title>
      <link>${escapeXml(a.link)}</link>
      <guid isPermaLink="true">${escapeXml(a.link)}</guid>
      <pubDate>${pubDate}</pubDate>
${summary}
    </item>`;
        })
        .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(name)}</title>
    <link>${escapeXml(siteUrl)}</link>
    <description>${escapeXml(description)}</description>
    <language>zh-CN</language>
    <lastBuildDate>${toRfc822(latestUpdated)}</lastBuildDate>
    <atom:link href="${escapeXml(siteUrl)}/rss.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;

    return new Response(xml, {
        headers: {
            "Content-Type": "application/rss+xml; charset=utf-8",
        },
    });
}
