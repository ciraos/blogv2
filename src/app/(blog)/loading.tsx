import { LoadingBars } from "@/components/ui/loading-bars";

/**
 * 前台加载态（页面数据慢时先随外壳流式下发）。
 *
 * 为什么必须放在**组内**而不是 src/app/loading.tsx：`(blog)/layout.tsx` 才是渲染 `<html>/<body>`
 * 的「文档外壳」，而 loading.tsx 只包住同段之外的子内容（本段 layout 不被它包住）。放在根段时
 * Next 必须等外壳就绪才能吐第一段 HTML，后备 UI 永远没机会出现 —— 实测把 layout 拖慢 3 秒，
 * 响应仍直接以 `<!DOCTYPE html>` 开头、loader 渲染 0 次。
 *
 * CSS 不用在这里再 import：同段 layout 已经 `import "../globals.css"`，本组件只会在它内部渲染。
 */
export default function Loading() {
    // 首屏是整屏 hero 大图，这里用「视口扣除头部/页脚」的高度保证在正文区垂直居中
    return <LoadingBars className="min-h-[calc(100dvh-12rem)]" />;
}
