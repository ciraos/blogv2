// 验证 /about 关于本站页面
const res = await fetch("http://localhost:3126/about", { headers: { "user-agent": "verify" } });
const html = await res.text();
console.log("status:", res.status, "length:", html.length);

const checks = [
    ["作者名 米葱苓sama", html.includes("米葱苓sama")],
    ["副标题 生活明朗", html.includes("生活明朗")],
    ["描述 coding", html.includes("coding")],
    ["性格 ESFJ-A", html.includes("ESFJ-A")],
    ["自我信息 生于 1998", html.includes("1998")],
    ["自我信息 火车司机", html.includes("火车司机")],
    ["座右铭 万物可爱", html.includes("万物可爱")],
    ["特长 酸菜鱼", html.includes("酸菜鱼")],
    ["追求 热爱而去", html.includes("热爱而去")],
    ["追求词 学习", html.includes(">学习<")],
    ["技能 数码科技爱好者", html.includes("数码科技爱好者")],
    ["生涯 软件工程专业", html.includes("软件工程专业")],
    ["追番 鬼灭之刃", html.includes("鬼灭之刃")],
    ["音乐 许嵩", html.includes("许嵩")],
    ["游戏 原神", html.includes("原神")],
    ["数码 关注偏好", html.includes("关注偏好")],
    ["地图 淮南市", html.includes("淮南市")],
    ["本站数据 文章", html.includes(">文章<")],
];
for (const [name, ok] of checks) console.log((ok ? "PASS" : "FAIL") + " - " + name);
