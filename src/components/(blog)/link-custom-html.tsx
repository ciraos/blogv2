"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * 友链页自定义 HTML（后端 FRIEND_LINK_APPLY_CUSTOM_CODE_HTML，含免责声明/须知与 yaml 示例代码块）。
 * 后端 md-editor 直出的复制按钮内联调用 window.__markdownEditorCopyHandler，
 * 本站前端没有该全局函数 → 点击无效；这里移除内联逻辑并重新绑定真实复制。
 */
export function LinkCustomHtml({ html }: { html: string }) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const root = ref.current;
        if (!root) return;

        // 修复示例代码块右上角的复制按钮（.copy-button）
        root.querySelectorAll<HTMLElement>(".md-editor-code .copy-button").forEach((btn) => {
            if (btn.dataset.copyBound === "1") return;
            btn.dataset.copyBound = "1";
            // 移除后端内联 onclick（引用不存在的 window.__markdownEditorCopyHandler）
            btn.removeAttribute("onclick");

            btn.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const codeEl = btn.closest(".md-editor-code")?.querySelector<HTMLElement>("pre code");
                if (!codeEl) return;
                const text = codeEl.innerText ?? "";
                try {
                    await navigator.clipboard.writeText(text);
                } catch {
                    const textarea = document.createElement("textarea");
                    textarea.value = text;
                    textarea.style.position = "fixed";
                    textarea.style.opacity = "0";
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand("copy");
                    document.body.removeChild(textarea);
                }
                toast.success("复制成功！");
                btn.classList.add("copied");
                window.setTimeout(() => btn.classList.remove("copied"), 1500);
            });
        });
    }, [html]);

    return (
        <div
            ref={ref}
            className="FRIEND_LINK_APPLY_CUSTOM_CODE article-body"
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}
