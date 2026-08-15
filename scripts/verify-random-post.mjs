// 验证 /random-post 随机文章跳转
const html = await (await fetch("http://localhost:3126/random-post")).text();
const m = html.match(/__next-page-redirect[^>]*/);
console.log("meta-refresh 标记:", m ? m[0].substring(0, 90) : "(无)");
const m2 = html.match(/url=([^"&]+)/);
console.log("跳转目标:", m2 ? decodeURIComponent(m2[1]) : "(无)");
console.log("跳转到文章详情页:", m2 && /\/posts\//.test(decodeURIComponent(m2[1])));
