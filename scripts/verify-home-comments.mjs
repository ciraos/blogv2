// 验证首页最新评论区块
const res = await fetch("http://localhost:3126/", { headers: { "user-agent": "verify" } });
const html = await res.text();
console.log("status:", res.status);

const checks = [
    ["标题 最新评论", html.includes("最新评论")],
    ["左右滑动提示", html.includes("左右滑动查看更多")],
    ["横向滚动容器", html.includes("overflow-x-auto")],
    ["时间轴线", html.includes("h-0.5 bg-border")],
    ["评论者 Hina", html.includes("Hina")],
    ["头像 gravatar", html.includes("cravatar.cn/avatar/")],
    ["评论于目标页", html.includes("评论于")],
    ["站长徽章逻辑", html.includes("站长")],
];
let fail = 0;
for (const [name, ok] of checks) {
    if (!ok) fail++;
    console.log((ok ? "PASS" : "FAIL") + " - " + name);
}
console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
