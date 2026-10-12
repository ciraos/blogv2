/**
 * 正文短代码的「前端补参数」：把后端**收下但忽略**的参数补回成类名 / 块级容器 / data-*。
 *   - `{btn ...}`：layout / position / style / size / color → 类名与块级容器；
 *   - `{tip ...}`：theme / position / trigger / delay → 内容 span 的类名与 wrapper 上的 data-*。
 *
 * ── 为什么要在前端补（实测证据，2026-10-12 抓取线上 hKw5）───────────────────
 * `GET https://blog.ciraos.top/api/public/articles/hKw5`（updated_at=2026-10-12T04:29:14Z）：
 *   - content_md 里**代码区之外**共 26 条 `{btn ...}`，其中 style=outline 6 条、size=larger 3 条、
 *     layout=block 2 条（position=center 1、position=right 1；正文参数说明里那句「仅 layout=block 时有效」
 *     是纯文字，```markdown 代码块里的那几条只是文档示例）；
 *   - content_html 里 `btn-anzhiyu` 26 次（与可渲染短代码数**精确相等**）、`btn-outline` 6 次、
 *     `btn-larger` 3 次 → style / size 后端是支持的；
 *   - 但 `btn-container` **0 次** → layout / position 被完全忽略，块级按钮全被包在普通 `<p>` 里，
 *     「左 / 中 / 右」根本体现不出来（实测那三个锚点的外壳都是 `<p><a class="btn-anzhiyu" …></a></p>`）。
 * 后端与库里的正文都不改（也不该由前端去改内容），所以只在**渲染前**把 HTML 补一下。
 *
 * ── 三条硬约束（改这里之前先读）─────────────────────────────────────────────
 * 1) **顺序对齐**：短代码与 HTML 里的 `<a class="btn-anzhiyu">` 都按文档顺序出现，第 i 条短代码的参数
 *    只能喂给第 i 个锚点。后端产出的 HTML 里没有留下 layout/position 的任何痕迹（没有 data-*、没有注释），
 *    顺序是唯一可靠的对应关系；顺序一错就会把「居中」补到别的按钮上，比不补更糟。
 * 2) **对不上就整体放弃**：短代码条数 ≠ 锚点条数时一个字符都不改，并 console.warn 报出两个数量。
 *    会走到这条分支的现实场景：后端改了短代码渲染、正文里有别的 `btn-anzhiyu` 元素（标签链接等）、
 *    编辑器预览用的客户端渲染器压根不认 `{btn}`（见 article-form.tsx 里的说明）。宁可整篇保持原样
 *    （按钮退化成普通样式），也不能部分乱改——半篇居中半篇靠左的正文没人能排查，而渲染出去的 HTML 无法回滚。
 * 3) **幂等**：类名「已存在就不加」，容器「已经包在 .btn-container 里就不重复包」。后端哪天自己支持了
 *    layout/position，这里只会去补它**还缺**的那一个类（例如容器缺 btn-container-center），绝不出现
 *    双层容器或 `btn-outline btn-outline` 这类重复类名。
 *
 * ── `{tip ...}` 的证据（同一份 content_md / content_html，逐条实测）────────────────
 * content_md 正文里可渲染的 `{tip ...}` **14 条**，content_html 里 `.anzhiyu-tip-wrapper` 也正好 **14 个**
 * （```markdown 围栏里另有 14 条示例源码，一个 wrapper 都没产出——围栏里的短代码只是文本）。
 * 后端透传情况：
 *   - ✅ `trigger=click` → wrapper 上 `class="… tip-click" data-trigger="click"`（2 条都对）
 *   - ✅ `theme=light` → 内容 span 上 `tip-light`；`position=bottom` → `tip-bottom`
 *   - ❌ `theme=success/info/warning/error`、`position=left/right`、`delay=0/500` **全部丢失**：
 *     补丁前 `tip-success|tip-info|tip-warning|tip-error|tip-left|tip-right` 各 0 次、`tip-top` 0 次、
 *     `data-delay` 0 次。后果是四条主题 tip 全是黑底默认档、左右两条位置没变、快速/延迟两条都是 300ms。
 * 所以这里按 content_md 的参数把类名与 data-* 补回去；**显示/隐藏/延迟的机制**依旧全部在
 * CSS（src/app/globals.css:1818-1850）+ JS（article-body.tsx:enhanceTips）里，本模块不碰那两块。
 *
 * ── `{tip}` 的三条约束（与 `{btn}` 同源，但对应关系更弱一分：HTML 里连「哪条 tip 有 theme」都没留下）──
 * 1) **顺序对齐**：第 i 条 `{tip ...}` 的参数喂给第 i 个 `.anzhiyu-tip-wrapper`。后端产出的 wrapper 上
 *    没有留下 theme/position/delay 的任何痕迹，文档顺序是唯一可靠的对应关系。
 * 2) **对不上就整体放弃**：短代码数 ≠ wrapper 数、或某个 wrapper 里找不到 `.anzhiyu-tip` 内容 span（结构
 *    异常）时，一个字符都不改并 console.warn 报出数量。tip 比按钮更容易对不上（编辑器预览的客户端
 *    渲染器不认短代码、后端改了渲染都可能），部分乱补的后果是「成功档变黑底、点击档变悬停」这类
 *    没人能排查的错位，且渲染出去的 HTML 无法回滚。
 * 3) **幂等**：类名「已有就不加」、data-* 属性「已有（任意值）就不加」。后端哪天自己开始透传 theme/position，
 *    这里只会补它**还缺**的那几个：不会出现 `tip-light tip-light`，也不会出现两个 `data-trigger`。
 *    注意 theme 的默认档 dark 与显式 theme 共用同一套类名：**只按实际生效的那一档加一个类**即可，
 *    绝不同时加 `tip-dark` 和 `tip-light`——globals.css 里 `.tip-dark`(:not(:has(.tip-content))) 排在
 *    `.tip-light`(:not(:has(.tip-content))) 之后，同时存在会让浅色那条被深色规则盖成黑底。
 *
 * CSS 一行都不用改：src/app/globals.css 里已按官方补齐 `.article-body .btn-container`（flex +
 * `-center` / `-right`）、`.btn-anzhiyu`、`.btn-outline`、`.btn-larger`、颜色档变量与「未给颜色回落主题色」，
 * 同样也备好了 `.article-body .anzhiyu-tip*` 六档配色与四个方向（:1818-1975），
 * 本模块只负责把类名 / 容器 / data-* 补成那些选择器认得的样子。
 *
 * 纯函数、零依赖：服务端（(blog)/posts/[id]/page.tsx）与客户端（编辑器预览 article-form.tsx）共用同一份实现，
 * 也方便 scripts/ 下的单测用 node 直跑（node 的类型剥离只吃「可擦除」语法，所以这里不用 enum / 装饰器 / 命名空间）。
 */

