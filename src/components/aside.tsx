import Image from "next/image";
// import ImageAvatar from "@/components/ImageAvatar";
import { SiteConfigResponse } from "@/types/site-config";

const site_url = process.env.NEXT_PUBLIC_SITE_URL;
const api_url = process.env.NEXT_PUBLIC_API_URL;

export async function getSiteConfigs() {
    try {
        if (!api_url) throw new Error("API URL is not defined");
        const res = await fetch(`${api_url}/public/site-config`);
        if (!res.ok) throw new Error("获取配置失败！");
        const data = (await res.json()) as SiteConfigResponse;
        return data.data;
    } catch (error) {
        console.error(error);
    }
}

export default async function Aside() {
    const config = await getSiteConfigs();

    return (
        <>
            <div className="aside w-[26%] pl-3.75">
                <div className="h-80 py-4 px-6 bg-white rounded-sm relative">
                    aside
                </div>
            </div>
        </>
    );
}
