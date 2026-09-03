"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";

import { resolveAssetUrl } from "@/lib/utils";
import type { PageOneImageConfig, PageOneImageSingle } from "@/types/site-config";

/** site-config page.one_image 的载荷（config + hitokoto_api + typing_speed） */
export type OneImagePayload = PageOneImageConfig["one_image"];

/** pathname → 页面 key（决定用哪个配置） */
function matchPageKey(pathname: string): keyof OneImagePayload["config"] | null {
    if (pathname === "/") return "home";
    if (pathname === "/archives") return "archives";
    if (pathname === "/tags") return "tags";
    if (pathname === "/categories") return "categories";
    return null;
}

/** 打字机：逐字显示 text（text 变化时从头重打） */
function useTypewriter(text: string, speed: number, enabled: boolean) {
    const [shown, setShown] = useState("");
    useEffect(() => {
        // React Compiler 规则：effect 内不直接同步 setState，用宏任务包裹启动逻辑
        let timer: ReturnType<typeof setInterval> | null = null;
        const start = setTimeout(() => {
            if (!enabled || !text) {
                setShown(text);
                return;
            }
            let i = 0;
            setShown("");
            timer = setInterval(() => {
                i += 1;
                setShown(text.slice(0, i));
                if (i >= text.length && timer) clearInterval(timer);
            }, speed);
        }, 0);
        return () => {
            clearTimeout(start);
            if (timer) clearInterval(timer);
        };
    }, [text, speed, enabled]);
    return shown;
}

interface OneImageHeroProps {
    /** 站点配置 page.one_image 载荷（含 home/archives/tags/categories 各自配置） */
    oneImage?: OneImagePayload;
    /** 站点名称（mainTitle 为空时兜底） */
    appName?: string;
}

/**
 * 页面顶部大图（OneImage）：
 * 100vh 全屏背景图/视频（桌面/移动端各自媒体），垂直居中显示
 * 主标题 + 副标题（打字机），hitokoto 开启时用一言替换副标题打字；
 * 底部 scroll-down 按钮点击下滑。Header 悬浮其上（overlay 透明）。
 */
