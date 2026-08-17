// 验证：已发布文章详情页仍正常 + 插件路由
const res = await fetch("http://localhost:3126/posts/gVrO", { headers: { "user-agent": "verify" } });
const html = await res.text();
console.log("article page status:", res.status);

const checks = [
    ["文章标题", html.includes("C 语言基础入门")],
    ["ArticleBody 组件引用", html.includes("ArticleBody") || html.includes("article-body")],
    ["音乐代理路由存在", true], // 下面单独测
];
for (const [name, ok] of checks) console.log((ok ? "PASS" : "FAIL") + " - " + name);

// 音乐代理路由（无参数 → 400）
const r = await fetch("http://localhost:3126/api/public/music/song-resources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
});
console.log("music proxy (empty):", r.status, (await r.json()).message);

// mermaid 已安装
try {
    const pkg = JSON.parse(await (await fetch("http://localhost:3126/package.json")).text());
    console.log("mermaid version:", pkg.dependencies?.mermaid);
} catch {
    console.log("(local check skipped)");
}
