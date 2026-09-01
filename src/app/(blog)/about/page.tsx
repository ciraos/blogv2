import type { Metadata } from "next";
import Link from "next/link";

import { AboutSiteTips } from "@/components/(blog)/about-site-tips";
import { AboutStatisticCard } from "@/components/(blog)/about-statistic-card";

import { getPublicBasicStatsApi, getPublicSiteConfigApi } from "@/lib/api";
import { generateBlogMetadata } from "@/lib/seo";
import { resolveAssetUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
    const config = await getPublicSiteConfigApi().catch(() => null);
    const name = config?.about?.page?.name || "";
    const description = config?.about?.page?.description || "关于本站";
    return {
        ...(await generateBlogMetadata("关于")),
        description: name ? `关于 ${name} - ${description}` : description,
    };
}

// ===================== 小部件 =====================

function ItemTips({ children }: { children?: React.ReactNode }) {
    if (!children) return null;
    return <div className="mb-2.5 text-xs opacity-80">{children}</div>;
}

// 卡片基座
function Card({
    children,
    className = "",
    style,
}: {
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
}) {
    return (
        <section
            className={`about-slide-in relative overflow-hidden rounded-xl border bg-card p-4 ${className}`}
            style={style}
        >
            {children}
        </section>
    );
}

// ===================== 页面主体 =====================

