import type { Metadata } from "next";

import { LoginPage } from "@/components/(auth)/loginpage";
import type { OAuthProviderOption } from "@/components/(auth)/oauth-buttons";

import { generateBlogMetadata } from "@/lib/seo";
import { getSiteConfigs } from "@/lib/site-config";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("登录");
}

/** 服务商默认显示名（未配置 oauth.<id>.display_name 时用） */
const DEFAULT_LABELS: Record<string, string> = {
    qq: "QQ",
    wechat: "微信",
    github: "GitHub",
    google: "Google",
    microsoft: "Microsoft",
    logto: "Logto",
    oidc: "OIDC",
    rainbow: "Rainbow",
};

/** 按钮展示顺序：国内常用的排前面 */
const PROVIDER_ORDER = ["qq", "wechat", "github", "google", "microsoft", "logto", "oidc", "rainbow"];

/**
 * 第三方登录按钮清单：只取 `oauth.<id>.enable === true` 的，
 * 文案取 `oauth.<id>.display_name`。配置取不到就当没有（不影响账号密码登录）。
 */
async function getOAuthProviders(): Promise<OAuthProviderOption[]> {
    try {
        const config = await getSiteConfigs();
        const oauth = config?.oauth as Record<string, { enable?: boolean; display_name?: string }> | undefined;
        if (!oauth) return [];
        return PROVIDER_ORDER.filter((id) => oauth[id]?.enable === true).map((id) => ({
            id,
            label: oauth[id]?.display_name?.trim() || DEFAULT_LABELS[id] || id,
        }));
    } catch {
        return [];
    }
}

export default async function Login({ searchParams }: { searchParams: Promise<{ registered?: string }> }) {
    const { registered } = await searchParams;
    const oauthProviders = await getOAuthProviders();

    return (
        <>
            <LoginPage registered={registered === "1"} oauthProviders={oauthProviders} />
        </>
    )
}
