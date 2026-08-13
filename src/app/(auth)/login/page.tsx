import type { Metadata } from "next";
import Image from "next/image";

import { LoginPage } from "@/components/(auth)/loginpage";

import { PostListResponse } from "@/types/articles";
import { SiteConfigResponse } from "@/types/site-config";

const site_url = process.env.NEXT_PUBLIC_SITE_URL;
const api_url = process.env.NEXT_PUBLIC_API_URL;

export async function generateMetadata(): Promise<Metadata> {
    const a = await fetch(`${api_url}/public/site-config`);
    const data: SiteConfigResponse = await a.json();
    // console.log(data.data.APP_NAME);
    return {
        title: data.data.APP_NAME + ' - 登录',
        description: data.data.SUB_TITLE,
    };
}

export default async function Login() {
    return (
        <>
            <LoginPage />
        </>
    )
}
