"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CommentImageLightbox, type CommentLightboxImage } from "@/components/(blog)/comment-image-lightbox";
import { DEFAULT_CODE_BLOCK_OPTIONS, enhanceCodeBlocks, type CodeBlockOptions } from "@/lib/code-block";

interface CommentContentProps {
    /** 后端返回的评论 HTML（content_html） */
    html: string;
    /** 代码块配置（site-config post.code_block）：与文章正文同一套，保证两处代码框表现一致 */
    codeBlock?: { codeMaxLines?: number; macStyle?: boolean };
}

/**
 * 远端后端源：`NEXT_PUBLIC_API_URL` 去掉结尾的 `/api`（本机 = `https://blog.ciraos.top/api` → `https://blog.ciraos.top`）。
 * 拿不到合法绝对地址（未配置 / 是 `/api` 这类相对值）时返回空串，此时不做任何改写（保持原行为）。
 */
const BACKEND_ORIGIN = (() => {
    const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "").trim().replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(apiUrl)) return "";
    return apiUrl.replace(/\/api$/i, "");
})();

/**
 * 评论正文里的图片地址兜底修复。
 *
 * 后端渲染评论时把 `![](anzhiyu://file/{id})` 换成了**相对后端域名**的签名下载路径
 * `/needcache/download/{id}?expires=…&sign=…`（见后端 `pkg/service/comment/service.go` 的 `renderHTMLURLs`）。
 * 该路径只能由**后端**域名提供，而本站：
 *   1. 没有 `/needcache/*` 路由；
 *   2. `next.config.ts` 里那条 `/needcache/:path*` rewrite 也到不了 —— 中间件 `src/proxy.ts`
 *      会先把 `/needcache/download/xxx` 当成「后端自定义页面」去探测，探测 404 后直接返回真 404
 *      （中间件早于 rewrites 执行），于是 `<img>` 拿到的是本站 404 页面 → 图裂、空白。
 *
 * 所以这里只把 `src="/needcache/…"`（含单引号写法）的**前缀**补成后端源，其余 src 一律不动：
 * `http(s)://` / `//` / `data:` / `blob:` 等绝对地址，以及 `/api/…`、`/static/…` 这类本站同源代理路径都保持原样。
 * 实现上**纯字符串加前缀**，不解析、不解码 query —— `expires` / `sign` 里的 `=` `+` `/` 必须逐字节保留，否则签名失效。
 */
