import { LoaderCircle } from "lucide-react";

/**
 * 登录 / 注册 / 激活 等 (auth) 页面的加载态。
 *
 * 注意：`loading.tsx` 不包同段的 layout，所以本组件是渲染在 `(auth)/layout.tsx` 的
 * `AuthCard` **卡片内部**的 —— 只占卡片内容区，别再套全屏居中容器（会撑破卡片）。
 */
export default function Loading() {
    return (
        <div className="flex flex-col items-center gap-3 py-12" role="status" aria-label="加载中">
            <LoaderCircle className="size-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">加载中…</p>
        </div>
    );
}
