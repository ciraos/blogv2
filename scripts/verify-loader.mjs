// 验证 loader 居中
const html = (await (await fetch("http://localhost:3126/")).text()).replace(/<!-- -->/g, "");
console.log("居中容器 flex min-h-[50vh]:", html.includes("flex min-h-[50vh] w-full items-center justify-center"));
console.log("loader 元素:", html.includes('class="loader"'));
console.log("5 根 bar:", (html.match(/loader__bar/g) || []).length);
console.log("小球:", (html.match(/loader__ball/g) || []).length);
