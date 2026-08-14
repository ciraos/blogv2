// 验证 dev server 服务的 CSS 包含浅色主题 + 行号样式
const BASE = "http://localhost:3126";

const html = await (await fetch(`${BASE}/posts/gVrO`)).text();
const cssLinks = [...html.matchAll(/href="([^"]+\.css)"/g)].map((m) => m[1]);
console.log("CSS 链接数:", cssLinks.length);

for (const c of cssLinks) {
    const css = await (await fetch(`${BASE}${c}`)).text();
    if (css.includes("line-numbers")) {
        console.log("含 line-numbers 规则:", c);
        console.log("  浅色背景 #fafafa:", css.includes("fafafa"));
        console.log("  code-block-body flex:", css.includes("code-block-body"));
        console.log("  圆点 radial-gradient 42px:", css.includes("radial-gradient") && css.includes("width: 42px"));
        break;
    }
}

// 检查 md 排版新样式
for (const c of cssLinks) {
    const css = await (await fetch(`${BASE}${c}`)).text();
    console.log("== CSS:", c.split("/").pop(), "len", css.length);
    console.log("  blockquote 出现:", (css.match(/blockquote/g) || []).length);
    console.log("  kbd:", css.includes("kbd"), "| mark:", css.includes("article-body mark"), "| ::selection:", css.includes("::selection"), "| scroll-margin:", css.includes("scroll-margin"));
    if (css.includes("blockquote::before")) {
        console.log("新 md 排版样式已生效于:", c.split("/").pop());
        for (const r of ["blockquote::before", "kbd", "article-body mark", "scroll-margin-top", "accent-color", "nth-child(even)", "article-body ::selection", "details:not(.md-editor-code)"]) {
            console.log("  ", r, ":", css.includes(r));
        }
        break;
    }
}
const chunks = [...html.matchAll(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/g)].map((m) => m[1]);
let found = false;
for (const src of chunks) {
    const code = await (await fetch(`${BASE}${src}`)).text();
    if (code.includes("makeLineNumbers") || code.includes("line-numbers")) {
        found = true;
        console.log("客户端 chunk 含行号逻辑:", src);
        break;
    }
}
console.log("行号逻辑已加载:", found);
