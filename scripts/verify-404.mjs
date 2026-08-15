// 确认 back-button 客户端组件 chunk 被引用
const html = await (await fetch("http://localhost:3126/posts/not-exist-id")).text();
console.log("RSC 引用 BackButton:", html.includes("BackButton"));
console.log("not-found chunk 引用:", html.includes("src_app_not-found_tsx"));
// 检查该 chunk 是否包含返回逻辑
const m = html.match(/src="(\/_next\/static\/chunks\/[^"]*not-found[^"]*\.js)"/);
if (m) {
    const code = await (await fetch("http://localhost:3126" + m[1])).text();
    console.log("chunk 含 window.history 返回逻辑:", code.includes("history.length") || code.includes("router.back"));
} else {
    console.log("未找到 not-found chunk URL（dev 下可能内联）");
}
