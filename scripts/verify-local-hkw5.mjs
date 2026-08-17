// 验证本地 /posts/hKw5 是否能渲染（内容与参考站相同）
const res = await fetch("http://localhost:3126/posts/hKw5", { headers: { "user-agent": "verify" } });
const html = await res.text();
console.log("status:", res.status, "len:", html.length);

const checks = [
    ["标题", html.includes("欢迎使用 Anheyu-App")],
    ["content_html 注入", html.includes("md-editor-code")],
    ["tabs 结构", html.includes('class="tabs"')],
    ["tip wrapper", html.includes("anzhiyu-tip-wrapper")],
    ["music player", html.includes("markdown-music-player")],
    ["folding", html.includes("folding-tag")],
    ["hidden", html.includes("hide-button")],
    ["gallery", html.includes("gallery-container")],
    ["linkcard", html.includes("anzhiyu-tag-link")],
    ["btn", html.includes("btn-container")],
    ["ArticleBody chunk 引用", html.includes("ArticleBody") || html.includes("article-body")],
];
let fail = 0;
for (const [name, ok] of checks) {
    if (!ok) fail++;
    console.log((ok ? "PASS" : "FAIL") + " - " + name);
}
console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
