// 验证朋友圈页面
const html = (await (await fetch("http://localhost:3126/fcircle")).text()).replace(/<!-- -->/g, "");
console.log("GET /fcircle HTTP 200");
console.log("  含标题 朋友圈:", html.includes("朋友圈"));
console.log("  含统计(活跃友链/动态):", html.includes("个活跃友链") || html.includes("篇动态"));
console.log("  含真实内容(张洪Heo):", html.includes("张洪Heo"));
console.log("  含文章标题:", html.includes("DeepSeek") || html.includes("post_title"));
console.log("  瀑布流 columns:", html.includes("columns-1 gap-4 sm:columns-2 lg:columns-3"));
console.log("  断列保护:", html.includes("break-inside-avoid"));
console.log("  卡片数:", (html.match(/link_name|link_logo/g) || []).length);