/** `{btn ...}` 支持且本模块会消费的参数（官方格式：值里不含空格，参数之间用空白分隔） */
const BTN_PARAM_KEYS = ["url", "text", "icon", "color", "style", "layout", "position", "size"] as const;

/** 一条 `{btn ...}` 短代码（没写的参数不出现） */
export interface BtnShortcode {
    url?: string;
    text?: string;
    icon?: string;
    color?: string;
    style?: string;
    layout?: string;
    position?: string;
    size?: string;
    /** 在 content_md 里的起始下标（0 基），仅用于测试 / 排查，不参与渲染 */
    at: number;
}

/**
 * 文档示例里的中文占位值。
 * 官方文档的示例写法是 `{btn url=链接地址 text=按钮文字 …}`——那是「参数怎么写」的说明，不是真按钮。
 * 文章里这种示例通常躺在代码块里（已被 maskCodeRegions 干掉），但万一作者写在正文里，也不该在页面上
 * 多出一个指向「链接地址」的按钮（那还会让两边数量对不上、整篇放弃补丁）。
 * 只在 url / text 上判占位：真按钮完全可能叫「颜色」之类，但不可能把 url 写成「链接地址」。
 */
const PLACEHOLDER_VALUES = new Set([
    "链接地址",
    "按钮文字",
    "图标类名",
    "颜色",
    "样式",
    "布局",
    "位置",
    "大小",
    "图片地址",
    "图片链接",
]);

/** 单个编辑动作：[start, end) 换成 text */
interface Edit {
    start: number;
    end: number;
    text: string;
}

/** class 属性：类名列表 + 属性**值**的下标范围（改类名只需替换这个区间） */
interface ClassAttr {
    classes: string[];
    value: { start: number; end: number };
}

/** HTML 里的一个按钮锚点（后端真正渲染出来的 `<a class="btn-anzhiyu …">…</a>`） */
interface ButtonAnchor {
    /** `<a` 的起始下标 */
    start: number;
    /** `</a>` 之后的下标 */
    end: number;
    /** 开标签 `>` 之后的下标 */
    tagEnd: number;
    /** 开标签上的 class 属性 */
    classAttr: ClassAttr;
}

/** 把 [start, end) 区间的字符换成空格（保留换行与总长度，让下标与原文 1:1 对应） */
function blank(chars: string[], start: number, end: number): void {
    for (let i = start; i < end; i++) {
        if (chars[i] !== "\n" && chars[i] !== "\r") chars[i] = " ";
    }
}

/**
 * 把 Markdown 里「代码区」的字符换成空格，其它原样保留（长度不变 → 下标可直接用于原文）。
 *
 * 为什么必须跳过代码区：这篇文章的 `{btn` 一共 42 处，其中 16 处在 ```markdown 围栏里（示例源码），
 * 真正渲染成按钮的只有 26 处。不跳过就会把文档示例当成真按钮 → 两边数量对不上 →（按约束 2）整篇放弃补丁，
 * 功能等于没做。围栏支持 ``` 与 ~~~（含更长的围栏、最多 3 空格缩进），行内 code 用等长反引号配对。
 */
