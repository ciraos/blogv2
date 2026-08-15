// 检查 /travelling 是否 meta-refresh 跳转
const html = await (await fetch("http://localhost:3126/travelling")).text();
const m = html.match(/__next-page-redirect[^>]*/);
console.log("meta-refresh 标记:", m ? m[0].substring(0, 120) : "(无)");
const m2 = html.match(/url=([^"&]+)/);
console.log("跳转目标:", m2 ? decodeURIComponent(m2[1]).substring(0, 80) : "(无)");
console.log("含兜底文案:", html.includes("随机友链获取失败"));
