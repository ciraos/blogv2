// 验证页脚随机友链：页面渲染 + 代理 route
// 1. 页面 /archives 应含 "友链" 标题 + 刷新按钮 + 随机友链名称
const pageRes = await fetch("http://localhost:3126/archives", { headers: { "user-agent": "verify" } });
const html = await pageRes.text();
console.log("page status:", pageRes.status);

const titleMatch = /<h3[^>]*>友链<\/h3>/.test(html);
console.log((titleMatch ? "PASS" : "FAIL") + " - 页脚标题 友链");
console.log((html.includes("aria-label=\"刷新随机友链\"") ? "PASS" : "FAIL") + " - 刷新按钮");
console.log((html.includes("animate-spin") ? "PASS" : "FAIL") + " - 刷新图标(RefreshCw)");

// 提取友链名称出现次数（排除项目组标题）
const names = html.match(/href="https?:\/\/[^"]+"[^>]*>\s*<span class="truncate[^"]*"[^>]*>([^<]+)<\/span>/g) || [];
console.log("PASS - 随机友链条目数(正则):", names.length, ">= 3?", names.length >= 3);

// 2. 代理 route /api/public/links/random?num=3
const proxyRes = await fetch("http://localhost:3126/api/public/links/random?num=3");
const proxy = await proxyRes.json();
console.log("proxy status:", proxyRes.status, "code:", proxy.code, "len:", proxy.data?.length);
console.log(proxy.data?.[0] ? "PASS - 代理返回友链: " + proxy.data[0].name : "FAIL - 代理无数据");

// 3. 友链应显示 3 条（randomFriends=3）
const linkBlocks = html.match(/<div class="size-6 shrink-0 overflow-hidden rounded-full border bg-muted">/g) || [];
console.log("PASS - 友链 logo 数量(正则):", linkBlocks.length, linkBlocks.length >= 3 ? "(>=3)" : "(<3!)");
