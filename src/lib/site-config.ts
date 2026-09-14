import type { SiteConfig, SiteConfigResponse } from "@/types/site-config";

const api_url = process.env.NEXT_PUBLIC_API_URL;

/**
 * 获取后端站点总配置（内部使用，供各 layout 拉取前台主题默认模式等）。
 * 后端不开放 CORS，但 public/site-config 无需鉴权，服务端可直接 fetch 远端。
 */
export async function getSiteConfigs(): Promise<SiteConfig | undefined> {
    try {
        const i = await fetch(`${api_url}/public/site-config`);
        if (!i.ok) throw new Error("获取配置失败！");
        const data = (await i.json()) as SiteConfigResponse;
        return data.data;
    } catch (error) {
        console.error(error);
    }
}
