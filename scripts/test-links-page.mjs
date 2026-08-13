// 临时联调：验证 /links 页面
const BASE = "http://localhost:3126";

const res = await fetch(`${BASE}/link`);
const html = (await res.text()).replace(/<!-- -->/g, "");
console.log("HTTP", res.status, "len", html.length);

const checks = [
    "友情链接",
    "共 150 位朋友",
    "小伙伴",
    "那些人，那些事",
    "老刘博客",
    "分享课件制作与网络生活",
    "安知鱼",
    "大佬们",
    "liublog.cn",
];
for (const c of checks) console.log(`  含[${c}]:`, html.includes(c));

const cardCount = (html.match(/target="_blank"/g) || []).length;
const logoCount = (html.match(/class="size-12 shrink-0 overflow-hidden rounded-full border bg-muted"/g) || []).length;
console.log("友链卡片数:", cardCount, "| logo 数:", logoCount);
