// 最终验证：文章页双栏 + toc + 首页 scrollbar
const post = await (await fetch("http://localhost:3126/posts/hKw5", { headers: { "user-agent": "verify" } })).text();
const home = await (await fetch("http://localhost:3126/", { headers: { "user-agent": "verify" } })).text();

const checks = [
    ["文章页 200 且含标题", post.includes("欢迎使用 Anheyu-App")],
    ["文章页 双栏 grid", post.includes("lg:grid-cols-[minmax(0,1fr)_220px]")],
    ["文章页 aside 右侧目录", post.includes("hidden lg:block")],
    ["文章页 PostToc", post.includes("PostToc")],
    ["文章页 目录按钮(悬浮)", post.includes("文章目录")],
    ["首页 no-scrollbar", home.includes("no-scrollbar")],
];
let fail = 0;
for (const [name, ok] of checks) {
    if (!ok) fail++;
    console.log((ok ? "PASS" : "FAIL") + " - " + name);
}
console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
