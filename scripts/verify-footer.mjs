// 验证 footer 底部吸附
const html = (await (await fetch("http://localhost:3126/")).text()).replace(/<!-- -->/g, "");
console.log("CIRAOS flex min-h-dvh flex-col:", html.includes('id="CIRAOS" class="flex min-h-dvh flex-col"'));
console.log("main flex-1:", html.includes("flex flex-1"));
console.log("footer 仍在:", html.includes('id="footer"'));
