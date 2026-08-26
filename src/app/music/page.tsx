import type { Metadata } from "next";
import Link from "next/link";
import {
    ChevronLeft,
    ListMusic,
    MoreHorizontal,
    Play,
    RefreshCcw,
    Repeat,
    SkipBack,
    SkipForward,
    Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from "@/components/ui/drawer";
import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("音乐馆")
}

// 示例歌词
const SAMPLE_LYRICS = [
    "作词：某某",
    "作曲：某某",
    "编曲：某某",
    "",
    "城市的灯火渐渐熄灭",
    "我站在窗前数着星星",
    "那些回不去的从前",
    "像风一样轻轻吹过",
    "如果时间能够倒流",
    "我多想再拥抱你一次",
];

export default function Music() {
    return (
        <>
            {/* 顶部栏 */}
            <header className="flex shrink-0 items-center justify-between px-5 py-3">
                <Link href="/">
                    <ChevronLeft className="size-6 text-white/60" />
                </Link>
                <div className="text-sm font-medium tracking-wide">音乐馆</div>
                <MoreHorizontal className="size-6 text-white/60" />
            </header>

            {/* 主区域：桌面左右分栏（左唱片 / 右歌词），移动端上下 */}
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-4 lg:flex-row lg:gap-16">
                {/* 黑胶唱片 */}
                <div className="relative shrink-0">
                    {/* 旋转的唱片盘面 */}
                    <div className="relative size-48 animate-spin sm:size-60 lg:size-72 [animation-duration:24s]">
                        {/* 盘面：同心纹路 */}
                        <div
                            className="absolute inset-0 rounded-full bg-[#0b0b0d] shadow-[0_24px_70px_rgba(0,0,0,0.6)]"
                            style={{ backgroundImage: "repeating-radial-gradient(circle at 50% 50%, #17171c 0px, #17171c 2px, #202027 2px, #202027 3px)", }}
                        />
                        {/* 盘面反光 */}
                        <div className="absolute inset-0 rounded-full bg-[linear-gradient(125deg,transparent_32%,rgba(255,255,255,0.05)_46%,transparent_60%)]" />
                        {/* 中心封面 */}
                        <div className="absolute inset-0 m-auto flex size-[42%] items-center justify-center overflow-hidden rounded-full border-4 border-black/70 bg-linear-to-br from-[#ec4141] via-[#7c3aed] to-[#2563eb] shadow-inner">
                            <span className="text-5xl drop-shadow lg:text-6xl">🎵</span>
                        </div>
                        {/* 中心孔 */}
                        <div className="absolute inset-0 m-auto size-3 rounded-full bg-[#16161a] ring-2 ring-white/10" />
                    </div>

                    {/* 撞针（不随唱片旋转） */}
                    <div className="absolute -right-5 -top-3 z-10 origin-top-left rotate-[24deg]">
                        <div className="h-28 w-1 rounded-full bg-linear-to-b from-[#e8e8e8] to-[#7a7a7a] shadow" />
                        <div className="absolute -left-1 -top-1 size-3 rounded-full bg-[#e8e8e8] shadow" />
                        <div className="absolute -left-1.5 top-26 size-5 rounded-full bg-[#3a3a3f] shadow" />
                    </div>
                </div>

                {/* 歌词滚动区 */}
                <div className="relative w-full max-w-sm">
                    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-linear-to-b from-[#16161a] to-transparent" />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-linear-to-t from-[#16161a] to-transparent" />
                    <div className="max-h-[44dvh] overflow-y-auto py-24 text-center [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {SAMPLE_LYRICS.map((line, i) => (
                            <div
                                key={i}
                                className={`py-1.5 transition-all duration-300 ${i === 7
                                    ? "text-xl font-semibold text-white lg:text-2xl"
                                    : "text-sm text-white/35"
                                    }`}
                            >
                                {line || "· · ·"}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* 底部控制条 */}
            <footer className="shrink-0 px-6 pb-5 pt-0">
                <div className="mx-auto max-w-2xl">
                    {/* 进度条 */}
                    <div className="relative h-1.5 w-full rounded-full bg-white/10">
                        <div className="absolute left-0 top-0 h-full w-1/3 rounded-full bg-[#ec4141]" />
                        <div className="absolute left-1/3 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow" />
                    </div>
                    <div className="mt-2 flex justify-between text-xs tabular-nums text-white/40">
                        <span>00:42</span>
                        <span>03:21</span>
                    </div>

                    {/* 控制按钮 */}
                    <div className="mt-0 flex items-center justify-around">
                        <div className="flex items-center gap-5">
                            <RefreshCcw className="size-5 text-white/40" />
                            <Volume2 className="size-5 text-white/40" />
                            <SkipBack className="size-6 text-white/40" />
                            <button
                                type="button"
                                aria-label="播放"
                                className="flex size-11 items-center justify-center rounded-full bg-[#ec4141] text-white shadow-lg shadow-[#ec4141]/30 transition-transform hover:scale-105"
                            >
                                <Play className="ml-0.5 size-6" />
                            </button>
                            <SkipForward className="size-6 text-white/40" />
                            <Drawer swipeDirection="right">
                                <DrawerTrigger
                                    render={<Button variant="ghost" size="icon" />}
                                    className="text-white/40 hover:bg-transparent hover:text-white"
                                >
                                    <ListMusic className="size-5" />
                                </DrawerTrigger>
                                <DrawerContent>
                                    <DrawerHeader>
                                        <DrawerTitle>播放列表</DrawerTitle>
                                        <DrawerDescription>歌单内容占位</DrawerDescription>
                                    </DrawerHeader>
                                    <div className="p-4">{/* Content here */}</div>
                                    <DrawerFooter>
                                        <DrawerClose render={<Button variant="outline" />}>关闭</DrawerClose>
                                    </DrawerFooter>
                                </DrawerContent>
                            </Drawer>
                            <Repeat className="size-4 text-white/40" />
                        </div>
                    </div>
                </div>
            </footer>
        </>
    );
}
