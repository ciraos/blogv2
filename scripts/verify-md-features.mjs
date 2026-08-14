// 验证四个新 md 功能：锚点/checkbox/脚注/首字下沉
const BASE = "http://localhost:3126";

const html = await (await fetch(`${BASE}/posts/gVrO`)).text();
const cssLinks = [...html.matchAll(/href="([^"]+\.css)"/g)].map((m) => m[1]);

for (const c of cssLinks) {
    const css = await (await fetch(`${BASE}${c}`)).text();
    // Turbopack 会归一化 ::after→:after、::first-letter→:first-letter，并压缩空格
    const rules = [
        ["heading-anchor", ".heading-anchor"],
        ["任务列表 :has checkbox", ":has(>input[type=checkbox]"],
        ["checkbox 打勾 :after", ":checked:after"],
        ["脚注 sup 引用", 'sup a[href^="#fn"]'],
        ["脚注 section", "section.footnotes"],
        ["首字下沉 :first-letter", "p:first-child:first-letter"],
        ["ol 计数器", "counter-reset:md-ol"],
        ["ol 数字徽章 li:before", "ol>li:before"],
    ];
    console.log("== CSS:", c.split("/").pop());
    for (const [name, needle] of rules) console.log(`  ${name}:`, css.includes(needle));
}

// 客户端 chunk 是否含标题锚点逻辑
const chunks = [...html.matchAll(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/g)].map((m) => m[1]);
let found = false;
for (const src of chunks) {
    const code = await (await fetch(`${BASE}${src}`)).text();
    if (code.includes("enhanceHeadings") && code.includes("heading-anchor")) {
        found = true;
        console.log("\n客户端 chunk 含 enhanceHeadings:", src.split("/").pop());
        break;
    }
}
console.log("标题锚点逻辑已加载:", found);

// 诊断 :has / checkbox 编译后写法
for (const c of cssLinks) {
    const css = await (await fetch(`${BASE}${c}`)).text();
    if (css.includes("counter-reset") || css.includes("md-ol")) {
        console.log("\n[诊断 ol] css:", c.split("/").pop());
        const i = css.indexOf("counter-reset");
        console.log("  counter-reset 上下文:", css.substring(Math.max(0, i - 120), i + 200));
        const j = css.indexOf("md-ol");
        console.log("  md-ol 首次出现索引:", j);
        break;
    }
}
