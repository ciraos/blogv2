import type { Metadata } from "next";

import { ForgotPasswordPage } from "@/components/(auth)/forgot-password-page";

import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("找回密码");
}

/**
 * 找回密码第一步（填邮箱发信）。
 * 对应的远端接口：GET /auth/check-email、POST /auth/forgot-password
 * （同源代理 src/app/api/auth/check-email、forgot-password）。
 */
export default function ForgotPassword() {
    return <ForgotPasswordPage />;
}
