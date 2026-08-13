import type { Metadata } from 'next';
import Link from 'next/link';

import { SiteConfigResponse } from "@/types/site-config";

const site_url = process.env.NEXT_PUBLIC_SITE_URL;
const api_url = process.env.NEXT_PUBLIC_API_URL;

export async function generateMetadata(): Promise<Metadata> {
    const a = await fetch(`${api_url}/public/site-config`);
    const data: SiteConfigResponse = await a.json();
    // console.log(site_url + data.data.ICON_URL);
    return {
        icons: site_url + data.data.ICON_URL,
        title: data.data.APP_NAME + " | 页面未找到喵！"
    };
}

export default function NotFound() {
    return (
        <div className="not-found w-full h-full flex items-center justify-center">
            <h2>Not Found</h2>
            <p>Could not find requested resource</p>
            <Link href="/">Return Home</Link>
        </div>
    )
}
