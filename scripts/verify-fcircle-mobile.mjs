// 验证 fcircle 移动端布局
const res = await fetch("http://localhost:3126/fcircle", { headers: { "user-agent": "verify" } });
const html = await res.text();
console.log("status:", res.status);

const checks = [
    ["分页 flex-wrap", html.includes("flex-wrap justify-center gap-1.5")],
    ["头部 flex-col sm:flex-row", html.includes("flex-col items-start justify-between gap-2 sm:flex-row sm:items-center")],
    ["网格单列起步 grid gap-4", html.includes("grid gap-4 sm:grid-cols-2 lg:grid-cols-3")],
    ["排序按钮", html.includes("按发布时间") || html.includes("按抓取时间")],
    ["统计文案", html.includes("个活跃友链") || html.includes("篇动态")],
];
let fail = 0;
for (const [name, ok] of checks) {
    if (!ok) fail++;
    console.log((ok ? "PASS" : "FAIL") + " - " + name);
}
console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
