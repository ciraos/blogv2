// 验证首页网格改为大屏 3 列
const html = (await (await fetch("http://localhost:3126/")).text()).replace(/<!-- -->/g, "");
console.log("网格 lg:grid-cols-3:", html.includes("grid gap-4 sm:grid-cols-2 lg:grid-cols-3"));
console.log("残留旧 2 列网格:", html.includes("grid gap-4 sm:grid-cols-2\">"));
