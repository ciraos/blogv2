import assert from "node:assert/strict";
import test from "node:test";

import {
    COPYRIGHT_LICENSE,
    COPYRIGHT_LICENSE_URL,
    DEFAULT_COPYRIGHT_TEMPLATE_ORIGINAL,
    DEFAULT_COPYRIGHT_TEMPLATE_REPRINT_WITH_URL,
    DEFAULT_COPYRIGHT_TEMPLATE_REPRINT_WITHOUT_URL,
    renderCopyrightHtml,
} from "../src/lib/post-copyright.ts";

const base = { isReprint: false, author: "米葱苓", siteUrl: "https://blog.example.com" };

test("原创：四个占位符都被替换", () => {
    const html = renderCopyrightHtml({ ...base, originalTemplate: "© {author} {siteUrl} {license} {licenseUrl}" });
    assert.equal(html, `© 米葱苓 https://blog.example.com ${COPYRIGHT_LICENSE} ${COPYRIGHT_LICENSE_URL}`);
});

test("原创：模板为空时用默认模板，且不再残留占位符", () => {
    const html = renderCopyrightHtml({ ...base, originalTemplate: "  " });
    assert.equal(html, DEFAULT_COPYRIGHT_TEMPLATE_ORIGINAL.replace(/{licenseUrl}/g, COPYRIGHT_LICENSE_URL)
        .replace(/{license}/g, COPYRIGHT_LICENSE)
        .replace(/{siteUrl}/g, base.siteUrl)
        .replace(/{author}/g, base.author));
    assert.ok(!html.includes("{author}"));
});

test("转载带原链：用 with_url 模板并替换原链与原作者", () => {
    const html = renderCopyrightHtml({
        ...base,
        isReprint: true,
        copyrightUrl: "https://src.example.com/a",
        copyrightAuthor: "原作者",
        reprintTemplateWithUrl: "{originalAuthor}@{originalUrl}",
    });
    assert.equal(html, "原作者@https://src.example.com/a");
});

test("转载无原链：用 without_url 模板，原作者空时回退作者", () => {
    const html = renderCopyrightHtml({
        ...base,
        isReprint: true,
        copyrightAuthor: "",
        reprintTemplateWithoutUrl: "来自 {originalAuthor}",
    });
    assert.equal(html, "来自 米葱苓");
});

test("作者为空时用「本站博主」兜底", () => {
    const html = renderCopyrightHtml({ ...base, author: "", originalTemplate: "{author}" });
    assert.equal(html, "本站博主");
});

test("默认模板常量里包含许可协议信息", () => {
    assert.ok(DEFAULT_COPYRIGHT_TEMPLATE_ORIGINAL.includes("{license}"));
    assert.ok(DEFAULT_COPYRIGHT_TEMPLATE_REPRINT_WITH_URL.includes("{originalUrl}"));
    assert.ok(DEFAULT_COPYRIGHT_TEMPLATE_REPRINT_WITHOUT_URL.includes("{originalAuthor}"));
});