function maskCodeRegions(md: string): string {
    const chars = md.split("");

    // ① 围栏代码块：整行屏蔽（含围栏行本身）——顺带保证围栏里的反引号不会干扰下一步的行内 code 扫描
    let offset = 0;
    let fence: string | null = null;
    for (const line of md.split("\n")) {
        const lineStart = offset;
        offset += line.length + 1; // +1 = 换行符
        const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line);
        if (fenceMatch) {
            if (!fence) fence = fenceMatch[1];
            // 收尾围栏：同种字符且不短于开栏（CommonMark 规则）
            else if (fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null;
            blank(chars, lineStart, lineStart + line.length);
            continue;
        }
        if (fence) blank(chars, lineStart, lineStart + line.length);
    }

    // ② 行内 code：成对的等长反引号之间全部屏蔽（`` `{btn …}` `` 就是行内示例）
    const masked = chars.join("");
    const runRe = /`+/g;
    let open: { start: number; length: number } | null = null;
    let m: RegExpExecArray | null;
    while ((m = runRe.exec(masked))) {
        if (!open) {
            open = { start: m.index, length: m[0].length };
        } else if (m[0].length === open.length) {
            blank(chars, open.start, m.index + m[0].length);
            open = null;
        }
    }

    return chars.join("");
}

/**
 * 解析 `{btn` 与 `}` 之间的参数串（未知参数忽略；值可带引号，引号内允许空格）。
 * 键的取值表当参数传进来，将来加短代码时可以复用同一套正则。
 */
function parseParams(body: string, keys: readonly string[]): Record<string, string> {
    const raw: Record<string, string> = {};
    const re = /([A-Za-z][A-Za-z0-9_-]*)\s*=\s*("[^"]*"|'[^']*'|[^\s}]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) {
        const key = m[1].toLowerCase();
        if (!keys.includes(key)) continue;
        raw[key] = m[2].replace(/^["']|["']$/g, "");
    }
    const params: Record<string, string> = {};
    for (const key of keys) {
        const value = raw[key];
        // 空值（`theme=`）当没写：空字符串拼不出有效类名，也避免把 `data-delay=""` 塞进 HTML
        if (value) params[key] = value;
    }
    return params;
}

/** 是不是「文档占位示例」（url / text 写成了中文占位词）→ 不该渲染成真按钮 */
function isPlaceholderExample(params: Record<string, string>): boolean {
    return (
        (params.url !== undefined && PLACEHOLDER_VALUES.has(params.url)) ||
        (params.text !== undefined && PLACEHOLDER_VALUES.has(params.text))
    );
}

/**
 * 按文档顺序解析正文里**可渲染**的 `{btn …}`（跳过围栏代码块与行内 code，排除中文占位示例）。
 * 同时支持单标签 `{btn …}` 与成对写法 `{btn …}{/btn}`：成对写法的收尾标签只是语法，不产生第二个按钮。
 */
export function parseBtnShortcodes(contentMd: string): BtnShortcode[] {
    const masked = maskCodeRegions(contentMd);
    const result: BtnShortcode[] = [];
    // 每次新建正则：模块级带 g 的正则带 lastIndex 状态，多次调用会串味
    const re = /\{btn\b([^}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(masked))) {
        const params = parseParams(m[1], BTN_PARAM_KEYS);
        if (isPlaceholderExample(params)) continue;
        result.push({ ...params, at: m.index });
    }
    return result;
}

/** 读取开标签上的 class 属性（类名列表 + 属性值的下标范围）；没有 class 属性时返回 null */
function readClassAttr(html: string, tagStart: number, tagEnd: number): ClassAttr | null {
    const tag = html.slice(tagStart, tagEnd);
    const m = /\sclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    if (!m) return null;
    const quoted = m[1] !== undefined ? m[1] : (m[2] ?? "");
    const valueStart = tagStart + m.index + m[0].length - quoted.length - 1;
    return { classes: quoted.split(/\s+/).filter(Boolean), value: { start: valueStart, end: valueStart + quoted.length } };
}

/**
 * 正文 HTML 里的代码区（`<pre>` / `<code>` 及其嵌套）区间，供「跳过代码区」复用。
 *
 * 为什么不用 `/<(pre|code)\b[^>]*>[\s\S]*?<\/\1\s*>/g` 这种懒匹配正则：后端产出的代码块是
 * `<details><summary>…</summary><pre><code>…</code></pre></details>`，**几乎每个 `<pre>` 里都嵌着
 * 一个 `<code>`**。正则从第一个 `<pre>` 开始找最近的 `</pre>`，只要两者之间先出现 `</code>`，
 * `\1` 就永远匹配不上 → 正则引擎继续往后找下一个 `</pre>`（在很远的代码块里），于是**第一个代码块
 * 到很远的某个代码块之间的一切（含按钮等短代码渲染结果）都被当成「在代码区里」**。
 * 实测 hKw5：旧写法只剩 1 段区间却把大半个正文吞掉（代码区之外的锚点会被误判成「在代码里」）。
 * 所以这里改成栈式扫描：对 `<pre>` 与 `<code>` 各自维护「还有几个没闭合」，任一 > 0 就算在代码区。
 */
function collectCodeRanges(html: string): Array<[number, number]> {
    const ranges: Array<[number, number]> = [];
    const tokenRe = /<(\/?)(pre|code)\b[^>]*?(\/?)>/gi;
    const stack: Array<{ tag: string; start: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = tokenRe.exec(html))) {
        const tag = m[2].toLowerCase();
        if (m[1] !== "/") {
            if (m[3] === "/") continue; // `<code/>` 这类空元素不进入代码区
            stack.push({ tag, start: m.index });
            continue;
        }
        // 闭合标签：弹出最近的同名未闭合标签（正常的 pre/code 嵌套下就是栈顶）
        const at = stack.map((o) => o.tag).lastIndexOf(tag);
        if (at === -1) continue; // 多余的闭合标签：忽略
        const from = stack[at].start;
        stack.length = at;
        if (stack.length === 0) ranges.push([from, m.index + m[0].length]); // 最外层代码区结束
    }
    return ranges;
}

/** 按文档顺序找出正文 HTML 里的按钮锚点（跳过 `<pre>` / `<code>` 内的同名锚点） */
function findButtonAnchors(html: string): ButtonAnchor[] {
    // 代码区一次性算好：正文 HTML 里代码块很多（这篇文章 68KB），逐个锚点重复扫描没必要
    const codeRanges = collectCodeRanges(html);
    const inCode = (pos: number) => codeRanges.some(([s, e]) => pos >= s && pos < e);

    const anchors: ButtonAnchor[] = [];
    const anchorRe = /<a\b[^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = anchorRe.exec(html))) {
        const tagStart = m.index;
        const tagEnd = tagStart + m[0].length;
        if (inCode(tagStart)) continue;
        const classAttr = readClassAttr(html, tagStart, tagEnd);
        if (!classAttr || !classAttr.classes.includes("btn-anzhiyu")) continue;
        const closeAt = html.indexOf("</a>", tagEnd);
        if (closeAt === -1) continue;
        anchors.push({ start: tagStart, end: closeAt + 4, tagEnd, classAttr });
    }
    return anchors;
}

/** 正文 HTML 里**真正渲染出来**的按钮个数（页面自检与单测用） */
export function countButtonAnchors(contentHtml: string): number {
    return findButtonAnchors(contentHtml).length;
}

/**
 * 找按钮外面那层 `.btn-container`（后端将来自己产出容器时，用来判「已经包过了」）。
 * 只看最近的、还没闭合的 `<div`：正文 HTML 由渲染器产出，div 不会互相交错，所以「最近的未闭合 <div>」
 * 就是父级。判断错方向也只会少补一次（保持原样），绝不会多包一层。
 */
function findEnclosingContainer(html: string, pos: number): ClassAttr | null {
    const openAt = html.lastIndexOf("<div", pos);
    if (openAt === -1) return null;
    if (html.lastIndexOf("</div>", pos) > openAt) return null;
    const tagEnd = html.indexOf(">", openAt);
    if (tagEnd === -1 || tagEnd > pos) return null;
    const classAttr = readClassAttr(html, openAt, tagEnd + 1);
    if (!classAttr || !classAttr.classes.includes("btn-container")) return null;
    return classAttr;
}

/**
 * 锚点是否独占一个 `<p>`。独占时可以把整个 `<p>` 换成 `<div class="btn-container">`：
 * 容器是 `display:flex`，只有锚点是它的**直接** flex item 时 justify-content 才管用；若留着 `<p>` 包住锚点，
 * `<p>` 会被拉满整行，左 / 中 / 右依旧看不出来（这正是后端现在的问题）。
 */
function findParagraphOnlyRange(html: string, anchor: ButtonAnchor): { start: number; end: number } | null {
    // 注意 "<p" 是 "<pre" 的前缀：必须确认下一个字符是 ">" 或空白，否则会把 <pre> 当成段落
    let openAt = html.lastIndexOf("<p", anchor.start);
    while (openAt !== -1 && !/^<p[\s>]/.test(html.slice(openAt, openAt + 3))) {
        openAt = html.lastIndexOf("<p", openAt - 1);
    }
    if (openAt === -1) return null;
    const tagEnd = html.indexOf(">", openAt);
    if (tagEnd === -1 || tagEnd > anchor.start) return null;
    // <p> 开标签与锚点之间只能是空白
    if (html.slice(tagEnd + 1, anchor.start).trim() !== "") return null;
    const closeAt = html.indexOf("</p>", anchor.end);
    if (closeAt === -1) return null;
    // 锚点与 </p> 之间也只能是空白（多个按钮挤在同一个 <p> 里时这里不成立 → 走行内兜底）
    if (html.slice(anchor.end, closeAt).trim() !== "") return null;
    return { start: openAt, end: closeAt + 4 };
}

/**
 * 颜色值 → 类名后缀。
 * CSS 里只定义了命名颜色档（btn-blue / btn-pink / btn-red / btn-purple / btn-orange / btn-green，
 * 以及 anheyu 原生写法 color-*）；十六进制之类的值没有对应类名——硬拼 `btn-#409eff` 是无效类名，
 * 所以只接受「字母开头的普通标识符」，其余一律不加（宁可不加，也不往 class 里塞垃圾）。
 */
function colorClassSuffix(color: string): string | null {
    const value = color.trim().toLowerCase();
    return /^[a-z][a-z0-9-]*$/.test(value) ? value : null;
}

/** class 属性值 + 要追加的类名（去重、单空格分隔，原有顺序保持不变） */
function mergeClasses(current: string, added: string[]): string {
    const classes = current.split(/\s+/).filter(Boolean);
    for (const name of added) {
        if (!classes.includes(name)) classes.push(name);
    }
    return classes.join(" ");
}

/** 把追加的类名应用到锚点的开标签上（只在「整段替换成容器」这条路径里用得到） */
function patchTag(html: string, anchor: ButtonAnchor, added: string[]): string {
    const tag = html.slice(anchor.start, anchor.tagEnd);
    if (added.length === 0) return tag;
    const at = anchor.classAttr.value.start - anchor.start;
    const len = anchor.classAttr.value.end - anchor.classAttr.value.start;
    return tag.slice(0, at) + mergeClasses(tag.slice(at, at + len), added) + tag.slice(at + len);
}

/** 应用编辑（按下标升序拼接）；出现区间重叠说明判断有误 → 返回 null 让调用方整体放弃 */
function applyEdits(html: string, edits: Edit[]): string | null {
    if (edits.length === 0) return html;
    const sorted = [...edits].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].start < sorted[i - 1].end) return null;
    }
    let out = "";
    let cursor = 0;
    for (const e of sorted) {
        out += html.slice(cursor, e.start) + e.text;
        cursor = e.end;
    }
    return out + html.slice(cursor);
}

