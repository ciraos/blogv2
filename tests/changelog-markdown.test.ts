import assert from "node:assert/strict";
import test from "node:test";

import { renderChangelogMarkdown } from "../src/lib/changelog-markdown.ts";

test("标题转成 h1~h4", () => {
    const html = renderChangelogMarkdown("## 修复与优化\n\n### 子项");
    assert.match(html, /<h2>修复与优化<\/h2>/);
    assert.match(html, /<h3>子项<\/h3>/);
});

test("连续列表项包在同一个 ul 里", () => {
    const html = renderChangelogMarkdown("- 第一条\n- 第二条");
    assert.equal(html, "<ul>\n<li>第一条</li>\n<li>第二条</li>\n</ul>");
});

test("有序列表用 ol", () => {
    const html = renderChangelogMarkdown("1. 一\n2. 二");
    assert.equal(html, "<ol>\n<li>一</li>\n<li>二</li>\n</ol>");
});

test("行内代码、加粗、链接都渲染出来", () => {
    const html = renderChangelogMarkdown("**粗** 和 `code` 和 [官网](https://example.com)");
    assert.match(html, /<strong>粗<\/strong>/);
    assert.match(html, /<code class="[^"]*">code<\/code>/);
    assert.match(html, /<a href="https:\/\/example\.com"[^>]*>官网<\/a>/);
});

test("HTML 先转义，标签不会被当成真标签", () => {
    const html = renderChangelogMarkdown('<script>alert("x")</script>');
    assert.ok(!html.includes("<script>"));
    assert.match(html, /&lt;script&gt;/);
});

test("非 http(s) 链接不放行（防 javascript:）", () => {
    const html = renderChangelogMarkdown("[点我](javascript:alert(1))");
    assert.ok(!html.includes("javascript:alert(1)\""));
    assert.ok(!html.includes("<a "));
});

test("列表项源码换行会接回上一条，而不是打断列表", () => {
    const html = renderChangelogMarkdown("- 第一行\n  第二行");
    assert.equal(html, "<ul>\n<li>第一行 第二行</li>\n</ul>");
});

test("分隔线与空段落", () => {
    const html = renderChangelogMarkdown("第一段\n\n---\n\n第二段");
    assert.equal(html, "<p>第一段</p>\n<hr />\n<p>第二段</p>");
});
