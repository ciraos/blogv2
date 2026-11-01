/**
 * 极简 Markdown → HTML（只用于「更新日志」的 Release 正文）。
 *
 * 为什么不引第三方 markdown 库：这份内容来自 GitHub Release，语法非常有限
 * （## 小标题、- 列表、**加粗**、`代码`、[链接](url)、--- 分隔线），
 * 而项目里现成的渲染器只有评论预览那套（客户端动态加载 @uiw/react-md-editor），
 * 为了十行文案拖一整个编辑器进更新日志页不划算。
 *
 * 安全口径：**先转义 HTML，再做行内替换**，所以输出里不可能出现用户提供的标签；
 * 链接只放行 http(s)，杜绝 javascript: 之类。渲染结果交给 dangerouslySetInnerHTML 是安全的。
 */

function escapeHtml(input: string): string {
    return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 行内格式：`code` → **bold** → [text](http url) */
function renderInline(input: string): string {
    let out = escapeHtml(input);
    out = out.replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">$1</code>');
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(
        /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer nofollow">$1</a>'
    );
    return out;
}

/** Markdown → HTML 字符串（块级：标题 / 列表 / 分隔线 / 段落） */
export function renderChangelogMarkdown(markdown: string): string {
    const lines = markdown.replace(/\r\n/g, "\n").split("\n");
    const html: string[] = [];
    let listTag: "ul" | "ol" | null = null;

    const closeList = () => {
        if (listTag) {
            html.push(`</${listTag}>`);
            listTag = null;
        }
    };
    const openList = (tag: "ul" | "ol") => {
        if (listTag === tag) return;
        closeList();
        html.push(`<${tag}>`);
        listTag = tag;
    };

    for (const raw of lines) {
        const line = raw.trim();
        if (!line) {
            closeList();
            continue;
        }

        // 续行：Release 正文里列表项经常在源码里换行（行首两个空格起），
        // 这些行属于上一个列表项/段落，不能另起一段，否则列表会被打散。
        if (/^\s{2,}\S/.test(raw) && html.length > 0 && /<\/(li|p)>$/.test(html[html.length - 1])) {
            html[html.length - 1] = html[html.length - 1].replace(/<\/(li|p)>$/, ` ${renderInline(line)}</$1>`);
            continue;
        }

        const heading = /^(#{1,4})\s+(.+)$/.exec(line);
        if (heading) {
            closeList();
            const level = Math.min(4, heading[1].length);
            html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
            continue;
        }

        if (/^-{3,}$/.test(line) || /^\*{3,}$/.test(line)) {
            closeList();
            html.push("<hr />");
            continue;
        }

        const bullet = /^[-*]\s+(.+)$/.exec(line);
        if (bullet) {
            openList("ul");
            html.push(`<li>${renderInline(bullet[1])}</li>`);
            continue;
        }

        const ordered = /^\d+\.\s+(.+)$/.exec(line);
        if (ordered) {
            openList("ol");
            html.push(`<li>${renderInline(ordered[1])}</li>`);
            continue;
        }

        closeList();
        html.push(`<p>${renderInline(line)}</p>`);
    }

    closeList();
    return html.join("\n");
}
