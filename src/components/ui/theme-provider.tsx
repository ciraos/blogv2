"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

export function ThemeProvider({
    children,
    ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
    // React 19.2 / Next 16 起，客户端「新建」<script> 元素会报：
    //   Encountered a script tag while rendering React component. ...
    // next-themes 会无条件往子树里塞一个防闪烁脚本（dist/index.mjs 里那个 memo 组件，
    // 用 dangerouslySetInnerHTML 输出主题初始化代码）；它由 SSR 输出一次就够了。
    // 客户端再建时（Fast Refresh 重挂载、整棵 layout 在客户端渲染、hydration 兜底重渲染等）
    // 就会触发上面这条告警 —— 而 React 此时本来也不会执行它（经 innerHTML 解析出来的
    // script 被浏览器标记为 already started），所以标成 type="application/json"
    // （react-dom 的 isScriptDataBlock 会把非 JS 类型的 script 当数据块，不再告警）
    // 不改变任何行为。
    // 服务端不传 type：SSR 里那个 script 仍是可执行的，主题在首屏绘制前就写进 <html>，
    // 不会引入 FOUC；客户端属性差异由 next-themes 自己在该 script 上设的
    // suppressHydrationWarning 兜住。
    const scriptProps =
        typeof window === "undefined"
            ? undefined
            : ({ type: "application/json" } as const)

    return (
        <NextThemesProvider {...props} scriptProps={scriptProps}>
            {children}
        </NextThemesProvider>
    )
}
