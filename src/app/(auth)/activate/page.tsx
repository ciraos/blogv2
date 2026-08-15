import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, TriangleAlert } from "lucide-react";

import { ApiError, activateApi } from "@/lib/api";
import { SiteConfigResponse } from "@/types/site-config";

const api_url = process.env.NEXT_PUBLIC_API_URL;

export async function generateMetadata(): Promise<Metadata> {
    try {
        const a = await fetch(`${api_url}/public/site-config`);
        const data: SiteConfigResponse = await a.json();
        return {
            title: data.data.APP_NAME + ' - 激活账号',
            description: data.data.SUB_TITLE,
        };
    } catch {
        return { title: '激活账号' };
    }
}

interface ActivateSearchParams {
    publicUserId?: string;
    sign?: string;
}

export default async function Activate({ searchParams }: { searchParams: Promise<ActivateSearchParams> }) {
    const sp = await searchParams;
    const publicUserId = typeof sp.publicUserId === "string" ? sp.publicUserId : "";
    const sign = typeof sp.sign === "string" ? sp.sign : "";

    // 服务端直接调用激活接口（无 CORS 问题）
    let success = false;
    let message: string;
    if (!publicUserId || !sign) {
        success = false;
        message = "激活链接无效或缺少参数";
    } else {
        try {
            await activateApi(publicUserId, sign);
            success = true;
            message = "账号已成功激活";
        } catch (err) {
            success = false;
            message = err instanceof ApiError ? err.message : "激活失败，请稍后重试";
        }
    }

    return (
        <div className="flex w-full max-w-sm mx-auto flex-col items-center gap-4 rounded-xl border bg-card p-10 text-center shadow-sm">
            {success ? (
                <CheckCircle2 className="size-14 text-green-500" />
            ) : (
                <TriangleAlert className="size-14 text-destructive" />
            )}

            <div className="space-y-1.5">
                <h1 className="text-xl font-bold tracking-tight">
                    {success ? "激活成功" : "激活失败"}
                </h1>
                <p className="text-sm text-muted-foreground">{message}</p>
            </div>

            <div className="mt-2 flex flex-wrap justify-center gap-3">
                {success ? (
                    <Link
                        href="/login"
                        className="inline-flex items-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
                    >
                        去登录
                    </Link>
                ) : (
                    <>
                        <Link
                            href="/register"
                            className="inline-flex items-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
                        >
                            重新注册
                        </Link>
                        <Link
                            href="/"
                            className="inline-flex items-center rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
                        >
                            返回首页
                        </Link>
                    </>
                )}
            </div>
        </div>
    );
}
