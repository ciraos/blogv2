// 模拟 ArticleBody 高亮逻辑，验证 hKw5 的代码块能正确高亮
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import markdown from "highlight.js/lib/languages/markdown";
import xml from "highlight.js/lib/languages/xml";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("css", css);

// 拉真实 content_html
const res = await fetch("https://blog.ciraos.top/api/public/articles/hKw5");
const j = await res.json();
const ch = j.data.content_html;

// 提取所有 language-xxx 代码块文本
const langs = [...ch.matchAll(/class="language-(\w+)"/g)].map((m) => m[1]);
console.log("代码块语言:", [...new Set(langs)]);

// 对每个语言代码块模拟高亮（取 code 内文本，转义还原）
const codeBlockRe = /<code class="language-(\w+)"[^>]*>.*?<span class="md-editor-code-block">([\s\S]*?)<\/span>/g;
let m, count = 0, ok = 0;
while ((m = codeBlockRe.exec(ch)) !== null) {
    count++;
    const lang = m[1];
    const raw = m[2]
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&#34;/g, '"');
    if (!hljs.getLanguage(lang)) continue;
    const { value } = hljs.highlight(raw, { language: lang, ignoreIllegals: true });
    const hasTokens = /hljs-(keyword|string|number|comment|title|attr|built_in)/.test(value);
    if (hasTokens) ok++;
    if (count <= 3) {
        console.log(`\n[${lang}] token 示例:`, value.slice(0, 120));
    }
}
console.log(`\n代码块 ${count} 个，成功高亮 ${ok} 个`);
