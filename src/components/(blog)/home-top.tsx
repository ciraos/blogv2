import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import type { HomeTopConfig } from "@/types/site-config";

/**
 * 首页顶部 HOME_TOP（anzhiyu 风格）：
 * 站点标题区（title/subTitle/siteText）+ 分类快捷入口卡片 + 右侧新品 banner 链接。
 */
export function HomeTop({ homeTop }: { homeTop?: HomeTopConfig }) {
    if (!homeTop) return null;
    const { title, subTitle, siteText, category = [], banner } = homeTop;
    if (!title && !siteText && category.length === 0 && !banner?.title) return null;

    return (
        <section className="mb-10 overflow-hidden rounded-2xl bg-card shadow-sm">
            <div className="flex flex-col gap-6 p-6 md:flex-row md:items-center md:p-8">
                {/* 左侧：站点标题 + 分类快捷入口 */}
                <div className="min-w-0 flex-1">
                    {title && (
                        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
                    )}
                    {subTitle && <p className="mt-1 text-sm text-muted-foreground">{subTitle}</p>}
                    {siteText && (
                        <p className="mt-2 font-mono text-xs tracking-widest text-primary">{siteText}</p>
                    )}

                    {category.length > 0 && (
                        <div className="mt-5 flex flex-wrap gap-3">
                            {category.map((item) => {
                                // 兼容 hexo 风格路径 /categories/xxx/ → 本应用 query 式 /categories?name=xxx
                                const m = /^\/categories\/([^/]+)\/?$/.exec(item.path);
                                const href = m
                                    ? `/categories?name=${encodeURIComponent(decodeURIComponent(m[1]))}`
                                    : item.path;
                                const isExternal = href.startsWith("http");
                                return (
                                    <Link
                                        key={item.name}
                                        href={href}
                                        {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                                        className="group flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                                        style={
                                            item.background?.startsWith("linear-gradient")
                                                ? { background: item.background, color: "#fff", borderColor: "transparent" }
                                                : item.background
                                                    ? { backgroundImage: item.background }
                                                    : undefined
                                        }
                                    >
                                        <Icon name={item.icon} className="text-base leading-none" />
                                        <span className="font-medium">{item.name}</span>
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* 右侧：新品 banner（可选） */}
                {banner?.title && (
                    <Link
                        href={banner.link || "#"}
                        target={banner.isExternal ? "_blank" : undefined}
                        rel={banner.isExternal ? "noopener noreferrer nofollow" : undefined}
                        className="group relative block w-full shrink-0 overflow-hidden rounded-xl border p-5 text-white md:w-64"
                        style={
                            banner.image
                                ? {
                                      backgroundImage: `url(${banner.image})`,
                                      backgroundSize: "cover",
                                      backgroundPosition: "center",
                                  }
                                : {
                                      background: "linear-gradient(120deg,#425aef,#8a63d2)",
                                  }
                        }
                    >
                        <div className="absolute inset-0 bg-black/25" aria-hidden="true" />
                        <div className="relative z-10">
                            {banner.tips && (
                                <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs backdrop-blur-sm">
                                    {banner.tips}
                                </span>
                            )}
                            <div className="mt-8 text-xl font-bold">{banner.title}</div>
                        </div>
                    </Link>
                )}
            </div>
        </section>
    );
}
