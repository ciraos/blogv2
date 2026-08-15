import type { Metadata } from "next";
import Link from "next/link";

import { EssayCard } from "@/components/(blog)/essay-card";
import { NumberedPagination } from "@/components/(blog)/numbered-pagination";
import {
    LinkIcon
} from "lucide-react";

import { ApiError, getPublicEssaysApi } from "@/lib/api";
import { generateBlogMetadata } from "@/lib/seo";
import { resolveAssetUrl } from "@/lib/utils";
import { SiteConfigResponse } from "@/types/site-config";

const site_url = process.env.NEXT_PUBLIC_SITE_URL;
const api_url = process.env.NEXT_PUBLIC_API_URL;
const PAGE_SIZE = 10;

interface EssaySearchParams {
    page?: string;
}

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("即刻");
}

export async function getSiteConfigs() {
    try {
        const i = await fetch(`${api_url}/public/site-config`);
        if (!i.ok) throw new Error("获取配置失败！");
        const data = (await i.json()) as SiteConfigResponse;
        // console.log(data);
        return data.data;
    } catch (error) {
        // return { APP_NAME: "博客", ICON_URL: "/favicon.ico", error };
        console.error(error);
    }
}

export default async function EssayPage({ searchParams }: { searchParams: Promise<EssaySearchParams> }) {
    const config = await getSiteConfigs();
    const { page: pageRaw } = await searchParams;
    const page = Math.max(1, parseInt(pageRaw ?? "1", 10) || 1);

    // /pro/essays 为公开接口，失败时展示友好提示
    let data;
    let errorMessage: string | null = null;
    try {
        data = await getPublicEssaysApi({ page, page_size: PAGE_SIZE });
    } catch (err) {
        errorMessage = err instanceof ApiError ? err.message : "网络请求失败";
        data = null;
    }

    // 空态 / 错误态
    if (!data || data.list.length === 0) {
        return (
            <div className="w-full space-y-6">
                <h1 className="text-2xl font-bold tracking-tight">即刻</h1>
                <p className="py-16 text-center text-sm text-muted-foreground">
                    {errorMessage ? `暂时无法获取内容：${errorMessage}` : "暂无内容，敬请期待"}
                </p>
            </div>
        );
    }

    const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

    return (
        <div className="w-full space-y-6">

            {config?.essay.home_enable ? (
                <div className="essay-banner relative h-56 md:h-75 overflow-hidden rounded-xl p-5 md:p-8 text-white flex flex-col justify-between">
                    {/* 背景图：top_background（相对路径拼站点前缀） */}
                    {resolveAssetUrl(config.essay.top_background) && (
                        <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={resolveAssetUrl(config.essay.top_background)!}
                                alt=""
                                className="absolute inset-0 h-full w-full object-cover"
                            />
                            {/* 遮罩：保证文字可读性 */}
                            <div className="absolute inset-0 bg-black/35" />
                        </>
                    )}

                    <div className="relative z-10">
                        <div className="mb-2 text-[.75rem] font-medium text-white/80">{config?.essay.tips}</div>
                        <div className="mb-4 block text-3xl font-bold leading-[1.2] md:text-[2.25rem]">{config?.essay.title}</div>
                    </div>
                    <div className="relative z-10 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                        <div className="min-w-0 flex-1 line-clamp-2 text-[.875rem] leading-normal text-white/90">{config?.essay.subtitle}</div>
                        <Link
                            href={config?.essay.button_link}
                            className="flex shrink-0 items-center rounded-lg bg-white/20 px-3.5 py-1.5 text-sm font-medium backdrop-blur-sm transition-colors hover:bg-white/30"
                        >
                            <LinkIcon className="mr-1 size-4.5" />
                            {config?.essay.button_text}
                        </Link>
                    </div>
                </div>
            ) : (<h1 className="text-2xl font-bold tracking-tight">即刻</h1>)}

            {/* 瀑布流：桌面 3 列（1/3 宽），平板 2 列，移动端 1 列；高度自适应、断列不截断 */}
            <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
                {data.list.map((essay) => (
                    <div key={essay.id} className="mb-4 break-inside-avoid">
                        <EssayCard essay={essay} />
                    </div>
                ))}
            </div>

            <NumberedPagination
                page={page}
                totalPages={totalPages}
                makePageHref={(p) => `/essay?page=${p}`}
            />
        </div>
    );
}
