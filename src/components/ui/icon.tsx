import { cn } from "@/lib/utils";

interface IconProps {
    /** 图标类名，如 anzhiyu-icon-book（ant 系列 font class）；非 anzhiyu 前缀或空则不渲染 */
    name?: string;
    className?: string;
}

/**
 * AnZhiYu 主题图标（iconfont font-class，见 src/app/iconfont.css）。
 * 用法：<Icon name="anzhiyu-icon-book" className="text-lg" />
 * 渲染为 <i class="anzhiyufont anzhiyu-icon-xxx">，配合 @font-face 显示矢量图标。
 * i 用 inline-flex 让伪元素字形在盒内垂直居中，与同行文字在同一垂直中线上。
 * name 非 "anzhiyu-icon-" 前缀时视为无效并返回 null（避免渲染乱码方块）。
 *
 * 注：字库缺失的图标（如 anzhiyu-icon-copyright-line）以 CSS 补丁形式
 * 直接定义在 iconfont.css 末尾，无需在此处理；更新字库时整体替换该文件即可。
 */
export function Icon({ name, className }: IconProps) {
    if (!name || !name.startsWith("anzhiyu-icon-")) return null;
    return (
        <i
            className={cn("anzhiyufont inline-flex items-center justify-center leading-none", name, className)}
            aria-hidden="true"
        />
    );
}
