// 验证移动端菜单与主容器内边距
const BASE = "http://localhost:3126";
const html = (await (await fetch(`${BASE}/`)).text()).replace(/<!-- -->/g, "");

console.log("桌面导航 hidden md:block:", html.includes("hidden md:block"));
console.log("移动汉堡按钮(打开菜单):", html.includes("打开菜单"));
console.log("主容器 px-4 sm:px-0:", html.includes("px-4 sm:px-0"));
console.log("菜单分组标题(文库)仍在:", html.includes("文库"));
