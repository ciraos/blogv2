// 验证 /archives 竖向时间轴渲染
const res = await fetch("http://localhost:3126/archives", { headers: { "user-agent": "verify" } });
const html = await res.text();
console.log("status:", res.status);
console.log("length:", html.length);

const checks = [
    ["标题 归档", html.includes(">归档<")],
    ["年份节点 2026 年", /2026\s*年/.test(html)],
    ["月份 4 月", /4\s*月（/.test(html)],
    ["文章标题 C 语言基础入门", html.includes("C 语言基础入门")],
    ["文章链接 /posts/", /href="\/posts\/[^"]+"/.test(html)],
    ["时间线竖线 border-l", html.includes("border-l")],
    ["日期前缀 tabular-nums", html.includes("tabular-nums")],
    ["旧卡片网格已移除(无 grid-cols-4)", !html.includes("grid-cols-4")],
];
for (const [name, ok] of checks) console.log((ok ? "PASS" : "FAIL") + " - " + name);
