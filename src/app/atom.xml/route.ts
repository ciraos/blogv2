// Atom 订阅源：https://blog.ciraos.top/atom.xml
import { escapeXml, getFeedData, toIso } from "@/lib/feed";

// feed 由站点配置与文章数据驱动（fetch 属 request-time API，需动态生成）
export const dynamic = "force-dynamic";

export async function GET() {
    const { name, description, siteUrl, latestUpdated, articles } = await getFeedData();

    // 更新时间：取全部文章里最新的 updated_at（无文章时已回退为当前时间）

    const entries = articles
        .map((a) => {
            const summary = a.summary ? `<summary>${escapeXml(a.summary)}</summary>` : "";
            return `  <entry>
    <title>${escapeXml(a.title)}</title>
    <link rel="alternate" href="${escapeXml(a.link)}"/>
    <id>${escapeXml(a.link)}</id>
    <published>${toIso(a.published)}</published>
    <updated>${toIso(a.updated)}</updated>
${summary}
  </entry>`;
        })
        .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(name)}</title>
  <subtitle>${escapeXml(description)}</subtitle>
  <link rel="self" href="${escapeXml(siteUrl)}/atom.xml" type="application/atom+xml"/>
  <link rel="alternate" href="${escapeXml(siteUrl)}" type="text/html"/>
  <id>${escapeXml(siteUrl)}/</id>
  <updated>${toIso(latestUpdated)}</updated>
  <author>
    <name>${escapeXml(name)}</name>
  </author>
${entries}
</feed>`;

    return new Response(xml, {
        headers: {
            "Content-Type": "application/atom+xml; charset=utf-8",
        },
    });
}
