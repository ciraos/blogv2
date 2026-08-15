import type { Metadata } from "next";

import { RegisterPage } from "@/components/(auth)/registerpage";

import { SiteConfigResponse } from "@/types/site-config";

const api_url = process.env.NEXT_PUBLIC_API_URL;

export async function generateMetadata(): Promise<Metadata> {
    try {
        const a = await fetch(`${api_url}/public/site-config`);
        const data: SiteConfigResponse = await a.json();
        return {
            title: data.data.APP_NAME + ' - 注册',
            description: data.data.SUB_TITLE,
        };
    } catch {
        return { title: '注册' };
    }
}

export default async function Register() {
    return (
        <>
            <RegisterPage />
        </>
    )
}
