// 验证 fcircle 刷新按钮 + toast + 代理路由
const pageRes = await fetch("http://localhost:3126/fcircle");
const html = await pageRes.text();
console.log("page status:", pageRes.status);

// 1. 刷新按钮（白底黑图标）
console.log((html.includes("手动刷新朋友圈") ? "PASS" : "FAIL") + " - 刷新按钮 aria-label");
console.log((/inline-flex size-6 items-center justify-center rounded border border-border bg-white text-black/.test(html) ? "PASS" : "FAIL") + " - 白底黑图标样式");

// 2. 上次抓取时间
console.log((html.includes("上次抓取更新：") ? "PASS" : "FAIL") + " - 上次抓取时间");

// 3. Toaster 挂在 blog 布局
console.log((html.includes("sonner") ? "PASS" : "FAIL") + " - Toaster(s)");

// 4. 代理路由未登录 → 401
const r = await fetch("http://localhost:3126/api/admin/moments/fetch", { method: "POST" });
const j = await r.json();
console.log((r.status === 401 ? "PASS" : "FAIL") + " - 触发路由未登录 401:", j.message);
