import type { Metadata } from "next";

import { LoginPage } from "@/components/(auth)/loginpage";

import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("登录");
}

export default async function Login({ searchParams }: { searchParams: Promise<{ registered?: string }> }) {
    const { registered } = await searchParams;

    return (
        <>
            <LoginPage registered={registered === "1"} />
        </>
    )
}
