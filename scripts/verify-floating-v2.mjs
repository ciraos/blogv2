// 验证新的悬浮按钮布局 + PC 右侧目录
const home = await (await fetch("http://localhost:3126/", { headers: { "user-agent": "verify" } })).text();
const post = await (await fetch("http://localhost:3126/posts/hKw5", { headers: { "user-agent": "verify" } })).text();

const checks = [
    // 首页：触发器 + 回到顶部，无目录按钮
    ["首页 展开操作按钮", home.includes("展开操作按钮")],
    ["首页 回到顶部", home.includes("回到顶部")],
    ["首页 无目录按钮", !home.includes("文章目录")],
    ["首页 无 PostToc", !home.includes("PostToc")],
    // 文章页：双栏布局 + PostToc + 目录按钮
    ["文章页 双栏 grid", post.includes("lg:grid lg:grid-cols-[minmax(0,1fr)_220px]") || post.includes("minmax(0,1fr)")],
    ["文章页 PostToc", post.includes("PostToc")],
    ["文章页 目录按钮", post.includes("文章目录")],
    ["文章页 回到顶部", post.includes("回到顶部")],
    ["文章页 展开操作按钮", post.includes("展开操作按钮")],
];
let fail = 0;
for (const [name, ok] of checks) {
    if (!ok) fail++;
    console.log((ok ? "PASS" : "FAIL") + " - " + name);
}
console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