/**
 * 把 `content_md` 里短代码的参数补到 `content_html` 上（服务端文章页与编辑器预览共用）。
 *
 * 「可渲染短代码数 === HTML 按钮数」不成立、或编辑区间重叠时，**原样返回 contentHtml**
 * （并 console.warn 说明原因），绝不部分应用——理由见文件头约束 2。
 */
export function patchArticleButtons(contentMd: string, contentHtml: string): string {
    if (!contentHtml) return contentHtml;
    // 拿不到 Markdown 原文就没法做「顺序对齐」（HTML 里没有留下 layout/position 的痕迹）→ 原样透传，不猜
    if (!contentMd) return contentHtml;

    const anchors = findButtonAnchors(contentHtml);
    const shortcodes = parseBtnShortcodes(contentMd);

    // 绝大多数文章没有 {btn}：两边都是 0 → 直接返回，不做后续编辑工作
    if (anchors.length === 0 && shortcodes.length === 0) return contentHtml;

    if (anchors.length !== shortcodes.length) {
        console.warn(
            `[article-shortcodes] {btn} 短代码 ${shortcodes.length} 条与正文 HTML 里的按钮 ${anchors.length} 个对不上，` +
                "本次不补任何参数（正文按后端原样渲染）"
        );
        return contentHtml;
    }

    const edits: Edit[] = [];
    // 多个锚点可能共用一个容器：按 class 值的区间合并，避免同一区间产生两个编辑而被误判成「重叠」
    const containerEdits = new Map<string, { attr: ClassAttr; classes: string[] }>();
    /** 给容器补上还缺的对齐档（幂等：已经有了就不加；同一容器被多个按钮共用时也只加一次） */
    const addContainerPosition = (attr: ClassAttr, position: "center" | "right" | null) => {
        if (!position) return;
        const wanted = `btn-container-${position}`;
        const key = `${attr.value.start}:${attr.value.end}`;
        const pending = containerEdits.get(key) ?? { attr, classes: [...attr.classes] };
        if (!pending.classes.includes(wanted)) pending.classes.push(wanted);
        containerEdits.set(key, pending);
    };

    for (let i = 0; i < anchors.length; i++) {
        const anchor = anchors[i];
        const sc = shortcodes[i];

        // ── 类名：style / size / color（幂等：后端已经给过的任一写法都认）──
        const added: string[] = [];
        if (sc.style === "outline" && !anchor.classAttr.classes.includes("btn-outline") && !anchor.classAttr.classes.includes("style-outline")) {
            added.push("btn-outline");
        }
        if (sc.size === "larger" && !anchor.classAttr.classes.includes("btn-larger") && !anchor.classAttr.classes.includes("size-larger")) {
            added.push("btn-larger");
        }
        if (sc.color) {
            const suffix = colorClassSuffix(sc.color);
            if (suffix && !anchor.classAttr.classes.includes(`btn-${suffix}`) && !anchor.classAttr.classes.includes(`color-${suffix}`)) {
                added.push(`btn-${suffix}`);
            }
        }

        // ── 块级布局：layout=block → 外面包一层 .btn-container（左=默认档 / 中 / 右）──
        const position = sc.position === "center" || sc.position === "right" ? sc.position : null;
        const containerClass = `btn-container${position ? ` btn-container-${position}` : ""}`;
        const isBlock = sc.layout === "block";
        const enclosing = isBlock ? findEnclosingContainer(contentHtml, anchor.start) : null;
        const alreadyBlockClass = anchor.classAttr.classes.includes("layout-block");
        const paragraph = isBlock && !alreadyBlockClass ? findParagraphOnlyRange(contentHtml, anchor) : null;

        if (paragraph) {
            const inner = contentHtml.slice(anchor.tagEnd, anchor.end - 4);
            const tag = patchTag(contentHtml, anchor, added);
            if (enclosing) {
                // 后端将来若产出 <div class="btn-container"><p><a …></a></p></div>（容器有了、<p> 还留着）：
                // 那层 <p> 会把按钮拉满整行、flex 对齐失效，所以这里只去掉 <p> 让锚点成为容器的直接子元素，
                // 容器本身不重复包（幂等），顺手补上还缺的对齐档。
                edits.push({ start: paragraph.start, end: paragraph.end, text: `${tag}${inner}</a>` });
                addContainerPosition(enclosing, position);
            } else {
                // 独占段落 + 还没有容器：整段换成容器 div（容器必须是锚点的直接父级，flex 对齐才生效）
                edits.push({ start: paragraph.start, end: paragraph.end, text: `<div class="${containerClass}">${tag}${inner}</a></div>` });
            }
            continue;
        }

        if (enclosing) {
            // 后端将来自己产出容器：只补容器上还缺的对齐档，绝不重复包裹
            addContainerPosition(enclosing, position);
        } else if (isBlock && !alreadyBlockClass) {
            // 行内上下文（<p> 里还有别的文字）：<div> 不能塞进 <p>，退回 CSS 已支持的「类名加在按钮上」写法
            added.push("layout-block");
            if (position && !anchor.classAttr.classes.includes(`position-${position}`)) added.push(`position-${position}`);
        } else if (isBlock && position && !anchor.classAttr.classes.includes(`position-${position}`)) {
            // 按钮上已有 layout-block、只是缺 position-*：补上
            added.push(`position-${position}`);
        }

        if (added.length > 0) {
            edits.push({
                start: anchor.classAttr.value.start,
                end: anchor.classAttr.value.end,
                text: mergeClasses(contentHtml.slice(anchor.classAttr.value.start, anchor.classAttr.value.end), added),
            });
        }
    }

    for (const pending of containerEdits.values()) {
        edits.push({ start: pending.attr.value.start, end: pending.attr.value.end, text: pending.classes.join(" ") });
    }

    const patched = applyEdits(contentHtml, edits);
    if (patched === null) {
        console.warn("[article-shortcodes] 补丁区间出现重叠，本次不做任何修改（正文按后端原样渲染）");
        return contentHtml;
    }
    return patched;
}

