// 验证自研下拉导航 SSR
const html = (await (await fetch("http://localhost:3126/")).text()).replace(/<!-- -->/g, "");
console.log("li.relative 触发器容器:", html.includes('class="relative"'));
console.log("chevron 箭头:", html.includes("chevron-down"));
console.log("分组按钮 文库:", html.includes("文库"));
console.log("已无 NavigationMenu:", !html.includes("navigation-menu"));
console.log("面板定位类 top-full 已编译:", html.includes("top-full"));
