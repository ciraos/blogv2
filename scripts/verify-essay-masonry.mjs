// 验证 essay 瀑布流布局的 class 渲染
const html = (await (await fetch("http://localhost:3126/essay")).text()).replace(/<!-- -->/g, "");
const i = html.indexOf("break-inside-avoid");
console.log("外层容器 class:", JSON.stringify(html.substring(Math.max(0, i - 250), i + 20)));
const m = html.match(/columns-[^"\s]*/g);
console.log("columns 相关类:", m ? [...new Set(m)].join(" | ") : "(无)");
