// 验证所有页面使用统一页码分页
const BASE = "http://localhost:3126";

const pages = ["/", "/essay", "/archives?year=2026&month=4", "/categories?name=vscode", "/tags?name=vscode", "/fcircle"];
for (const p of pages) {
    const html = (await (await fetch(`${BASE}${p}`)).text()).replace(/<!-- -->/g, "");
    const hasNumbered = html.includes("bg-primary text-primary-foreground hover:bg-primary/90");
    const hasOld = html.includes(">1 / ");
    console.log(`${p.padEnd(30)} 页码分页: ${hasNumbered ? "✅" : "—"}  旧式残留: ${hasOld ? "❌" : "无"}`);
}
