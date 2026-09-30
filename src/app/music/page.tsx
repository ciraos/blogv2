import type { Metadata } from "next";

import { generateBlogMetadata } from "@/lib/seo";
import { getMusicPlaylist } from "@/lib/music";
import { getSiteConfigs } from "@/lib/site-config";
import { MusicPlayer } from "./_components/music-player";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("音乐馆")
}

/**
 * 唱片机图片缺省值：site-config 的 music.vinyl.* 为空时回落到官方默认图（与官方主题一致）。
 * 这些路径由 next.config.ts 的 /static/:path* rewrite 转发到后端，所以前端同源可直取。
 */
const FALLBACK_VINYL = {
    background: "/static/img/music-vinyl-background.png",
    outer: "/static/img/music-vinyl-outer.png",
    inner: "/static/img/music-vinyl-inner.png",
    needle: "/static/img/music-vinyl-needle.png",
    groove: "/static/img/music-vinyl-groove.png",
};

/** 音乐解析服务（Meting）的缺省值：site-config 的 music.api.* 为空时回落 */
const FALLBACK_MUSIC_API = {
    baseUrl: "https://metings.qjqq.cn",
    server: "netease",
    protocol: "legacy",
};

export default async function Music() {
    // 歌单在服务端取（后端无 CORS，浏览器端要用同源代理；歌单是进页面就要用的，RSC 最省事）
    const [config, songs] = await Promise.all([getSiteConfigs(), getMusicPlaylist()]);

    const vinyl = {
        background: config?.music?.vinyl?.background || FALLBACK_VINYL.background,
        outer: config?.music?.vinyl?.outer || FALLBACK_VINYL.outer,
        inner: config?.music?.vinyl?.inner || FALLBACK_VINYL.inner,
        needle: config?.music?.vinyl?.needle || FALLBACK_VINYL.needle,
        groove: config?.music?.vinyl?.groove || FALLBACK_VINYL.groove,
    };

    // 音源与歌词由客户端直接向 Meting 解析服务请求（实测该服务放开了 CORS），所以这几个配置要传下去
    const musicApi = {
        baseUrl: config?.music?.api?.base_url || FALLBACK_MUSIC_API.baseUrl,
        server: config?.music?.api?.meting_server || FALLBACK_MUSIC_API.server,
        protocol: config?.music?.api?.protocol || FALLBACK_MUSIC_API.protocol,
    };

    // 背景、唱片、歌词、控制条都在客户端组件里（要跟着播放状态变），结构与 class 名对齐参照项目
    return <MusicPlayer songs={songs} vinyl={vinyl} musicApi={musicApi} />;
}
