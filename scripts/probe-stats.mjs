// 探测 basic stats 接口路径
const paths = [
    "/public/basic-stats",
    "/public/basic_stats",
    "/public/statistics/basic",
    "/public/stats/basic",
    "/public/summary",
];
for (const p of paths) {
    try {
        const res = await fetch(`https://blog.ciraos.top/api${p}`);
        const txt = await res.text();
        console.log(p, "->", res.status, txt.slice(0, 200).replace(/\s+/g, " "));
    } catch (e) {
        console.log(p, "ERR", e.message);
    }
}
