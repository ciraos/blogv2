"use client";

import NextTopLoader from "nextjs-toploader";

/**
 * 顶部导航进度条（客户端**软导航**时显示）。
 *
 * 为什么需要它：loading.tsx 只在**硬加载/直接打开**时出现 —— 客户端软导航被包在 React transition 里，
 * React 会保留旧页面而不回退到 loading 后备 UI（实测限速 2.5s + 50ms 采样 120 次，loader 出现 0 次）。
 * 这个条子补的正是「点了链接 → RSC 回来之前」那段反馈，与 loading.tsx 互补。
 *
 * 为什么要包一层：本项目没有统一根布局，`(blog)`/`(auth)`/`admin`/`music` 四组各自渲染
 * `<html>/<body>`，所以得在四个 layout 里各挂一次；配置集中在这里，改一次全局生效。
 *
 * 触发机制（读它的 dist 实现）：捕获阶段拦站内 <a>/<Link> 点击 → 起条；
 * 它同时改写了 window.history.pushState/replaceState，Next 提交 URL 时收条。
 * ⚠️ `next/navigation` 的 `useRouter().push/replace` **不会**触发它 ——
 * 这类跳转要用 `nextjs-toploader/app` 导出的 useRouter（见 back-button / search-dialog 等）。
 *
 * 覆盖掉的默认值：`showSpinner` 默认 true（右上角转圈）与蓝色发光 `shadow` 在博客上太抢；
 * 颜色走 `--primary`，会跟着后台的皮肤 / APPEARANCE_TOKENS 一起变。
 */
export function TopProgress() {
    return (
        <NextTopLoader
            color="var(--primary)"
            height={3}
            showSpinner={false}
            shadow={false}
            easing="ease"
            speed={200}
            crawlSpeed={200}
        />
    );
}
