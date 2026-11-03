/**
 * 说说（essay）正文的「轻量 Markdown」解析。
 *
 * 为什么不用完整 Markdown / 第三方渲染器：
 *  - 说说卡片只有 300px 宽、13~14px 字号，标题/表格/代码块塞进去并不好看；
 *  - 卡片正文原来就是 `whitespace-pre-wrap` 的纯文本，换行必须原样保留；
 *  - 不引入新依赖、也不用 dangerouslySetInnerHTML，天然没有 XSS 面。
 *
 * 支持（就这几样，够日常发说说）：
 *   换行（原样保留）  **粗体**  *斜体*  ~~删除线~~  `行内代码`  [文字](链接)  ![说明](图片)
 * 不支持：标题、列表、引用、代码块、表格 —— 这些请发文章。
 */

export type EssayToken =
    | { type: "text"; value: string }
    | { type: "code"; value: string }
    | { type: "strong"; children: EssayToken[] }
    | { type: "em"; children: EssayToken[] }
    | { type: "del"; children: EssayToken[] }
    | { type: "link"; href: string; children: EssayToken[] }
    | { type: "image"; src: string; alt: string };

/** 只放行 http(s)、站内相对路径、锚点与 mailto，挡掉 javascript: 之类的伪协议 */
export function isSafeEssayUrl(url: string): boolean {
    const value = url.trim();
    if (!value) return false;
    if (/^(https?:)?\/\//i.test(value)) return true;
    if (value.startsWith("/") || value.startsWith("#")) return true;
    if (/^mailto:/i.test(value)) return true;
    return false;
}

// 逐段匹配的规则（都带 ^，配合「从当前位置开始」的扫描）
const RULES: { type: EssayToken["type"]; re: RegExp }[] = [
    { type: "code", re: /^`([^`\n]+)`/ },
    { type: "image", re: /^!\[([^\]]*)\]\(\s*([^)\s]+)\s*\)/ },
    { type: "link", re: /^\[([^\]]+)\]\(\s*([^)\s]+)\s*\)/ },
    { type: "strong", re: /^\*\*([\s\S]+?)\*\*/ },
    { type: "strong", re: /^__([\s\S]+?)__/ },
    { type: "del", re: /^~~([\s\S]+?)~~/ },
    { type: "em", re: /^\*([^*\n]+)\*/ },
    { type: "em", re: /^_([^_\n]+)_/ },
];

const MAX_DEPTH = 4;

/** 把一段说说正文切成 token 序列（纯函数，便于单测） */
export function parseEssayMarkdown(source: string, depth = 0): EssayToken[] {
    const text = source ?? "";
    if (!text) return [];
    if (depth > MAX_DEPTH) return [{ type: "text", value: text }];

    const tokens: EssayToken[] = [];
    let buffer = "";
    let i = 0;

    const flush = () => {
        if (buffer) {
            tokens.push({ type: "text", value: buffer });
            buffer = "";
        }
    };

    while (i < text.length) {
        const rest = text.slice(i);
        let matched = false;

        for (const rule of RULES) {
            const m = rule.re.exec(rest);
            if (!m) continue;
            matched = true;
            flush();
            i += m[0].length;

            if (rule.type === "code") {
                tokens.push({ type: "code", value: m[1] });
            } else if (rule.type === "image") {
                const src = m[2];
                if (isSafeEssayUrl(src)) tokens.push({ type: "image", src, alt: m[1] });
                else buffer += m[0];
            } else if (rule.type === "link") {
                const href = m[2];
                if (isSafeEssayUrl(href)) {
                    tokens.push({ type: "link", href, children: parseEssayMarkdown(m[1], depth + 1) });
                } else {
                    buffer += m[0];
                }
            } else {
                tokens.push({
                    type: rule.type as "strong" | "em" | "del",
                    children: parseEssayMarkdown(m[1], depth + 1),
                });
            }
            break;
        }

        if (!matched) {
            buffer += text[i];
            i += 1;
        }
    }

    flush();
    return tokens;
}