/* ══════════════════════════════ `{tip ...}` ══════════════════════════════════ */

/** `{tip ...}` 支持且本模块会消费的参数（官方格式：值里不含空格，参数之间用空白分隔；text/content 可带引号） */
const TIP_PARAM_KEYS = ["text", "content", "theme", "position", "trigger", "delay"] as const;

/**
 * 官方规范表的默认值（文档参数表 + scripts/theme/.../callout-block.tsx:276-283）：
 * theme=dark、position=top、trigger=hover、delay=300（300 由 CSS 兜底，见下面的 delay 说明）。
 */
const TIP_DEFAULT_THEME = "dark";
const TIP_DEFAULT_POSITION = "top";
/** delay 的上限：JS（enhanceTips）与补丁两边用同一个阈值，避免一边认一边不认 */
const TIP_MAX_DELAY = 60000;

/** 只有这六档有 CSS（globals.css:1895-1925）；拼一个没定义的 `tip-purple` 是无效类名，宁可不加、回落默认档 */
const TIP_THEMES = new Set(["dark", "light", "info", "warning", "error", "success"]);
/** 四个方向（globals.css:1927-1953） */
const TIP_POSITIONS = new Set(["top", "bottom", "left", "right"]);

/** 自闭合标签：不压栈（否则 `<img>` 这类空元素会让「wrapper 什么时候闭合」永远判断不出来） */
const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

