// 检查 main 客户端 chunk 里是否包含 PostToc 的类名
const home = await (await fetch("http://localhost:3126/", { headers: { "user-agent": "verify" } })).text();
// 找所有 chunk js
const chunks = [...home.matchAll(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/g)].map((m) => m[1]);
console.log("chunks:", chunks.length);
let found = false;
for (const c of chunks.slice(0, 12)) {
    try {
        const code = await (await fetch("http://localhost:3126" + c)).text();
        if (code.includes("文章目录") && code.includes("sticky")) {
            console.log("FOUND toc styles in:", c.slice(0, 80));
            console.log("  no-scrollbar:", code.includes("no-scrollbar"));
            console.log("  gradient badge:", code.includes("bg-gradient-to-br from-pink-500 to-indigo-500"));
            console.log("  card container:", code.includes("rounded-xl border bg-card/60"));
            found = true;
            break;
        }
    } catch {}
}
if (!found) console.log("toc 样式类未在首页 chunks 中找到（PostToc 仅文章页加载，需检查文章页 chunks）");
const post = await (await fetch("http://localhost:3126/posts/hKw5", { headers: { "user-agent": "verify" } })).text();
const pchunks = [...post.matchAll(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/g)].map((m) => m[1]);
for (const c of pchunks.slice(0, 15)) {
    try {
        const code = await (await fetch("http://localhost:3126" + c)).text();
        if (code.includes("文章目录") && code.includes("sticky")) {
            console.log("FOUND toc styles in post chunk:", c.slice(0, 80));
            console.log("  no-scrollbar:", code.includes("no-scrollbar"));
            console.log("  gradient badge:", code.includes("bg-gradient-to-br from-pink-500 to-indigo-500"));
            console.log("  card container:", code.includes("rounded-xl border bg-card/60"));
            found = true;
            break;
        }
    } catch {}
}
if (!found) console.log("(not found in scanned chunks — may be inline)");
