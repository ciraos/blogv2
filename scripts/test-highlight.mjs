// 验证 highlight.js 对真实文章代码的分词效果
const { default: hljs } = await import("highlight.js/lib/core");
const c = await import("highlight.js/lib/languages/c");
hljs.registerLanguage("c", c.default);

const j = await (await fetch("https://blog.ciraos.top/api/public/articles/gVrO")).json();
const html = j.data.content_html;
const m = html.match(/class="md-editor-code-block">([\s\S]*?)<\/span>/);
const raw = m
    ? m[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#34;/g, '"').replace(/&amp;/g, "&")
    : "";
console.log("提取代码:", JSON.stringify(raw));
const res = hljs.highlight(raw, { language: "c" });
console.log("高亮语言:", res.language, "| hljs token 数:", (res.value.match(/hljs-/g) || []).length);
console.log("token 输出:", res.value.substring(0, 250));