/** 一条 `{tip ...}` 短代码（没写的参数不出现） */
export interface TipShortcode {
    /** 悬停/点击时显示的那段文字（wrapper 里的 `.anzhiyu-tip-text`） */
    text?: string;
    /** 提示框里的内容（wrapper 里的 `.anzhiyu-tip`） */
    content?: string;
    theme?: string;
    position?: string;
    trigger?: string;
    /** 只在写了合法整数（0..60000）时才出现；**没写就不出现** = 用 CSS 里的 300ms 默认档 */
    delay?: number;
    /** 在 content_md 里的起始下标（0 基），仅用于测试 / 排查，不参与渲染 */
    at: number;
}

/** HTML 里的一个 tip 容器（后端渲染出来的 `<span class="anzhiyu-tip-wrapper …">…</span>`） */
interface TipElement {
    /** wrapper 开标签 `/` 的起始下标 */
    tagStart: number;
    /** wrapper 开标签 `>` 之后的下标 */
    tagEnd: number;
    /** 内容 span `.anzhiyu-tip` 的 class 属性（theme / position 类名要加在这上面） */
    tipClassAttr: ClassAttr;
}

/**
 * 解析 delay 参数：只接受 0..60000 的**纯十进制整数**。
 * 写成 `-1` / `1.5` / `1e3` / `abc` / 超出上限一律当「没写」（回落 CSS 的 300ms 默认档），
 * 不猜作者的意图——`setTimeout(NaN)` 那类静默改行为的事故不值得为一条提示去冒。
 */
function parseTipDelay(raw: string | undefined): number | undefined {
    if (raw === undefined || !/^\d+$/.test(raw)) return undefined;
    const value = Number.parseInt(raw, 10);
    return value <= TIP_MAX_DELAY ? value : undefined;
}

/**
 * 按文档顺序解析正文里**可渲染**的 `{tip …}`（跳过围栏代码块与行内 code）。
 * 同时支持单标签 `{tip …}` 与成对写法 `{tip …}{/tip}`：收尾标签（`{/tip}`）不匹配 `\{tip\b`，天然只算一条。
 *
 * 与 `{btn}` 不同，这里**不排除**中文占位示例（`text=提示文本` 之类）：后端对 `{tip}` 不做任何占位过滤，
 * 正文里写一条就一定会渲染出一个 wrapper；前端擅自排除只会让两边数量对不上、整篇放弃补丁。
 */
