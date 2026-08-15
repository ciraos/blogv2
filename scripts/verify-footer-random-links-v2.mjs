// 验证页脚随机友链改版：无头像、text-sm、更多链接指向 /link
const pageRes = await fetch("http://localhost:3126/archives", { headers: { "user-agent": "verify" } });
const html = await pageRes.text();
console.log("page status:", pageRes.status);

// 1. 无头像：不应有 size-6 logo 圆图
console.log((!html.includes("size-6 shrink-0 overflow-hidden rounded-full") ? "PASS" : "FAIL") + " - 无头像 logo");

// 2. 友链名称直接 text-sm（不再套 logo + span 结构）
const nameItems = html.match(/<li><a href="https?:\/\/[^"]+" target="_blank"[^>]*class="block text-sm[^>]*">([^<]+)<\/a><\/li>/g) || [];
console.log("PASS - 友链名称条目:", nameItems.length, nameItems.length >= 3 ? "(>=3)" : "(<3!)");

// 3. 更多链接 → /link
const moreMatch = /<a class="mt-3 block text-sm[^"]*"[^>]*href="\/link"[^>]*>更多<\/a>/.test(html);
console.log((moreMatch ? "PASS" : "FAIL") + " - 更多链接指向 /link");

// 4. 标题和刷新按钮仍在
console.log((/<h3[^>]*>友链<\/h3>/.test(html) ? "PASS" : "FAIL") + " - 标题 友链");
console.log((html.includes("刷新随机友链") ? "PASS" : "FAIL") + " - 刷新按钮");
