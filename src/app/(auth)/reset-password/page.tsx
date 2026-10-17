import type { Metadata } from "next";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { ResetPasswordPage } from "@/components/(auth)/reset-password-page";

import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("重置密码");
}

interface ResetSearchParams {
    publicUserId?: string;
    sign?: string;
}

/**
 * 找回密码第二步：承接重置邮件里的链接。
 *
 * 参数名与官方一致：?publicUserId=<id>&sign=<签名>（与 /activate 的激活链接同一套）。
 * 缺参数就直接渲染失效态，不发请求 —— 免得给后端送一次必然失败的调用。
 */
export default async function ResetPassword({ searchParams }: { searchParams: Promise<ResetSearchParams> }) {
    const sp = await searchParams;
    const publicUserId = typeof sp.publicUserId === "string" ? sp.publicUserId.trim() : "";
    const sign = typeof sp.sign === "string" ? sp.sign.trim() : "";

    if (!publicUserId || !sign) {
        return (
            <div className="flex w-full flex-col items-center gap-4 text-center">
                <TriangleAlert className="size-14 text-destructive" />
                <div className="space-y-1.5">
                    <h1 className="text-xl font-bold tracking-tight">链接已失效</h1>
                    <p className="text-sm text-muted-foreground">
                        这个重置链接缺少必要参数，可能已被复制时截断。请重新申请一封重置邮件。
                    </p>
                </div>
                <div className="mt-2 flex flex-wrap justify-center gap-3">
                    <Link
                        href="/forgot-password"
                        className="inline-flex items-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
                    >
                        重新发送邮件
                    </Link>
                    <Link
                        href="/login"
                        className="inline-flex items-center rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
                    >
                        返回登录
                    </Link>
                </div>
            </div>
        );
    }

    return <ResetPasswordPage publicUserId={publicUserId} sign={sign} />;
}
