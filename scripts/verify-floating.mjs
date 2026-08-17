// 验证悬浮按钮组
// 1. 首页（非文章页）：应有触发器 + 回到顶部，无目录按钮
const home = await (await fetch("http://localhost:3126/", { headers: { "user-agent": "verify" } })).text();
console.log("home:", home.includes("FloatingActions") ? "chunk ref" : "?");
// 2. 文章页（hKw5）：应有目录按钮
const post = await (await fetch("http://localhost:3126/posts/hKw5", { headers: { "user-agent": "verify" } })).text();

const checks = [
    ["首页包含悬浮组件 aria-label 展开操作按钮", home.includes("展开操作按钮")],
    ["首页包含 回到顶部 aria-label", home.includes("回到顶部")],
    ["文章页包含 目录按钮 aria-label", post.includes("文章目录")],
    ["文章页包含 回到顶部", post.includes("回到顶部")],
    ["文章页包含 展开操作按钮", post.includes("展开操作按钮")],
];
let fail = 0;
for (const [name, ok] of checks) {
    if (!ok) fail++;
    console.log((ok ? "PASS" : "FAIL") + " - " + name);
}
console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
