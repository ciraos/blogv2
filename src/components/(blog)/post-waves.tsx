/**
 * 文章页正文结尾的装饰波浪（后端 site-config 的 post.waves.enable 控制是否渲染）。
 *
 * 为什么用「两层 SVG + CSS 动画」：不引依赖、不占正文排版（绝对定位 + 固定高度），
 * 波形是 SVG path，深浅色都跟着 text-primary 主题色走（fill-current）。
 *
 * 无缝循环的做法：每条 path 的波形周期是 1440 单位、viewBox 宽 2880 → 两条相同波形；
 * 位移 -50%（= 1440）后图案与起始状态完全重合，所以动画首尾相接不闪跳。
 * 外层 overflow-hidden 兜住 200% 宽度，保证不会产生横向滚动条。
 * 动画本体写在 globals.css（.post-waves__layer），并对 prefers-reduced-motion 做兜底。
 */
export function PostWaves() {
    return (
        <div
            data-post-waves=""
            aria-hidden="true"
            className="post-waves pointer-events-none relative mt-6 h-12 select-none overflow-hidden md:h-16"
        >
            {/* 后层：相位相反、更慢、更淡，做出水面层次 */}
            <svg
                className="post-waves__layer post-waves__layer--back absolute inset-y-0 left-0 h-full w-[200%] fill-current text-primary/10"
                viewBox="0 0 2880 90"
                preserveAspectRatio="none"
                focusable="false"
            >
                <path d="M0,45 Q90,65 180,45 T360,45 T540,45 T720,45 T900,45 T1080,45 T1260,45 T1440,45 T1620,45 T1800,45 T1980,45 T2160,45 T2340,45 T2520,45 T2700,45 T2880,45 L2880,90 L0,90 Z" />
            </svg>
            {/* 前层：主波形 */}
            <svg
                className="post-waves__layer absolute inset-y-0 left-0 h-full w-[200%] fill-current text-primary/20"
                viewBox="0 0 2880 90"
                preserveAspectRatio="none"
                focusable="false"
            >
                <path d="M0,45 Q90,25 180,45 T360,45 T540,45 T720,45 T900,45 T1080,45 T1260,45 T1440,45 T1620,45 T1800,45 T1980,45 T2160,45 T2340,45 T2520,45 T2700,45 T2880,45 L2880,90 L0,90 Z" />
            </svg>
        </div>
    );
}
