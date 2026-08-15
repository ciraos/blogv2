// 验证 /about 复刻布局
const res = await fetch("http://localhost:3126/about", { headers: { "user-agent": "verify" } });
const html = await res.text();
console.log("status:", res.status, "length:", html.length);

const checks = [
    ["大标题 关于本站", />关于本站</.test(html)],
    ["作者名 米葱苓sama", html.includes("米葱苓sama")],
    ["副标题 生活明朗", html.includes("生活明朗")],
    ["自我介绍 你好", html.includes("你好，很高兴认识你👋")],
    ["关键词轮播 mask", html.includes("about-word-mask")],
    ["关键词 学习", html.includes(">学习<")],
    ["技能标题 开启创造力", html.includes("开启创造力")],
    ["技能图标 Docker", html.includes("Docker")],
    ["技能图标 React", html.includes("React")],
    ["生涯 软件工程专业", html.includes("软件工程专业")],
    ["统计 今日人数", html.includes("今日人数")],
    ["统计 年访问量", html.includes("年访问量")],
    ["地图 淮南市", html.includes("淮南市")],
    ["自我信息 生于 1998", html.includes("1998")],
    ["性格 ESFJ-A", html.includes("ESFJ-A")],
    ["座右铭 万物可爱", html.includes("万物可爱")],
    ["特长 酸菜鱼", html.includes("酸菜鱼")],
    ["游戏 原神", html.includes(">原神<")],
    ["游戏 UID", html.includes("152304177")],
    ["追番 鬼灭之刃", html.includes("鬼灭之刃")],
    ["数码 关注偏好", html.includes("关注偏好")],
    ["音乐 许嵩", html.includes("许嵩")],
    ["音乐按钮 更多推荐", html.includes("更多推荐")],
    ["头像 USER_AVATAR", html.includes("1781234930408529850.avif")],
    ["头像彩虹环", html.includes("avatar-ring")],
    ["头像绿点", html.includes("avatar-online")],
    ["技能标签浮动", html.includes("about-tag")],
];
let fail = 0;
for (const [name, ok] of checks) {
    if (!ok) fail++;
    console.log((ok ? "PASS" : "FAIL") + " - " + name);
}
console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