export function parseTipShortcodes(contentMd: string): TipShortcode[] {
    const masked = maskCodeRegions(contentMd);
    const result: TipShortcode[] = [];
    // 每次新建正则：模块级带 g 的正则带 lastIndex 状态，多次调用会串味
    const re = /\{tip\b([^}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(masked))) {
        const params = parseParams(m[1], TIP_PARAM_KEYS);
        // parseParams 已把空值（`theme=`）当没写，所以这里的 `if` 等价于「参数存在」
        const tip: TipShortcode = { at: m.index };
        if (params.text) tip.text = params.text;
        if (params.content) tip.content = params.content;
        if (params.theme) tip.theme = params.theme;
        if (params.position) tip.position = params.position;
        if (params.trigger) tip.trigger = params.trigger;
        const delay = parseTipDelay(params.delay);
        if (delay !== undefined) tip.delay = delay;
        result.push(tip);
    }
    return result;
}

/**
 * 在 wrapper 的开标签之后，找**直接子级**里那个 `.anzhiyu-tip` 内容 span 的 class 属性。
 *
 * 为什么用「标签栈配对」而不是 `/anzhiyu-tip-wrapper.*?anzhiyu-tip/` 这类懒匹配：wrapper 里第一个
 * `<span>` 是 `.anzhiyu-tip-text`，懒匹配会把它的类名当成目标；而且没有任何边界能保证不越到
 * **下一个** wrapper 里（那会把别人的参数补到自己身上）。这里按标签栈走：栈空时遇到的第一个开标签
 * 就是直接子级——不是 `.anzhiyu-tip` 就继续；一旦栈空时遇到闭合标签，说明 wrapper 已经结束 → 返回 null
 * （结构异常，调用方整体放弃）。
 */
function findInnerTipClass(html: string, wrapperTagEnd: number): ClassAttr | null {
    const tokenRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g;
    tokenRe.lastIndex = wrapperTagEnd;
    const stack: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = tokenRe.exec(html))) {
        const name = m[2].toLowerCase();
        if (m[1] === "/") {
            if (stack.length === 0) return null; // wrapper 自己闭合了 → 里面没有 .anzhiyu-tip
            const at = stack.lastIndexOf(name);
            if (at === -1) continue; // 多余的闭合标签：忽略
            stack.length = at;
            continue;
        }
        if (m[3] === "/" || VOID_TAGS.has(name)) continue; // 空元素：不压栈、也不可能是内容 span
        const tagEnd = m.index + m[0].length;
        if (stack.length === 0) {
            const classAttr = readClassAttr(html, m.index, tagEnd);
            if (classAttr && classAttr.classes.includes("anzhiyu-tip")) return classAttr;
        }
        stack.push(name);
    }
    return null;
}

/**
 * 按文档顺序找出正文 HTML 里的 tip 容器（跳过 `<pre>` / `<code>` 内的同名容器），
 * 并顺带统计「结构异常」（class 里写着 anzhiyu-tip-wrapper，但里面没有 .anzhiyu-tip 内容 span）的个数。
 */
function findTipElements(html: string): { elements: TipElement[]; broken: number } {
    // 代码区一次性算好：正文 HTML 里代码块很多（这篇文章 68KB），逐个容器重复扫描没必要
    const codeRanges = collectCodeRanges(html);
    const inCode = (pos: number) => codeRanges.some(([s, e]) => pos >= s && pos < e);

    const elements: TipElement[] = [];
    let broken = 0;
    const openRe = /<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g;
    let m: RegExpExecArray | null;
    while ((m = openRe.exec(html))) {
        const tagStart = m.index;
        const tagEnd = tagStart + m[0].length;
        if (m[0].endsWith("/>")) continue; // 自闭合标签不可能是容器
        if (inCode(tagStart)) continue;
        const classAttr = readClassAttr(html, tagStart, tagEnd);
        if (!classAttr || !classAttr.classes.includes("anzhiyu-tip-wrapper")) continue;
        const tipClassAttr = findInnerTipClass(html, tagEnd);
        if (!tipClassAttr) {
            broken++;
            continue;
        }
        elements.push({ tagStart, tagEnd, tipClassAttr });
    }
    return { elements, broken };
}

/** 正文 HTML 里**真正渲染出来**的 tip 容器个数（页面自检与单测用） */
export function countTipWrappers(contentHtml: string): number {
    return findTipElements(contentHtml).elements.length;
}

/**
 * 把一个 `{tip …}` 的参数映射成它实际生效的那一档（无效值一律回落默认档——CSS 里只有这些档位有样式，
 * 拼 `tip-purple` 这种没定义的类名等于没补，还会污染 class）。
 */
function resolveTipTheme(theme: string | undefined): string {
    const value = theme?.trim().toLowerCase() ?? "";
    return TIP_THEMES.has(value) ? value : TIP_DEFAULT_THEME;
}

function resolveTipPosition(position: string | undefined): string {
    const value = position?.trim().toLowerCase() ?? "";
    return TIP_POSITIONS.has(value) ? value : TIP_DEFAULT_POSITION;
}

