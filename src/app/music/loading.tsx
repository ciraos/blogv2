import { LoadingBars } from "@/components/ui/loading-bars";

/**
 * 音乐馆加载态。
 *
 * 渲染在 `music/layout.tsx` 的深色全屏容器内部（Header 之下的那个 flex 子项），
 * 所以用 `flex-1 min-h-0` 吃掉剩余高度居中，不要再写 100dvh（会多出一屏高度）。
 */
export default function Loading() {
    return <LoadingBars className="min-h-0 flex-1" />;
}