export function toReachableCommentHtml(html: string): string {
    if (!html || !BACKEND_ORIGIN) return html;
    if (!html.includes("/needcache/")) return html;
    return html.replace(/(src=["'])\/needcache\//g, `$1${BACKEND_ORIGIN}/needcache/`);
}

/** 图片行容器类：`flex flex-wrap` = 一行放不下就换行；顺序保持 DOM 顺序（lightbox 的图集顺序就是它） */
const IMAGE_ROW_FLEX = "comment-image-row flex flex-wrap items-center gap-2 sm:gap-2.5";
/** 图片行容器（包着一批单图段落） */
const IMAGE_ROW_CLASS = IMAGE_ROW_FLEX;
/** 图片行容器里的段落（flex item）：清掉段落自带的 margin / 行高，避免把行撑开 */
const IMAGE_ROW_ITEM_CLASS = "[&>p]:m-0 [&>p]:leading-none [&>figure]:m-0 [&>figure]:leading-none";
/** 段内多图（一个段落里好几张图）时，段落自己当图片行 */
const IMAGE_RUN_ROW_OPEN = `<p class="${IMAGE_ROW_FLEX}">`;
/** 「N 张图 + 末尾说明」被拆开后，那句说明独占一行的块 */
const IMAGE_RUN_TEXT_OPEN = `<p class="w-full basis-full">`;

/** 逐个段落匹配（内容宽松捕获，是不是"图片段"交给 countImages / 末尾文字判定）。
 *  ⚠️ 不能用"只匹配纯图片段落"的严格正则整段匹配：`<p><img><br><img> 说明</p>` 这种
 *  带末尾文字的段落会被整段跳过，而用户实际发的那条恰好就是这种（实测踩过这个坑）。 */
const ANY_PARAGRAPH = /<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/gi;
/** 两个图片段落之间算不算"紧邻"：纯空白 / `<br>` / `&nbsp;` / 注释才算 */
const WHITESPACE_ONLY = /^(?:\s|<br\s*\/?>|&nbsp;|<!--[\s\S]*?-->)*$/i;
/** 段落里的换行标签：段内多图时 `<img><br><img>` 会竖排，清掉交给 flex 换行 */
const LINE_BREAK = /<br\s*\/?>/gi;
/** 找段落里最后一张 `<img>`（`g` 用于取全部匹配） */
const IMAGE_TAG_GLOBAL = /<img\b[^>]*>/gi;

/** 段落里有几张 `<img>`（**不算表情**，理由见 isEmojiImage 的说明） */
function countImages(inner: string): number {
    return [...inner.matchAll(IMAGE_TAG_GLOBAL)].filter((match) => !isEmojiImageTag(match[0])).length;
}

/** 后端给表情图打的类名（见 isEmojiImageTag 的说明） */
const EMOJI_IMAGE_CLASS = "anzhiyu-owo-emotion";

/**
 * 是不是「表情图」。
 *
 * 后端生成评论 HTML 时会把 `:heo-害羞:` 这类写法换成
 * `<img class="anzhiyu-owo-emotion" alt="heo-害羞" src="…">`（见 anheyu-app
 * pkg/service/parser/service.go 的 emojiReplacer）。它们和用户上传的照片**都是 `<img>`**，
 * 但语义完全不同：照片要折行 + 缩略图 + 灯箱，表情要当一个行内小图标。
 * 所以这里按类名区分，后续三处（折行、尺寸、灯箱）都只看「非表情图」。
 */
function isEmojiImageTag(tag: string): boolean {
    return tag.includes(EMOJI_IMAGE_CLASS);
}

/** 正文里「非表情」的图片（尺寸归一 / 灯箱都只针对它们） */
const PHOTO_IMAGE_SELECTOR = `img:not(.${EMOJI_IMAGE_CLASS})`;

/** 去掉段内换行：`<img><br><img>` 里的 `<br>` 会让图竖排，交给 flex 换行 */
function stripLineBreaks(inner: string): string {
    return inner.replace(LINE_BREAK, "");
}

/** 最后一张图结尾的位置（没有图片则 0；表情图不算） */
function lastImageEnd(inner: string): number {
    const tags = [...inner.matchAll(IMAGE_TAG_GLOBAL)].filter((match) => !isEmojiImageTag(match[0]));
    const last = tags[tags.length - 1];
    return last && last.index !== undefined ? last.index + last[0].length : 0;
}

/**
 * 找出最后一张图之后、那句"说明文字"的起始位置（没有则 -1）。
 * 判定：最后一张图之后（跳过空白）还有真文字（`&nbsp;` / 注释不算）。
 *
 * ⚠️ 不能"找最后一张图后面的最后一个 `<br>`"来当分界：用户实际那条的 HTML 是
 * `<img><br>\n<img><br>\n<img> 多个图片测试。` —— 说明文字**直接跟在最后一张图后面**，
 * 它后面根本没有 `<br>`（`<br>` 只在图片与图片之间），那种写法会得 -1、白白漏掉拆分。
 */
function findTrailingTextStart(inner: string): number {
    const afterLastImage = lastImageEnd(inner);
    if (afterLastImage <= 0) return -1;
    const tail = inner.slice(afterLastImage);
    const match = /^\s+/.exec(tail);
    const textStart = afterLastImage + (match ? match[0].length : 0);
    const text = inner.slice(textStart);
    return text.replace(/&nbsp;|&#160;|<!--[\s\S]*?-->/gi, "").trim().length > 0 ? textStart : -1;
}

/**
 * 找出段首文字的结束位置（第一张图之前那段文字），没有则 0。
 *
 * 为什么要单独处理段首文字：用户实际发的是 `<p>评论带多图测试！<img><img></p>` ——
 * 文字在**图前面**。这段段落会被整体套成 flex 行容器（见下面 restructureImageParagraph），
 * 于是文字变成一个 flex item，被 `items-center` 垂直居中后**并排显示在图片左边**
 * （实测截图：文字在左、两张图在右）。作者的原意是「字在上、图在下」，所以这里也要拆。
 *
 * 判定同 findTrailingTextStart：`&nbsp;` / 注释不算文字。
 */
function findLeadingTextEnd(inner: string): number {
    // 只看「照片」：表情图是行内元素，留在文字块里更自然（它本来就不该进图片行）
    const firstPhoto = [...inner.matchAll(IMAGE_TAG_GLOBAL)].find((match) => !isEmojiImageTag(match[0]));
    if (!firstPhoto || firstPhoto.index === 0) return 0;
    const before = inner.slice(0, firstPhoto.index);
    const text = before.replace(/&nbsp;|&#160;|<!--[\s\S]*?-->/gi, "").replace(/<img\b[^>]*>|<[^>]+>/gi, "").trim();
    if (!text) return 0;
    // 末尾空白（含换行）不算文字：留下会把图片行挤出一段空白
    return before.replace(/\s+$/, "").length;
}

/**
 * 把「文字 + N 张图」的段落重排成「文字块 / 图片行 / 文字块」三个块级兄弟。
 * `leadEnd` 由 findLeadingTextEnd 给出（段首文字结束位置，0 = 没有）；
 * `trailStart` 由 findTrailingTextStart 给出（末尾文字起点，-1 = 没有）。
 *
 * ⚠️ 为什么不能图省事直接在 `<p>` 里塞 `<div>`：HTML 解析器遇到 `<p><div>` 会**自动闭合** `</p>`，
 * 于是本来想当子节点的行容器跑到段落外面、剩下一个空 `<p>`，图片反而散架
 * （实测：`<p><img><img>文字</p>` 加 div 后末端出现一个孤零零的 `</p>`）。
 * 所以这里全部用 `<p>`（块级）当兄弟节点：图片行自己 flex 横排，文字各自独占一行 ——
 * 顺序仍然是作者写的顺序（段首文字在上、末尾文字在下）。
 */
function restructureImageParagraph(inner: string, leadEnd: number, trailStart: number): string {
    const hasTrailing = trailStart > 0;
    // 去掉 `<br>` 之后还要 trim：换行标签常常带缩进/换行空白，留着会在图片行尾部多出一段空格
    const images = stripLineBreaks(inner.slice(leadEnd, hasTrailing ? trailStart : undefined)).trim();
    const leading = leadEnd > 0 ? inner.slice(0, leadEnd).replace(/(?:\s|<br\s*\/?>)+$/i, "") : "";
    const trailing = hasTrailing ? inner.slice(trailStart).replace(/^(?:\s|<br\s*\/?>)+/i, "") : "";

    let out = "";
    if (leading) out += `${IMAGE_RUN_TEXT_OPEN}${leading}</p>`;
    out += `${IMAGE_RUN_ROW_OPEN}${images}</p>`;
    if (trailing) out += `${IMAGE_RUN_TEXT_OPEN}${trailing}</p>`;
    return out;
}

/**
 * 评论区多图横排。后端有**三种**把多图排成竖列的写法，这里都处理：
 *   ① `<p><img/></p><p><img/></p>` —— 每张图一个段落，段落块级 → 必然一张一行；
 *   ② `<p><img/><br><img/></p>` —— 同一段里用 `<br>` 换行 → 也必然一张一行；
 *   ③ `<p><img/><br><img/><br><img/> 说明文字</p>` —— 多图后面还跟了一句说明
 *      （用户实际发的那条就是这种，见下面「图 + 文字」的处理）；
 *   ④ `<p>说明文字<img/><br><img/></p>` —— 文字在**图前面**（同样是用户实际发过的写法）。
 *
 * 规则：
 *  - 连续的单图段落（写法 ①）→ 合并进一个 `<div class="comment-image-row flex flex-wrap …">`；
 *  - 段内多图（写法 ②）→ 清掉 `<br>`，并**直接给这个段落套同一套 flex 类**当行容器
 *    （这就是"给段落加 flex 类"而不是"把 img 提出来"的答案：不动 `<p>` 之外任何节点，最安全）；
 *  - 段内多图 + 文字（写法 ③ / ④）→ 拆成 `<p class="w-full basis-full">文字</p>` +
 *    `<p class="…flex…">图</p>` 的块级兄弟：文字独占一行、图片在下面横排；
 *    段首文字在上、段尾文字在下，顺序完全按作者写的来
 *    （详见 restructureImageParagraph 里"为什么不能塞 div"的说明）；
 *  - 段里出现文字但**只有一张图**（如 `图1 <img>`）→ 整段原样留，不动；
 *  - 只有**紧邻**的图片段落会并进同一行：中间夹了其它内容先关掉当前行，不会"隔空合并"；
 *  - **顺序完全保留**：只把相邻段落放进同一个 flex 容器，不重排、不移动节点，
 *    所以 lightbox 的左右切换顺序与横排顺序天然一致（都取 `querySelectorAll("img")` 的 DOM 顺序）。
 *
 * 为什么不用 DOMParser：这是个纯函数，SSR 与客户端会**各自**调用一次（首帧 dangerouslySetInnerHTML +
 * useEffect 里的 innerHTML 重建），必须两边产出逐字节一致的字符串；DOMParser 只在浏览器存在，
 * 且会规范化标记，容易造成 hydration 不一致。正则只做"整段包裹 / 拆段"，其余内容原样透传。
 */
export function foldImageParagraphsIntoRows(html: string): string {
    if (!html || !/<img\b/i.test(html)) return html;

    let result = "";
    let cursor = 0;
    let isRowOpen = false;
    /** 本轮图片行里是否已经放过至少一张图（决定"和上一张紧邻"能不能算同一行） */
    let hasImageInRow = false;
    /** 是否已经遇到过带图的段落（一个都没有就直接原样返回，省掉无谓的重建） */
    let sawParagraph = false;
    /** 关闭当前图片行（未打开时无事发生） */
    const closeRow = () => {
        if (!isRowOpen) return "";
        isRowOpen = false;
        hasImageInRow = false;
        return "</div>";
    };

    ANY_PARAGRAPH.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = ANY_PARAGRAPH.exec(html)) !== null) {
        const inner = match[1] ?? "";
        if (countImages(inner) === 0) continue;

        // 末尾那段"说明文字"的起点（没有则 -1）：见 findTrailingTextStart
        const trailingTextStart = findTrailingTextStart(inner);
        const hasTrailingText = trailingTextStart > 0;

        // 段内 ≥2 张图：这个段落自己就是图片行，前后都不并入其它行
        // （图片后面还跟着说明文字时，还要把它拆成「图片行 + 整宽文字块」）
        if (countImages(inner) > 1) {
            result += closeRow() + html.slice(cursor, match.index);
            // 段首/段尾的文字都拆成独立块：文字在上（作者先写字）、图片在下
            result += restructureImageParagraph(inner, findLeadingTextEnd(inner), hasTrailingText ? trailingTextStart : -1);
            sawParagraph = true;
            cursor = match.index + match[0].length;
            continue;
        }

        // 段内只有 1 张图（可能前后带文字）：与**紧邻**的其它单图段落并进同一个行容器；
        // 夹了别的内容就另起一行。
        // ⚠️ 必须"先关旧行、再写新行"，而且**只在要另起一行时才关**：
        //    无条件关会把紧邻的下一张图踢出当前行（实测踩过）；
        //    先写 before 再关则会把夹在中间的整段文字圈进图片行里（也踩过）。
        const before = html.slice(cursor, match.index);
        const startsNewRow = !isRowOpen || !hasImageInRow || !WHITESPACE_ONLY.test(before);
        if (startsNewRow) result += closeRow();
        result += before;
        if (startsNewRow) result += `<div class="${IMAGE_ROW_CLASS} ${IMAGE_ROW_ITEM_CLASS}">`;
        result += `<p>${stripLineBreaks(inner)}</p>`;
        isRowOpen = true;
        hasImageInRow = true;
        sawParagraph = true;
        cursor = match.index + match[0].length;
    }

    // 收尾：图片行可能还开着 —— 闭标签要写在**尾巴之前**，否则尾巴（后面的段落文字）会被圈进行里
    if (!sawParagraph) return html;
    return result + closeRow() + html.slice(cursor);
}

/* ============================ 评论图片尺寸策略 ============================
 * 用户诉求：「图片太大了，缩小 1/4，点开可以放大」。
 *
 * 「缩小 1/4」按**缩到原宽度的 1/4（25%）**实现（歧义说明见交接报告）：
 * 1920×1080 的图在评论列里原本会撑满约 838px，1/4 ≈ 210px，
 * 正是「一排好几个缩略图、点开看原图」的常见形态；60%（即"小 1/4"）仍占大半屏，
 * 「太大了」的诉求没被解决。若你要的是 60%，只改下面的 WIDE_RATIO 一处即可。
 *
 * 三档夹取，单位都是 px：
 *   - WIDE_RATIO 25%：容器再宽也不让缩略图超过 MAX_THUMBNAIL_WIDTH（防超宽屏下图还是很大）；
 *   - MIN_THUMBNAIL_WIDTH 96px：容器很窄时 25% 会缩到看不清，抬到 96px 兜底；
 *   - MAX_THUMBNAIL_WIDTH 320px：缩略图上限；「容器宽 25%」和它取小值。
 *   手机（≤640px，与 Tailwind `sm` 断点同为 40rem）换 NARROW_RATIO 50%：
 *   手机上一屏只有 2 张图，25% 明显过小；上下限不变（窄屏本来也撞不到 320px 上限）。
 *
 * ⚠️ 两个必须用 JS 量像素、不能纯用 CSS 百分比的原因（实测踩过）：
 *   1. 评论气泡是 `w-fit`（post-comments.tsx 的 .comment-bubble），百分比宽度会反过来
 *      依赖内容宽度 → 循环依赖，浏览器会把气泡缩成"图片宽度"那么小，整条评论塌掉；
 *   2. 需要拿原图自然宽度做上限，原图 ≤ 目标宽度时保持原尺寸、**绝不放大**（放大只会糊）。
 * 所以参照物取「评论所在的内容列」（`.min-w-0.flex-1`，与气泡的 padding 无关、宽度确定），
 * 再把结果写死成内联 px（applyThumbnailSize）。
 *
 * 注意：这里的宽度**不能**只靠 CSS 类。CommentContent 的 useEffect 会用 `root.innerHTML = reachableHtml`
 * 重建一次正文（为了让代码块按最新配置重建），React 渲染时挂在 img 上的 className 会被这次重建抹掉，
 * 因此缩略图样式统一在 applyThumbnailSize 里现场补（类 + 内联尺寸），只保留下面这个常量作为字面量，
 * 方便 Tailwind 静态扫描收集类名。 */
/** PC 缩略图宽度 = 参照宽度 × 25%（约「四分之一」） */
const WIDE_RATIO = 0.25;
/**
 * 手机（≤640px）缩略图宽度 = 参照宽度 × 30%，最终由 MIN_THUMBNAIL_WIDTH(96px) 兜底，
 * 实际落地就是 ~96~106px 这一档。
 *
 * ⚠️ 这里**偏离**了原计划「手机放宽到 1/2」，是实测逼出来的取舍：
 * 评论气泡是 `w-fit`，390px 视口里气泡内容宽只有 ~242px。
 *  - 1/2（≈179px）一行只放得下一张 → 又变回用户这次要修的"竖着堆"；
 *  - 想一行放两张，图片必须 ≤ ~117px（242 = 2×117 + 8 间距），所以取 30% ÷ 96px 下限。
 * 结论：手机上以"两图一行"优先，单张缩略图约 96px（点开即看原图，仍然够用）。
 * 上下限不变（窄屏撞不到 320px 上限）。⚠️ 要改回 1/2 只需改这一个数。
 */
const NARROW_RATIO = 0.3;
/** 缩略图下限：再窄就点不开也看不清了 */
const MIN_THUMBNAIL_WIDTH = 96;
/** 缩略图上限：超宽屏下 25% 也会很大，这里封顶 */
const MAX_THUMBNAIL_WIDTH = 320;
/** 手机断点：与 Tailwind v4 默认 `sm`（40rem = 根字号 16px 时的 640px）保持一致 */
const NARROW_VIEWPORT = 640;
/** 多图横排时两张缩略图之间至少要留出的间距（flex 的 gap-2 = 8px），用于"宽度别顶满"的兜底 */
const THUMBNAIL_H_GAP = 8;
/** 缩略图样式类（与站内图片风格一致：圆角 + 描边 + 放大镜光标 + 轻微 hover 反馈）。
 *  ⚠️ 必须写成字面量字符串：Tailwind 是静态扫描源码收集类名的，拼接/变量会漏扫。
 *  ⚠️ 这里**故意不给宽度百分比**（如 `w-1/4`）：评论气泡是 `w-fit`，百分比会依赖内容宽度，
 *  JS 还没量到尺寸时（图片未加载完）会把气泡缩成几十像素、整条评论塌掉。
 *  未量到尺寸前保持图片固有尺寸（Preflight 的 `max-width:100%` 兜住），量到后再写内联 px。 */
const THUMBNAIL_CLASS =
    "my-1 h-auto max-w-full cursor-zoom-in rounded-md border transition duration-200 hover:brightness-95 hover:ring-2 hover:ring-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
/** 尺寸量取后打的标记（也方便验证脚本定位已处理的图） */
const SIZED_ATTR = "data-comment-img-sized";

/** 给一张评论图按「参照宽度比例 + 原图上限」写死内联尺寸与缩略图样式 */
function applyThumbnailSize(img: HTMLImageElement, referenceWidth: number) {
    // 先补样式类（innerHTML 重建会抹掉 React 挂的 className），保证即使量不到尺寸也有缩略图观感
    img.classList.add(...THUMBNAIL_CLASS.split(" "));
    // ⚠️ 必须显式加 tabindex="-1"：普通 `<img>` 在 Chromium 里**不是可聚焦元素**
    //    （`img.tabIndex` 读出来是 -1，但没有 tabindex 属性时 focus() 直接无效），
    //    而关闭 lightbox 后要把焦点还给被点的那张缩略图 —— 实测没这一行焦点会掉到 body。
    //    -1 只让它可被**脚本**聚焦，不会挤进 Tab 顺序、不影响键盘浏览评论。
    img.setAttribute("tabindex", "-1");
    if (!referenceWidth) return;
    const ratio = window.innerWidth <= NARROW_VIEWPORT ? NARROW_RATIO : WIDE_RATIO;
    const target = Math.round(
        Math.min(Math.max(referenceWidth * ratio, MIN_THUMBNAIL_WIDTH), MAX_THUMBNAIL_WIDTH)
    );
    // 原图更小就保持原图尺寸（不放大）；同时别顶满参照宽度（给多图横排的 gap 留位置）
    const widthLimit = Math.min(MAX_THUMBNAIL_WIDTH, referenceWidth - THUMBNAIL_H_GAP);
    const finalWidth = Math.max(Math.round(Math.min(target, widthLimit)), MIN_THUMBNAIL_WIDTH);
    // ⚠️ 尺寸用内联 px 写死，不用 CSS 百分比：评论气泡是 `w-fit`，百分比会反向依赖内容宽度（见上方注释）。
    // 图裂 / 还没加载完（naturalWidth = 0）时仍然写宽度：尺寸由**参照宽度**决定，不看原图，安全。
    img.style.width = `${finalWidth}px`;
    img.style.maxWidth = `${
        img.naturalWidth > 0 ? Math.min(finalWidth, img.naturalWidth) : finalWidth
    }px`;
    img.setAttribute(SIZED_ATTR, "1");
}

/* ---------- 多图行的「等高」归一 ----------
 * 单图用上面的宽度比例就够；但一行里有多张时，横图矮、竖图高摆在一起非常难看
 *（实测：一张横版风景 + 一张竖版立绘，竖图把整条评论撑得很高、上下还错位）。
 * 这里对「一行 ≥2 张」的图片改用**固定行高 + 宽度自适应 + object-fit: cover**，
 * 视觉上变成整齐的一排缩略图（类似聊天软件的相册），点开仍看原图。
 */
/** 一行两张时的行高 */
const ROW_HEIGHT_DOUBLE = 150;
/** 一行三张及以上时的行高（再高就太占地方） */
const ROW_HEIGHT_MANY = 110;

/** 给「一行多图」的图片统一高度（单图不动） */
function normalizeRowHeights(root: HTMLElement) {
    root.querySelectorAll<HTMLElement>(".comment-image-row").forEach((row) => {
        const imgs = Array.from(row.querySelectorAll<HTMLImageElement>("img"));
        if (imgs.length < 2) return;
        const height = imgs.length >= 3 ? ROW_HEIGHT_MANY : ROW_HEIGHT_DOUBLE;
        for (const img of imgs) {
            // 覆盖 applyThumbnailSize 写死的宽度，改成「高度固定、宽度自适应」
            img.style.width = "auto";
            img.style.maxWidth = "100%";
            img.style.height = `${height}px`;
            img.style.objectFit = "cover";
        }
    });
}

/** 正文容器相对「评论内容列」的最小占比（见 findReferenceWidth） */
const COLUMN_MIN_RATIO = 1.5;
/** 找不到内边距信息时的兜底留白（px） */
const FALLBACK_BUBBLE_PADDING = 36;

/**
 * 找缩略图的宽度参照：**评论气泡内容盒的可用宽度**（= 评论内容列宽 − 气泡左右内边距）。
 *
 * 为什么不是直接用内容列宽：气泡是 `w-fit`（`post-comments.tsx` 的 .comment-bubble，左右各有
 * `pl-3 pr-6` 内边距），里面的可用宽度比列宽少 ~36px。若按列宽算 25%，
 * 图片会比气泡内容盒还宽 → 顶出气泡边框、压到右下角的小挂件（实测过）。
 *
 * 为什么不用正文自身宽度：气泡是 `w-fit`，百分比/自身宽度会反向依赖内容宽度（循环依赖），
 * 多图横排时更是"行越窄 → 图越小"。所以固定用内容列的宽度推算。
 *
 * 结构是 `div.flex.gap-3 > [头像, div.min-w-0.flex-1 > .comment-bubble > .comment-content]`，
 * 沿祖先链往上找**第一个明显比正文宽**的块（≥ 正文宽 ×1.5）就是内容列。
 * ⚠️ 不能用 `closest('[class*="flex-1"]')`：太宽松，祖先里任何类名带 `flex-1` 的都会被命中，
 * 拿到错的参照物尺寸就全跑偏了。
 */
function findReferenceWidth(root: HTMLElement): number {
    const rootWidth = root.clientWidth;
    let node: HTMLElement | null = root.parentElement;
    while (node && node !== document.body) {
        if (node.clientWidth >= rootWidth * COLUMN_MIN_RATIO) {
            const style = window.getComputedStyle(node);
            const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
            return Math.max(node.clientWidth - (padding || FALLBACK_BUBBLE_PADDING), MIN_THUMBNAIL_WIDTH);
        }
        node = node.parentElement;
    }
    return rootWidth;
}

/**
 * 评论正文渲染（评论区专用）：
 * - 不复用 ArticleBody，评论区里不会有正文的段落间距 / 首字下沉 / 标题锚点等样式；
 * - 图片：缩成「评论列宽 25%（手机 50%）」的缩略图，点击弹全屏 lightbox 看原图、
 *   同一条评论里的图可以左右切换（见 comment-image-lightbox.tsx）；
 *   多图还会被折进 `flex flex-wrap` 的行容器里横排（见 foldImageParagraphsIntoRows）；
 * - 代码块：把正文里的 <pre> 增强成与文章一致的代码框
 *   （语法高亮 + 语言标签 + mac 圆点 + 行号栏 + 行数折叠 + 收缩 + 复制按钮）；
 * - 代码块配置是客户端异步取到的，配置到位后会按新配置重建一次（见 useEffect 里的 innerHTML 还原）。
 */
export function CommentContent({ html, codeBlock }: CommentContentProps) {
    const ref = useRef<HTMLDivElement>(null);
    /** 点击放大时记住是哪张图触发的，关闭后把焦点还回去 */
    const restoreFocusRef = useRef<HTMLElement | null>(null);
    const [gallery, setGallery] = useState<{ images: CommentLightboxImage[]; index: number } | null>(null);

    // HTML 管线（渲染、代码块增强、图片尺寸都基于这一份，避免多处不一致）：
    //   ① toReachableCommentHtml：把后端相对路径 /needcache/… 补成可访问的绝对地址；
    //   ② foldImageParagraphsIntoRows：把连续的纯图片段落折成 flex 行，多图横排。
    const reachableHtml = useMemo(
        () => foldImageParagraphsIntoRows(toReachableCommentHtml(html)),
        [html]
    );

    const options = useMemo<CodeBlockOptions>(
        () => ({
            codeMaxLines: codeBlock?.codeMaxLines ?? DEFAULT_CODE_BLOCK_OPTIONS.codeMaxLines,
            macStyle: codeBlock?.macStyle ?? DEFAULT_CODE_BLOCK_OPTIONS.macStyle,
        }),
        [codeBlock?.codeMaxLines, codeBlock?.macStyle]
    );

    /** 量取正文里所有图片的缩略图尺寸（容器宽度变化 / 图片加载完成时都要重算） */
    const sizeImages = useCallback(() => {
        const root = ref.current;
        if (!root) return;
        const referenceWidth = findReferenceWidth(root);
        root.querySelectorAll<HTMLImageElement>(PHOTO_IMAGE_SELECTOR).forEach((img) =>
            applyThumbnailSize(img, referenceWidth)
        );
        normalizeRowHeights(root);
    }, []);

    useEffect(() => {
        const root = ref.current;
        if (!root) return;
        // 用原始 HTML 还原后再增强：配置变化（如 site-config 异步到位）时可无残留地重建，
        // 避免已增强的代码块被 dataset 标记挡住、无法按新配置重新折叠 / 补 mac 圆点。
        root.innerHTML = reachableHtml;
        enhanceCodeBlocks(root, options);

        // 事件委托：容器上只挂一个 click，命中正文里的 <img> 才开 lightbox。
        // 这样既不给每张图绑监听，也不影响代码块复制按钮、正文链接等既有交互。
        const onClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement | null;
            if (!target || target.tagName !== "IMG") return;
            const img = target as HTMLImageElement;
            // 表情图（后端 :text: 解析出来的小图标）不参与灯箱：它没有"看大图"的意义
            if (img.classList.contains(EMOJI_IMAGE_CLASS)) return;
            // 图片本身可能被评论作者套在 <a> 里：别让点击顺带跳转
            event.preventDefault();
            // 图集 = 这条评论正文里的全部照片（按 DOM 顺序），不跨评论、也不含表情
            const imgs = Array.from(root.querySelectorAll<HTMLImageElement>(PHOTO_IMAGE_SELECTOR));
            restoreFocusRef.current = img;
            setGallery({
                images: imgs.map((item) => ({
                    // currentSrc 是浏览器实际选中的那张（含 srcset），拿不到就退回 src
                    src: item.currentSrc || item.src,
                    alt: item.getAttribute("alt") ?? "",
                })),
                index: Math.max(imgs.indexOf(img), 0),
            });
        };
        root.addEventListener("click", onClick);

        // 图片是异步加载的：这里先按参照宽度量一遍（尺寸不依赖原图，先写也不会闪），
        // 加载完成后再量一次（这次能拿到 naturalWidth，用于"原图更小就不放大"的夹取）
        // ⚠️ 只挑照片：表情图要按 CSS 的固定宽度行内显示，不能被缩略图逻辑碰
        const images = Array.from(root.querySelectorAll<HTMLImageElement>(PHOTO_IMAGE_SELECTOR));
        const referenceWidth = findReferenceWidth(root);
        const onImageSettled = (event: Event) => {
            applyThumbnailSize(event.currentTarget as HTMLImageElement, findReferenceWidth(root));
            // 单图重新量过宽度后，多图行仍要保持等高（否则竖图会把整行撑高）
            normalizeRowHeights(root);
        };
        images.forEach((img) => {
            applyThumbnailSize(img, referenceWidth);
            if (!img.complete) {
                // load 与 error 都要收尾：图裂时也把尺寸写住，避免退回原图尺寸撑破评论
                img.addEventListener("load", onImageSettled, { once: true });
                img.addEventListener("error", onImageSettled, { once: true });
            }
        });
        // 初次渲染也要归一多图行（此前的尺寸循环只按宽度比例，横竖混排会一高一矮）
        normalizeRowHeights(root);

        // 视口跨过 640px 断点 / 容器变宽（侧栏折叠等）都要重新夹取
        window.addEventListener("resize", sizeImages);

        return () => {
            root.removeEventListener("click", onClick);
            images.forEach((img) => {
                img.removeEventListener("load", onImageSettled);
                img.removeEventListener("error", onImageSettled);
            });
            window.removeEventListener("resize", sizeImages);
        };
    }, [reachableHtml, options, sizeImages]);

    const changeIndex = useCallback((next: number) => {
        setGallery((prev) => (prev ? { ...prev, index: next } : prev));
    }, []);

    /** 关闭 lightbox：先收起遮罩，再把焦点还给**最初点击的那张**缩略图 */
    const closePreview = useCallback(() => {
        setGallery(null);
        const trigger = restoreFocusRef.current;
        restoreFocusRef.current = null;
        if (trigger && trigger.isConnected) trigger.focus({ preventScroll: true });
    }, []);

    return (
        <>
            <div ref={ref} className="comment-content" dangerouslySetInnerHTML={{ __html: reachableHtml }} />
            {gallery && (
                <CommentImageLightbox
                    images={gallery.images}
                    index={gallery.index}
                    onIndexChange={changeIndex}
                    onClose={closePreview}
                />
            )}
        </>
    );
}
