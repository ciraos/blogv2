// 验证当前 dev server 是否包含代码块增强代码
const BASE = "http://localhost:3126";

const html = await (await fetch(`${BASE}/posts/gVrO`)).text();
console.log("SSR 含 md-editor-code:", html.includes("md-editor-code"));

const srcs = [...html.matchAll(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/g)].map((m) => m[1]);
console.log("页面 chunk 数:", srcs.length);

let found = false;
for (const src of srcs) {
    try {
        const code = await (await fetch(`${BASE}${src}`)).text();
        if (code.includes("code-copy-btn")) {
            found = true;
            console.log("含 code-copy-btn 的 chunk:", src);
            break;
        }
    } catch {}
}
console.log("增强代码已随服务加载:", found);
