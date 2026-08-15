// 验证 header/main/footer 宽度对齐（max-w-300 = 1200px）
const html = (await (await fetch("http://localhost:3126/")).text()).replace(/<!-- -->/g, "");
console.log("header max-w-300:", html.includes('class="header w-full max-w-300'));
console.log("main max-w-300:", html.includes('class="main w-full max-w-300'));
console.log("footer max-w-300:", html.includes('class="footer w-full max-w-300'));
console.log("残留 max-w-264:", html.includes("max-w-264"));
console.log("残留 max-w-233:", html.includes("max-w-233"));
