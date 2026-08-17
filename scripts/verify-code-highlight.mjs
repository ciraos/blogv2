// 拉取 hKw5 文章页，检查代码块 HTML 结构和高亮类
const post = await (await fetch("http://localhost:3126/posts/hKw5", { headers: { "user-agent": "verify" } })).text();
console.log("len:", post.length);

// 找 md-editor-code 结构
const idx = post.indexOf("md-editor-code");
if (idx >= 0) {
    console.log("=== first code block structure ===");
    console.log(post.slice(idx, idx + 700));
}

// 检查 hljs 类是否存在
console.log("\nhljs- 类数量:", (post.match(/hljs-/g) || []).length);
console.log("hljs 引用:", post.includes("highlight.js"));
console.log("language- 类数量:", (post.match(/language-[\w]+/g) || []).length);
