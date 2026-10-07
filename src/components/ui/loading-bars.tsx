import { cn } from "@/lib/utils";

/**
 * 站点通用的「5 条杠 + 小球」加载动画（动画本体在 globals.css 的 .loader / .loader__bar / .loader__ball）。
 *
 * 为什么抽出来：loading.tsx 得**每个路由组各放一份**（根段那份永远轮不到渲染 —— 各组 layout 才是
 * 渲染 `<html>/<body>` 的地方，Next 必须等外壳就绪才吐第一段，见各组 loading.tsx 的说明），
 * 但动画只有一套，放这里避免四份重复。
 *
 * 纯展示、无客户端状态：Server / Client 组件里都能直接用；外层定位交给调用方传 className。
 */
export function LoadingBars({ className, label = "加载中" }: { className?: string; label?: string }) {
    return (
        <div
            role="status"
            aria-label={label}
            className={cn("flex w-full items-center justify-center", className)}
        >
            <div className="loader">
                <div className="loader__bar" />
                <div className="loader__bar" />
                <div className="loader__bar" />
                <div className="loader__bar" />
                <div className="loader__bar" />
                <div className="loader__ball" />
            </div>
        </div>
    );
}
