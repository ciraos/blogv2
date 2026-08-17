// 验证首页时间轴标题居中花哨样式
const res = await fetch("http://localhost:3126/", { headers: { "user-agent": "verify" } });
const html = await res.text();
console.log("status:", res.status);

const checks = [
    // 标题居中：text-center
    ["标题容器居中", (html.match(/relative text-center/g) || []).length >= 2],
    // 渐变文字标题
    ["渐变文字 bg-clip-text", (html.match(/bg-clip-text text-transparent/g) || []).length >= 2],
    // 图标徽章
    ["图标徽章", (html.match(/bg-gradient-to-br from-pink-500 to-indigo-500 text-white/g) || []).length >= 2],
    // 装饰线
    ["装饰线", (html.match(/from-transparent to-pink-300/g) || []).length >= 2],
    ["中间粉色小点", (html.match(/size-1.5 rounded-full bg-pink-400/g) || []).length >= 2],
    // 内容不再整块居中（无 max-w-4xl）
    ["无整块居中 max-w-4xl", !html.includes("max-w-4xl")],
    // 标题文字
    ["即刻动态标题", html.includes("即刻动态")],
    ["最新评论标题", html.includes("最新评论")],
    // 链接
    ["查看全部 → /essay", /href="\/essay"[^>]*>查看全部/.test(html)],
    ["左右滑动提示", html.includes("左右滑动查看更多")],
];
let fail = 0;
for (const [name, ok] of checks) {
    if (!ok) fail++;
    console.log((ok ? "PASS" : "FAIL") + " - " + name);
}
console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
