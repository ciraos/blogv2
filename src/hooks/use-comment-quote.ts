import { useCallback } from "react"

/** 引用文本最大长度（与线上 EssayList 取前 50 字一致） */
export const QUOTE_MAX_LENGTH = 50

/** 滚动到评论区时的位置补偿：抵消顶部吸顶导航的高度 */
const SCROLL_OFFSET = 120

/**
 * 把一段文本作为「引用」送进页面底部的评论区，并平滑滚动过去。
 *
 * 即刻页（/essay）与朋友圈页（/fcircle）共用这套逻辑：整个列表页共用一个 target_path，
 * 不在后端建「每条内容一个评论线程」，而是靠评论正文里的 `> 引用`（前 50 字）
 * 让访客与后来的读者都能看出评论的是哪一条内容 —— 与线上 CommentSection 的
 * `comment-form-set-quote` 事件约定一致（评论区由 PostComments 监听并展示引用预览）。
 *
 * 卡片所在位置可能离评论区很远（尤其移动端），所以派发事件后要把评论区滚进视口。
 */
export function useCommentQuote(targetPath: string) {
    return useCallback(
        (text: string | null | undefined) => {
            const quoteText = (text ?? "").replace(/\s+/g, " ").trim().slice(0, QUOTE_MAX_LENGTH)
            if (!quoteText) return

            window.dispatchEvent(
                new CustomEvent("comment-form-set-quote", {
                    detail: { text: quoteText, targetPath },
                }),
            )

            const section = document.getElementById("post-comment")
            if (section) {
                const top = section.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET
                window.scrollTo({ top, behavior: "smooth" })
            }
        },
        [targetPath],
    )
}

/** 从可能含 HTML 的文本里取纯文本（即刻的正文可能是 HTML，朋友圈是纯文本，都能处理） */
export function toPlainText(value: string | null | undefined): string {
    if (!value) return ""
    if (typeof document === "undefined") return value
    const holder = document.createElement("div")
    holder.innerHTML = value
    return holder.textContent || holder.innerText || ""
}
