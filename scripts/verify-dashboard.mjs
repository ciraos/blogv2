// 验证仪表盘卡片代码已编译进 chunk
const BASE = "http://localhost:3126";
const html = await (await fetch(`${BASE}/admin/dashboard`, { headers: { Cookie: "token=fake" } })).text();
const chunks = [...html.matchAll(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/g)].map((m) => m[1]);

let found = false;
for (const src of chunks) {
    const code = await (await fetch(`${BASE}${src}`)).text();
    if (code.includes("较昨日") && code.includes("今日访问")) {
        found = true;
        console.log("仪表盘卡片代码已编译:", src.split("/").pop());
        console.log("  含红色箭头(上升):", code.includes("ArrowUpRight") || code.includes("arrow-up-right"));
        console.log("  含绿色箭头(下降):", code.includes("ArrowDownRight") || code.includes("arrow-down-right"));
        console.log("  含灰色占位 —:", code.includes("暂无对比数据"));
        break;
    }
}
console.log("验证完成:", found);
