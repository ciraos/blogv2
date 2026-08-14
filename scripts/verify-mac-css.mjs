// 验证 dev server 服务的 CSS 是否包含 mac 风格代码框样式
const BASE = "http://localhost:3126";

const html = await (await fetch(`${BASE}/posts/gVrO`)).text();
const cssLinks = [...html.matchAll(/href="([^"]+\.css)"/g)].map((m) => m[1]);
console.log("CSS 链接数:", cssLinks.length);

let ok = false;
for (const c of cssLinks) {
    const css = await (await fetch(`${BASE}${c}`)).text();
    if (css.includes("ff5f57")) {
        ok = true;
        console.log("mac 圆点红 #ff5f57 已生效于:", c);
        console.log("  三色齐全:", css.includes("ff5f57") && css.includes("febc2e") && css.includes("28c840"));
        console.log("  标题栏规则存在:", css.includes("code-block-head,") || css.includes("md-editor-code > summary"));
        break;
    }
}
console.log("mac 样式已加载:", ok);
