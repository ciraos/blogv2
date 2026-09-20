import Link from "next/link";
import { ArrowLeft, LayoutDashboard, Wrench } from "lucide-react";

import styles from "@/components/admin/under-construction.module.css";

/**
 * 后台「功能开发中」占位：给还没实现的管理页面用，避免打开是一片空白。
 * 纯 SVG + CSS 绘制的插画（火箭 + 轨道 + 光晕 + 网格），跟随主题深浅色，尊重「减少动态效果」偏好。
 */
export function AdminUnderConstruction({
    title = "功能正在开发中",
    feature,
}: {
    title?: string;
    /** 具体是哪个功能，例如「相册管理」，会出现在副文案里 */
    feature?: string;
}) {
    const featureName = feature?.trim();
    return (
        <section className={styles.wrap} aria-label={title}>
            <span className={styles.tape} aria-hidden="true" />
            <span className={styles.grid} aria-hidden="true" />
            <span className={styles.glow} aria-hidden="true" />

            <div className={styles.stage} aria-hidden="true">
                <span className={styles.orbit} />
                <span className={`${styles.dot} ${styles.dot1}`} />
                <span className={`${styles.dot} ${styles.dot2}`} />
                <span className={`${styles.dot} ${styles.dot3}`} />
                <span className={`${styles.dot} ${styles.dot4}`} />

                <svg className={styles.rocket} viewBox="0 0 128 128" role="img" aria-hidden="true">
                    <defs>
                        <linearGradient id="auc-body" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.95" />
                            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.55" />
                        </linearGradient>
                        <linearGradient id="auc-window" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#fff" stopOpacity="0.95" />
                            <stop offset="100%" stopColor="var(--card)" stopOpacity="0.85" />
                        </linearGradient>
                        <linearGradient id="auc-flame" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.9" />
                            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.1" />
                        </linearGradient>
                    </defs>

                    {/* 尾焰 */}
                    <g className={styles.flame}>
                        <path d="M64 104c8 6 10 16 0 22-10-6-8-16 0-22z" fill="url(#auc-flame)" />
                        <path d="M64 100c4.5 4 6 10 0 14-6-4-4.5-10 0-14z" fill="var(--primary)" opacity="0.85" />
                    </g>

                    {/* 尾翼 */}
                    <path d="M44 74c-7 6-10 14-10 22 6-1 12-4 16-9z" fill="url(#auc-body)" />
                    <path d="M84 74c7 6 10 14 10 22-6-1-12-4-16-9z" fill="url(#auc-body)" />

                    {/* 箭体 */}
                    <path
                        d="M64 8c12 12 20 30 20 48 0 14-4 26-10 34H54c-6-8-10-20-10-34 0-18 8-36 20-48z"
                        fill="url(#auc-body)"
                        stroke="var(--primary)"
                        strokeWidth="1.5"
                        strokeOpacity="0.5"
                    />

                    {/* 舷窗 + 装饰线 */}
                    <circle cx="64" cy="52" r="12" fill="url(#auc-window)" stroke="var(--primary)" strokeWidth="2" />
                    <circle cx="64" cy="52" r="5.5" fill="var(--primary)" opacity="0.55" />
                    <path d="M55 76h18" stroke="var(--card)" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
                    <path d="M57 84h14" stroke="var(--card)" strokeWidth="2.5" strokeLinecap="round" opacity="0.55" />

                    {/* 小星星 */}
                    <circle cx="22" cy="36" r="2" fill="var(--primary)" opacity="0.7" />
                    <circle cx="106" cy="30" r="1.6" fill="var(--primary)" opacity="0.55" />
                    <circle cx="100" cy="62" r="1.2" fill="var(--primary)" opacity="0.45" />
                </svg>
            </div>

            <h2 className={styles.title}>{title}</h2>
            <p className={styles.subtitle}>
                {featureName ? `「${featureName}」` : "这个功能"}还在建设中 —— 后端接口与界面都在路上，敬请期待。
                <br />
                先用其它功能吧，已完成的部分都能正常使用。
            </p>

            <div className={styles.actions}>
                <Link href="/admin/dashboard" className={styles.primaryBtn}>
                    <LayoutDashboard className="size-4" />
                    返回仪表盘
                </Link>
                <Link href="/" className={styles.ghostBtn}>
                    <ArrowLeft className="size-4" />
                    回到前台
                </Link>
            </div>

            <p className="text-[11px] text-muted-foreground/70 mt-4 inline-flex items-center gap-1">
                <Wrench className="size-3" />
                已实现：文章管理、评论管理、文件管理、页面管理、友链管理、仪表盘
            </p>
        </section>
    );
}