/**
 * 把 `content_md` 里 `{tip …}` 的参数补到 `content_html` 上（服务端文章页与编辑器预览共用）。
 *
 * 具体只做三件事（其余一概不动）：
 *   ① 内容 span `.anzhiyu-tip` 补 `tip-{theme}` 与 `tip-{position}`（幂等：已有同类名不加）；
 *   ② `trigger=click` → wrapper 开标签补 `data-trigger="click"`（wrapper 上已有任意 data-trigger 就不加）——
 *      必须写在 **wrapper** 上：globals.css 的 hover 档选择器是
 *      `.anzhiyu-tip-wrapper:not([data-trigger="click"]):hover`，写在内容 span 上排除不掉 hover；
 *   ③ 写了合法 `delay` → wrapper 补 `data-delay="N"`（已有就不加）；没写就不写，由 CSS 的 300ms 兜底。
 *
 * 「短代码数 === wrapper 数」不成立、有容器结构异常、或编辑区间重叠时，**原样返回 contentHtml**
 * （并 console.warn 说明原因），绝不部分应用——理由见文件头 `{tip}` 约束 2。
 */
export function patchArticleTips(contentMd: string, contentHtml: string): string {
    if (!contentHtml) return contentHtml;
    // 拿不到 Markdown 原文就没法做「顺序对齐」（HTML 里没有留下 theme/position/delay 的痕迹）→ 原样透传，不猜
    if (!contentMd) return contentHtml;

    const { elements, broken } = findTipElements(contentHtml);
    const shortcodes = parseTipShortcodes(contentMd);

    // 绝大多数文章没有 {tip}：两边都是 0 → 直接返回，不做后续编辑工作
    if (elements.length === 0 && shortcodes.length === 0 && broken === 0) return contentHtml;

    if (broken > 0 || elements.length !== shortcodes.length) {
        console.warn(
            `[article-shortcodes] {tip} 短代码 ${shortcodes.length} 条与正文 HTML 里的 tip 容器 ${elements.length} 个对不上` +
                (broken > 0 ? `（另有 ${broken} 个容器结构异常，里面找不到 .anzhiyu-tip 内容 span）` : "") +
                "，本次不补任何参数（正文按后端原样渲染）"
        );
        return contentHtml;
    }

    const edits: Edit[] = [];
    /** wrapper 上要补的 data-*（同一个 wrapper 的多个属性合成一次插入，避免同一位置产生两个编辑） */
    const wrapperAttrs = new Map<number, string[]>();

    for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const sc = shortcodes[i];
        const tag = contentHtml.slice(el.tagStart, el.tagEnd);

        // ① 内容 span 的类名：theme / position 的默认档（dark / top）也要显式补上——
        //    `.anzhiyu-tip` 是 position:absolute 但没有 top/left 偏移，缺了 `tip-top` 就停在文字旁边而不是上方。
        const added: string[] = [];
        const themeClass = `tip-${resolveTipTheme(sc.theme)}`;
        const positionClass = `tip-${resolveTipPosition(sc.position)}`;
        if (!el.tipClassAttr.classes.includes(themeClass)) added.push(themeClass);
        // theme 与 position 共用 `tip-` 前缀：理论上同名的组合（theme=left）已被白名单挡掉，这里再判一次类名去重
        if (!el.tipClassAttr.classes.includes(positionClass) && !added.includes(positionClass)) added.push(positionClass);
        if (added.length > 0) {
            edits.push({
                start: el.tipClassAttr.value.start,
                end: el.tipClassAttr.value.end,
                text: mergeClasses(contentHtml.slice(el.tipClassAttr.value.start, el.tipClassAttr.value.end), added),
            });
        }

        // ②③ wrapper 上的 data-*：只在「确实缺这个属性」时补（`\sdata-trigger\s*=` 也认 `data-trigger = "x"`）
        const attrs: string[] = [];
        if (sc.trigger === "click" && !/\sdata-trigger\s*=/i.test(tag)) attrs.push('data-trigger="click"');
        if (sc.delay !== undefined && !/\sdata-delay\s*=/i.test(tag)) attrs.push(`data-delay="${sc.delay}"`);
        if (attrs.length > 0) wrapperAttrs.set(el.tagEnd, attrs);
    }

    for (const [tagEnd, attrs] of wrapperAttrs) {
        // 插在开标签的 `>` 之前（这些标签已确认不是自闭合，`>` 一定是最后一个字符）
        edits.push({ start: tagEnd - 1, end: tagEnd - 1, text: ` ${attrs.join(" ")}` });
    }

    const patched = applyEdits(contentHtml, edits);
    if (patched === null) {
        console.warn("[article-shortcodes] tip 补丁区间出现重叠，本次不做任何修改（正文按后端原样渲染）");
        return contentHtml;
    }
    return patched;
}

/**
 * 正文 HTML 的全部前端补丁（服务端文章页与编辑器预览唯一入口）：先按钮、后 tip。
 *
 * 两个补丁作用区间互不相交（按钮 = `<a class="btn-anzhiyu">` 及其外层 `<p>` / 容器 div；
 * tip = `.anzhiyu-tip-wrapper` 及其内部 `.anzhiyu-tip`），且各自独立兜底：其中一个数量对不上而整体放弃时，
 * 另一个照常生效——「按钮没补上」不该连带把 tip 也废掉。
 */
export function patchArticleContent(contentMd: string, contentHtml: string): string {
    return patchArticleTips(contentMd, patchArticleButtons(contentMd, contentHtml));
}
