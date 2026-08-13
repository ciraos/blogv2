// 临时联调：验证首页文章列表与详情页
const BASE = "http://localhost:3126";

// 1) 首页
{
    const res = await fetch(`${BASE}/`);
    const html = await res.text();
    console.log("== GET / ==", "HTTP", res.status);
    console.log("  包含文章标题:", html.includes("C 语言基础入门"));
    console.log("  包含卡片链接 /posts/:", html.includes("/posts/gVrO"));
    console.log("  包含置顶/标签区:", html.includes("vscode"));
}

// 2) 详情页
{
    const res = await fetch(`${BASE}/posts/gVrO`);
    const html = await res.text();
    console.log("\n== GET /posts/gVrO ==", "HTTP", res.status);
    console.log("  包含标题:", html.includes("C 语言基础入门"));
    console.log("  包含正文容器 article-body:", html.includes("article-body"));
    console.log("  包含正文内容 <h2>C语言基础入门</h2>:", html.includes("<h2>C语言基础入门</h2>"));
    console.log("  包含阅读量:", html.includes("阅读"));
}

// 3) 不存在的文章 → 404
{
    const res = await fetch(`${BASE}/posts/not-exist-id`, { redirect: "manual" });
    console.log("\n== GET /posts/not-exist-id ==", "HTTP", res.status);
}

// 4) 第二页（只有 1 篇文章 → 空态）
{
    const res = await fetch(`${BASE}/?page=2`);
    const html = await res.text();
    console.log("\n== GET /?page=2 ==", "HTTP", res.status, "| 空态提示:", html.includes("该页没有文章"));
}