export function OneImageHero({ oneImage, appName = "博客" }: OneImageHeroProps) {
    const pathname = usePathname();
    const key = matchPageKey(pathname);
    const sectionRef = useRef<HTMLElement>(null);

    const cfg: PageOneImageSingle | undefined = key
        ? oneImage?.config?.[key]
        : undefined;

    // hitokoto 一言句子 + 加载状态（区分"请求中"与"失败/无句子"）
    const [hitokoto, setHitokoto] = useState("");
    const [hitokotoFailed, setHitokotoFailed] = useState(false);
    useEffect(() => {
        if (!cfg?.enable || !cfg.hitokoto) return;
        let cancelled = false;
        const api = oneImage?.hitokoto_api || "https://v1.hitokoto.cn/";
        fetch(api.endsWith("/") ? `${api}?encode=json` : api)
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
                if (cancelled) return;
                if (d?.hitokoto) setHitokoto(d.hitokoto);
                else setHitokotoFailed(true);
            })
            .catch(() => {
                if (!cancelled) setHitokotoFailed(true);
            });
        return () => {
            cancelled = true;
        };
    }, [cfg?.enable, cfg?.hitokoto, oneImage?.hitokoto_api]);

    // 页面启用大图时：给 footer 加标识类（移动端整页背景模式下，
    // footer 顶部以渐变过渡到页面背景色，避免图与 footer 生硬拼接）
    useEffect(() => {
        if (!cfg?.enable) return;
        const footer = document.getElementById("footer");
        footer?.classList.add("one-image-footer-fade");
        return () => footer?.classList.remove("one-image-footer-fade");
    }, [cfg?.enable]);

    // 打字机目标：hitokoto 开启时不显示副标题，只用一言（未加载完成前留空）；
    // hitokoto 关闭时才用副标题
    const hitokotoLoading = !!cfg?.enable && !!cfg?.hitokoto && !hitokoto && !hitokotoFailed;
    const typingTarget = cfg?.enable && cfg.hitokoto ? hitokoto : cfg?.subTitle || "";
    const typed = useTypewriter(
        typingTarget,
        oneImage?.typing_speed || 100,
        !!cfg?.enable && !!cfg?.typingEffect
    );

    if (!cfg?.enable) return null;

    const display = cfg.typingEffect ? typed : typingTarget;

    const desktopBg = resolveAssetUrl(cfg.background);
    const mobileBg = resolveAssetUrl(cfg.mobileBackground || cfg.background);
    const isDesktopVideo = cfg.mediaType === "video";
    const isMobileVideo = cfg.mobileMediaType === "video";

    const scrollDown = () => {
        window.scrollTo({ top: sectionRef.current?.offsetHeight ?? window.innerHeight, behavior: "smooth" });
    };

    return (
        <section
            ref={sectionRef}
            className="one-image-hero relative -mt-14 flex min-h-[100svh] w-full flex-col overflow-hidden"
        >
            {/* 桌面媒体（≥md）：video 或 image，fixed 相对视口 → 整页滚动背景不动 */}
            {isDesktopVideo ? (
                <video
                    className="fixed inset-0 z-0 hidden h-[100svh] w-full object-cover md:block"
                    src={desktopBg ?? undefined}
                    autoPlay={cfg.videoAutoplay}
                    loop={cfg.videoLoop}
                    muted={cfg.videoMuted}
                    playsInline
                />
            ) : (
                desktopBg && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={desktopBg}
                        alt=""
                        className="fixed inset-0 z-0 hidden h-[100svh] w-full object-cover md:block"
                    />
                )
            )}

            {/* 移动媒体（<md）：video 或 image，fixed 相对视口 → 整页滚动背景不动。
                背景层 z-0；正文与 footer 由 CSS 提升 z-index:1 悬浮其上 */}
            {isMobileVideo ? (
                <video
                    className="fixed inset-0 z-0 block h-[100svh] w-full object-cover md:hidden"
                    src={mobileBg ?? undefined}
                    autoPlay={cfg.mobileVideoAutoplay}
                    loop={cfg.mobileVideoLoop}
                    muted={cfg.mobileVideoMuted}
                    playsInline
                />
            ) : (
                mobileBg && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={mobileBg}
                        alt=""
                        className="fixed inset-0 z-0 block h-[100svh] w-full object-cover md:hidden"
                    />
                )
            )}

            {/* 整页顶部压暗：保证 header 白字可读（底部留透明，footer 过渡由 CSS 处理，两端通用） */}
            <div
                className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[40svh] bg-gradient-to-b from-black/40 to-transparent"
                aria-hidden="true"
            />

            {/* 中间：主标题 + 打字机副标题/一言 */}
            <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center text-white">
                <h1 className="one-image-title text-4xl font-bold tracking-wide drop-shadow-lg md:text-6xl">
                    {cfg.mainTitle || appName}
                </h1>
                {/* 副标题/一言：p 始终渲染避免消失闪顿；内容与光标随状态过渡 */}
                <p className="one-image-subtitle mt-4 flex h-6 items-center text-base text-white/90 drop-shadow md:h-7 md:text-xl">
                    {display}
                    {(hitokotoLoading || (cfg.typingEffect && display.length < typingTarget.length)) && (
                        <span className="one-image-caret ml-0.5 inline-block h-5 w-0.5 bg-white md:h-6" />
                    )}
                </p>
            </div>

            {/* 底部 scroll-down 按钮：点击下滑到内容区 */}
            <button
                type="button"
                onClick={scrollDown}
                aria-label="向下滚动"
                className="one-image-scroll-down relative z-10 mx-auto mb-3 flex size-10 items-center justify-center rounded-full text-white/90 transition-colors hover:text-white"
            >
                <ChevronDown className="size-7" strokeWidth={4} />
            </button>
        </section>
    );
}
