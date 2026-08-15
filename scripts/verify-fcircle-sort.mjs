// 验证朋友圈分页美化
const BASE = "http://localhost:3126";
const html = (await (await fetch(`${BASE}/fcircle`)).text()).replace(/<!-- -->/g, "");

console.log("页码按钮 gap-1.5:", html.includes("gap-1.5"));
console.log("当前页实心高亮:", html.includes("bg-primary text-primary-foreground hover:bg-primary/90"));
console.log("上一页按钮:", html.includes("上一页"));
console.log("下一页按钮:", html.includes("下一页"));

// 用 sort_type=created_at + page=2 看中间页码
const html2 = (await (await fetch(`${BASE}/fcircle?sort_type=created_at&page=2`)).text()).replace(/<!-- -->/g, "");
console.log("第2页页码链接:", html2.includes("/fcircle?sort_type=created_at&amp;page=1") && html2.includes("&amp;page=3"));
console.log("页码数字 1 2 3:", html2.includes(">1<") && html2.includes(">2<") && html2.includes(">3<"));
