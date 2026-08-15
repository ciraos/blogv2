// 验证 footer-project 渲染
const res = await fetch("http://localhost:3126/archives", { headers: { "user-agent": "verify" } });
const html = await res.text();
console.log("status:", res.status);

const checks = [
    ["footer-project 容器", html.includes("footer-project")],
    ["组标题 框架", /框架/.test(html)],
    ["组标题 导航", /导航/.test(html)],
    ["组标题 协议", /协议/.test(html)],
    ["链接 文档", html.includes(">文档<")],
    ["链接 源码(外链)", /href="https:\/\/github\.com\/anzhiyu-c\/anheyu-app"[^>]*target="_blank"/.test(html)],
    ["站内链接 更新日志", /href="\/update"[^>]*>[^<]*更新日志/.test(html)],
    ["链接 小空调", html.includes("小空调")],
    ["链接 相册集", html.includes("相册集")],
    ["链接 隐私协议", html.includes("隐私协议")],
    ["链接 Cookies", html.includes(">Cookies<")],
];
for (const [name, ok] of checks) console.log((ok ? "PASS" : "FAIL") + " - " + name);