export default async function About() {
    const config = await getPublicSiteConfigApi();
    const page = config.about.page;
    const enable = page.enable;
    const avatar = resolveAssetUrl(config.USER_AVATAR || page.avatar_img);

    // 访问统计
    let stats = {
        today_visitors: 0,
        today_views: 0,
        yesterday_visitors: 0,
        yesterday_views: 0,
        month_views: 0,
        year_views: 0,
    };
    try {
        stats = await getPublicBasicStatsApi();
    } catch (error) {
        console.error("获取访问统计失败", error);
    }

    const creativity = (config.CREATIVITY?.creativity_list || []) as { name: string; icon: string; color: string }[];
    // 技能图标横滚需要两遍
    const creativityPairs: { name: string; icon: string; color: string }[][] = [];
    if (creativity.length > 0) {
        const doubled = [...creativity, ...creativity];
        for (let i = 0; i + 1 < doubled.length; i += 2) {
            creativityPairs.push([doubled[i], doubled[i + 1]]);
        }
    }

    return (
        <div className="w-full space-y-3">
            {/* ===== 作者头像框（头像 + 两侧技能标签） ===== */}
            {enable.author_box && (
                <div className="flex items-center justify-center">
                    <div className="hidden flex-col items-end md:flex">
                        {(page.avatar_skills_left || []).map((skill, i) => {
                            const n = page.avatar_skills_left?.length ?? 1;
                            // 弧形环绕：首尾标签稍近，中间标签略外推（幅度克制）
                            const push = i === 0 || i === n - 1 ? 0 : 8;
                            return (
                                <span key={i} className="about-tag" style={{ marginRight: push }}>
                                    {skill}
                                </span>
                            );
                        })}
                    </div>

                    {avatar && (
                        <div className="avatar-wrap mx-8 md:mx-9">
                            <div className="avatar-img">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={avatar} alt="avatar" />
                            </div>
                            <span className="avatar-online" aria-hidden="true" />
                        </div>
                    )}

                    <div className="hidden flex-col items-start md:flex">
                        {(page.avatar_skills_right || []).map((skill, i) => {
                            const n = page.avatar_skills_right?.length ?? 1;
                            // 弧形环绕：首尾标签稍近，中间标签略外推（幅度克制）
                            const push = i === 0 || i === n - 1 ? 0 : 8;
                            return (
                                <span key={i} className="about-tag" style={{ marginLeft: push }}>
                                    {skill}
                                </span>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ===== 大标题 ===== */}
            <div className="my-2.5 text-center text-4xl font-bold leading-none md:text-5xl">关于本站</div>

            {/* ===== 自我介绍 + 关键词轮播 ===== */}
            {enable.page_content && page.name && (
                <div className="flex w-full flex-col gap-2.5 md:flex-row md:flex-wrap">
                    <Card
                        className="flex w-full flex-none flex-col justify-center border-transparent! text-white! md:min-h-50 md:flex-4"
                        style={{
                            background: "linear-gradient(120deg, #5b27ff 0%, #00d4ff 100%)",
                            backgroundSize: "200%",
                            animation: "about-gradient 15s ease infinite",
                        }}
                    >
                        <div className="leading-snug opacity-80">你好，很高兴认识你👋</div>
                        <div className="my-2.5 text-4xl font-bold leading-tight md:text-5xl">
                            我叫 <span className="whitespace-nowrap">{page.name}</span>
                        </div>
                        {page.description && <div className="opacity-80">{page.description}</div>}
                    </Card>
                    {page.about_site_tips && <AboutSiteTips config={page.about_site_tips} />}
                </div>
            )}

            {/* ===== 技能 + 生涯 ===== */}
            {(enable.skills || enable.careers) && (
                <div className="flex w-full flex-col gap-2.5 md:flex-row md:flex-wrap">
                    {enable.skills && page.skills_tips && (
                        <Card className="about-skills-card flex w-full flex-col items-start justify-center md:min-h-[450px] md:w-1/2">
                            <ItemTips>{page.skills_tips.tips}</ItemTips>
                            <span className="text-4xl font-bold leading-none">{page.skills_tips.title}</span>

                            {/* 旋转技能图标 */}
                            {creativityPairs.length > 0 && (
                                <div className="about-skills-tags-wrap relative mt-14 h-40 w-full overflow-hidden">
                                    <div className="about-skills-tags">
                                        {creativityPairs.map((pair, index) => (
                                            <div key={index} className="mr-4 flex-shrink-0">
                                                {pair.map((item, j) => (
                                                    <div
                                                        key={j}
                                                        className="flex h-[120px] w-[120px] items-center justify-center rounded-[30px] text-7xl font-bold text-white shadow-md"
                                                        style={{ background: item.color, marginTop: j === 1 ? 16 : undefined, transform: j === 1 ? "translateX(-60px)" : undefined, position: "relative" }}
                                                        title={item.name}
                                                    >
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img src={item.icon} alt={item.name} className="h-[60px] w-[60px] object-contain" />
                                                    </div>
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Hover 技能列表 */}
                            <div className="about-skills-list absolute left-0 top-0 mt-4 flex w-full flex-row flex-wrap opacity-0 transition-opacity duration-300">
                                {creativity.map((item, index) => (
                                    <div
                                        key={index}
                                        className="mt-2.5 mr-2.5 flex items-center rounded-[40px] border bg-background px-3 py-1 shadow-sm"
                                    >
                                        <div
                                            className="mr-2 flex h-8 w-8 items-center justify-center rounded-full"
                                            style={{ background: item.color }}
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={item.icon} alt={item.name} className="h-[18px] w-[18px] object-contain" />
                                        </div>
                                        <span>{item.name}</span>
                                    </div>
                                ))}
                                <div className="flex items-center">
                                    <span>...</span>
                                </div>
                            </div>
                        </Card>
                    )}

                    {enable.careers && page.careers && (
                        <Card
                            className="flex min-h-[260px] w-full flex-col justify-center md:min-h-[400px] md:flex-1"
                            style={{
                                backgroundImage: page.careers.img ? `url(${resolveAssetUrl(page.careers.img)})` : undefined,
                                backgroundRepeat: "no-repeat",
                                backgroundPosition: "right bottom",
                                backgroundSize: "contain",
                            }}
                        >
                            {/* 文字内容限宽：与 PC 端一致，图片留在右下角不重叠 */}
                            <div className="flex max-w-[70%] flex-col md:max-w-none">
                                <ItemTips>{page.careers.tips}</ItemTips>
                                <span className="text-4xl font-bold leading-none">{page.careers.title}</span>
                                <div className="mt-3 flex flex-col">
                                    {(page.careers.list || []).map((career, index) => (
                                        <div key={index} className="mb-2 flex items-center justify-start">
                                            <span
                                                className="mr-2 h-4 w-4 flex-shrink-0 rounded-full"
                                                style={{ background: career.color || "#357ef5" }}
                                            />
                                            <span className="opacity-80">{career.desc}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </Card>
                    )}
                </div>
            )}

            {/* ===== 统计 + 地图信息 ===== */}
            {(enable.statistic || enable.map_and_info) && (
                <div className="flex w-full flex-col gap-2.5 md:flex-row md:flex-wrap">
                    {enable.statistic && page.statistics_background && (
                        <AboutStatisticCard stats={stats} cover={resolveAssetUrl(page.statistics_background) ?? ""} />
                    )}
                    {enable.map_and_info && page.map && page.self_info && (
                        <div className="item-group flex w-full flex-col justify-between self-start md:min-w-0 md:flex-1">
                            <div
                                className="about-map relative mb-2 h-60 overflow-hidden rounded-xl border bg-card"
                                style={{ backgroundImage: `url(${resolveAssetUrl(page.map.background) ?? ""})`, backgroundPosition: "center", backgroundSize: "100%", transition: "all 1s ease-in-out" }}
                            >
                                <span className="absolute bottom-0 left-0 w-full bg-white/60 px-8 py-2 text-xl text-foreground backdrop-blur-xl">
                                    {page.map.title} <b>{page.map.strengthenTitle}</b>
                                </span>
                            </div>
                            <div className="rounded-xl border bg-card px-3 py-3 md:px-4">
                                {/* 第一行：生于 + 毕业院校（两列网格，毕业院校在右列） */}
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="flex min-w-0 flex-col">
                                        <span className="mb-2 truncate text-xs leading-none opacity-80">{page.self_info.tips1}</span>
                                        <span className="truncate text-2xl font-bold leading-none md:text-4xl" style={{ color: "#43a6c6" }}>{page.self_info.contentYear}</span>
                                    </div>
                                    <div className="flex min-w-0 flex-col">
                                        <span className="mb-2 truncate text-xs leading-none opacity-80">{page.self_info.tips2}</span>
                                        {/* 校名：单行显示，超长省略号，不换行 */}
                                        <span className="truncate text-2xl font-bold leading-none md:text-4xl" style={{ color: "#c69043" }}>{page.self_info.content2}</span>
                                    </div>
                                </div>
                                {/* 第二行：现在职业（独占一行，无分隔线） */}
                                <div className="mt-3 flex min-w-0 flex-col">
                                    <span className="mb-2 truncate text-xs leading-none opacity-80">{page.self_info.tips3}</span>
                                    <span className="truncate text-2xl font-bold leading-none md:text-4xl" style={{ color: "#b04fe6" }}>{page.self_info.content3}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ===== 性格 + 照片 ===== */}
            {(enable.personality || enable.photo) && (
                <div className="flex w-full flex-col gap-2.5 md:flex-row md:flex-wrap">
                    {enable.personality && page.personalities && (
                        <Card className="w-full md:min-h-[200px] md:w-[59%]">
                            <ItemTips>{page.personalities.tips}</ItemTips>
                            <div className="mb-1 text-xl leading-none">{page.personalities.authorName}</div>
                            <div className="text-4xl font-bold leading-tight" style={{ color: page.personalities.personalityTypeColor || "#ac899c" }}>
                                {page.personalities.personalityType}
                            </div>
                            <div className="absolute bottom-4 left-8 text-sm text-muted-foreground">
                                在{" "}
                                <a href="https://www.16personalities.com/" target="_blank" rel="noopener nofollow" className="hover:text-primary">
                                    16personalities
                                </a>{" "}
                                了解更多关于{" "}
                                <a href={page.personalities.nameUrl} target="_blank" rel="noopener external nofollow" className="hover:text-primary">
                                    {page.personalities.authorName}
                                </a>
                            </div>
                            {page.personalities.personalityImg && (
                                <div
                                    className="mt-4 flex justify-center md:absolute md:right-8 md:top-2.5 md:mt-0 md:w-[220px] md:justify-start"
                                    style={{ transitionTimingFunction: "cubic-bezier(0.13,0.45,0.21,1.02)" }}
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={resolveAssetUrl(page.personalities.personalityImg) ?? ""} alt="人格" className="mx-auto mb-5 block max-w-full md:mx-0" />
                                </div>
                            )}
                        </Card>
                    )}
                    {enable.photo && page.personalities?.photoUrl && (
                        <Card className="group flex min-h-[200px] w-full items-center justify-center overflow-hidden md:min-h-[240px] md:w-[39%]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={resolveAssetUrl(page.personalities.photoUrl) ?? ""}
                                alt="照片"
                                className="absolute min-h-full min-w-full object-cover transition-transform duration-1000 group-hover:scale-110"
                            />
                        </Card>
                    )}
                </div>
            )}

            {/* ===== 座右铭 + Buff ===== */}
            {(enable.maxim || enable.buff) && (
                <div className="flex w-full flex-col gap-2.5 md:flex-row md:flex-wrap">
                    {enable.maxim && page.maxim && (
                        <Card className="flex w-full flex-col items-start justify-center text-4xl font-bold leading-tight md:min-h-[200px] md:w-[39%]">
                            <ItemTips>{page.maxim.tips}</ItemTips>
                            <div className="flex flex-col">
                                <span className="mb-2 opacity-60">{page.maxim.top}</span>
                                <span>{page.maxim.bottom}</span>
                            </div>
                        </Card>
                    )}
                    {enable.buff && page.buff && (
                        <Card
                            className="group flex min-h-[200px] w-full flex-col items-start justify-center !border-transparent !text-white md:min-h-[200px] md:w-[59%] md:flex-[2]"
                            style={{
                                background: "linear-gradient(120deg, #ff27e8 0%, #ff8000 100%)",
                                backgroundSize: "200%",
                                animation: "about-gradient 15s ease infinite",
                            }}
                        >
                            <ItemTips>{page.buff.tips}</ItemTips>
                            <div className="flex flex-col">
                                <span className="mb-2 opacity-60">{page.buff.top}</span>
                                <span>{page.buff.bottom}</span>
                            </div>
                            {/* D20 骰子背景图标（纯装饰；移动端隐藏避免压住文字） */}
                            <svg
                                viewBox="0 0 480 512"
                                className="absolute -bottom-2/3 right-0 hidden h-48 w-48 opacity-20 transition-transform duration-1000 group-hover:rotate-[20deg] sm:block"
                                style={{ transform: "rotate(30deg)" }}
                            >
                                <path
                                    fill="currentColor"
                                    d="M106.75 215.06L1.2 370.95c-3.08 5 .1 11.5 5.93 12.14l208.26 22.07zM7.41 315.43L82.7 193.08L6.06 147.1c-2.67-1.6-6.06.32-6.06 3.43v162.81c0 4.03 5.29 5.53 7.41 2.09M18.25 423.6l194.4 87.66c5.3 2.45 11.35-1.43 11.35-7.26v-65.67l-203.55-22.3c-4.45-.5-6.23 5.59-2.2 7.57m81.22-257.78L179.4 22.88c4.34-7.06-3.59-15.25-10.78-11.14L17.81 110.35c-2.47 1.62-2.39 5.26.13 6.78zM240 176h109.21L253.63 7.62C250.5 2.54 245.25 0 240 0s-10.5 2.54-13.63 7.62L130.79 176zm233.94-28.9l-76.64 45.99l75.29 122.35c2.11 3.44 7.41 1.94 7.41-2.1V150.53c0-3.11-3.39-5.03-6.06-3.43m-93.41 18.72l81.53-48.7c2.53-1.52 2.6-5.16.13-6.78l-150.81-98.6c-7.19-4.11-15.12 4.08-10.78 11.14zm79.02 250.21L256 438.32v65.67c0 5.84 6.05 9.71 11.35 7.26l194.4-87.66c4.03-1.97 2.25-8.06-2.2-7.56m-86.3-200.97l-108.63 190.1l208.26-22.07c5.83-.65 9.01-7.14 5.93-12.14zM240 208H139.57L240 383.75L340.43 208z"
                                />
                            </svg>
                        </Card>
                    )}
                </div>
            )}

            {/* ===== 游戏 + 追番 ===== */}
            {(enable.game || enable.comic) && (
                <div className="flex w-full flex-col gap-2.5 md:flex-row md:flex-wrap">
                    {enable.game && page.game && (
                        <Card
                            className="group min-h-[200px] w-full !text-white md:min-h-[300px] md:w-[59%] md:flex-[1.5]"
                            style={{
                                backgroundImage: `url(${resolveAssetUrl(page.game.background) ?? ""})`,
                                backgroundSize: "cover",
                                backgroundPosition: "top",
                            }}
                        >
                            <ItemTips>{page.game.tips}</ItemTips>
                            <span className="text-4xl font-bold leading-none">{page.game.title}</span>
                            <div className="mt-auto flex items-center gap-2">
                                {page.game.title === "原神" && (
                                    <div className="relative hidden h-[62.5px] w-full max-w-[300px] overflow-hidden sm:block" aria-hidden="true" />
                                )}
                                {/* UID：左下角 + 半透明深色底突出显示（移动端背景图 cover 时右下角会被图盖住） */}
                                {page.game.uid && (
                                    <span className="inline-flex shrink-0 items-center rounded-full bg-black/45 px-3 py-1 text-sm font-medium text-white backdrop-blur-sm">
                                        {page.game.uid}
                                    </span>
                                )}
                            </div>
                        </Card>
                    )}
                    {enable.comic && page.comic?.list.length ? (
                        <Card className="group relative min-h-[200px] w-full overflow-hidden md:min-h-[300px] md:w-[39%] md:flex-1">
                            <div className="absolute left-0 top-0 z-[4] p-2.5 text-white">
                                <div className="mb-2.5 text-xs opacity-80">{page.comic.tips}</div>
                                <div className="text-4xl font-bold leading-none">{page.comic.title}</div>
                            </div>
                            <div className="absolute left-0 top-0 flex h-full w-full">
                                {page.comic.list.map((item, index) => (
                                    <a
                                        key={index}
                                        href={item.href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title={item.name}
                                        className="relative h-full flex-1 overflow-hidden transition-all duration-500 hover:z-[3] hover:flex-[2.5]"
                                        style={{ transitionTimingFunction: "cubic-bezier(0.4,0,0.2,1)" }}
                                    >
                                        <div className="absolute inset-0 overflow-hidden">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={resolveAssetUrl(item.cover) ?? ""} alt={item.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
                                        </div>
                                    </a>
                                ))}
                            </div>
                        </Card>
                    ) : null}
                </div>
            )}

            {/* ===== 技术偏好 + 音乐 ===== */}
            {(enable.like_tech || enable.music) && (
                <div className="flex w-full flex-col gap-2.5 md:flex-row md:flex-wrap">
                    {enable.like_tech && page.like && (
                        <Card
                            className="group min-h-[160px] w-full !text-white md:min-h-[230px] md:flex-1"
                            style={{
                                backgroundImage: `url(${resolveAssetUrl(page.like.background) ?? ""})`,
                                backgroundSize: "cover",
                                backgroundPosition: "top",
                            }}
                        >
                            <ItemTips>{page.like.tips}</ItemTips>
                            <div className="mb-2 text-4xl font-bold leading-none">{page.like.title}</div>
                            <div className="mt-auto flex items-center justify-between">
                                <span className="text-sm opacity-80">{page.like.bottom}</span>
                            </div>
                        </Card>
                    )}
                    {enable.music && page.music && (
                        <Card
                            className="group min-h-[220px] w-full !text-white md:min-h-[400px] md:flex-1"
                            style={{
                                backgroundImage: `url(${resolveAssetUrl(page.music.background) ?? ""})`,
                                backgroundSize: "cover",
                                backgroundPosition: "top",
                            }}
                        >
                            <ItemTips>{page.music.tips}</ItemTips>
                            <div className="mb-2 text-4xl font-bold leading-none">{page.music.title}</div>
                            <div className="mt-auto flex items-center justify-between">
                                <span className="text-sm opacity-80">跟 {page.name} 一起欣赏更多音乐</span>
                            </div>
                            {page.music.link && (
                                <div className="absolute bottom-6 right-8 z-10">
                                    <Link
                                        href={page.music.link}
                                        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-white/25 px-2.5 text-white shadow-lg backdrop-blur-xl transition-colors hover:bg-primary"
                                    >
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M7 17 17 7" />
                                            <path d="M7 7h10v10" />
                                        </svg>
                                        <span>更多推荐</span>
                                    </Link>
                                </div>
                            )}
                        </Card>
                    )}
                </div>
            )}
        </div>
    );
}
