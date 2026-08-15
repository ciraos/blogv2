// 探测 CREATIVITY 数据 + reward 接口
const res = await fetch("https://blog.ciraos.top/api/public/site-config");
const j = await res.json();
console.log("CREATIVITY:", JSON.stringify(j.data.CREATIVITY, null, 2));
console.log("about.page.custom_code_html:", JSON.stringify((j.data.about.page.custom_code_html || "").slice(0, 100)));
console.log("enable keys:", Object.keys(j.data.about.page.enable));
