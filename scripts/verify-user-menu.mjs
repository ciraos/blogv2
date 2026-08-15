// 验证用户菜单：SSR 触发器 + 客户端内容代码
const BASE = "http://localhost:3126";
const html = (await (await fetch(`${BASE}/`)).text()).replace(/<!-- -->/g, "");

console.log("SSR 触发器按钮(aria-label=用户菜单):", html.includes("用户菜单"));
console.log("SSR 触发器含 User 图标:", html.includes("lucide-user") || /user/.test(html.substring(html.indexOf("用户菜单") - 200, html.indexOf("用户菜单"))));

// 客户端 chunk 是否包含下拉内容
const chunks = [...html.matchAll(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/g)].map((m) => m[1]);
let found = false;
for (const src of chunks) {
    const code = await (await fetch(`${BASE}${src}`)).text();
    if (code.includes("欢迎访问") && code.includes("bg-purple-500")) {
        found = true;
        console.log("客户端 chunk 含下拉内容(欢迎访问/紫色登录):", src.split("/").pop());
        console.log("  含注册按钮:", code.includes("注册"));
        console.log("  含退出登录(登录态):", code.includes("退出登录"));
        break;
    }
}
console.log("下拉内容已随客户端 bundle 加载:", found);
