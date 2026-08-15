// 验证新版 404 页面
const html = (await (await fetch("http://localhost:3126/posts/not-exist-id")).text()).replace(/<!-- -->/g, "");
console.log("404 大字:", html.includes(">404<"));
console.log("CSS 幽灵 nf-ghost:", html.includes("nf-ghost"));
console.log("漂浮圆点 nf-dot 数量:", (html.match(/nf-dot/g) || []).length);
console.log("眼睛(实心圆):", html.includes("rounded-full bg-foreground"));
console.log("腮红:", html.includes("bg-pink-300/80"));
console.log("微笑:", html.includes("border-b-2 border-foreground"));
console.log("模糊光斑:", html.includes("blur-3xl"));
console.log("返回首页/查看文章:", html.includes("返回首页") && html.includes("查看文章"));
console.log("垂直居中:", html.includes("min-h-[calc(100dvh-10rem)]"));
