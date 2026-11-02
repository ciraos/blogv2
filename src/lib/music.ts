import { API_URL } from "@/lib/api";
import type { Song } from "@/types/music";

/**
 * 自定义歌单（site-config 的 `music.player.custom_playlist`）的 JSON 结构。
 *
 * 与官方主题的约定一致：一个数组，每项至少要有音频地址；字段名兼容两种常见写法
 * （`cover`/`pic`、`artist`/`singer`），缺的字段用空串兜底。
 * 例：
 * [ { "name": "歌名", "artist": "歌手", "url": "https://.../a.mp3", "cover": "https://.../c.jpg", "lrc": "https://.../a.lrc" } ]
 */
interface CustomPlaylistItem {
    name?: string;
    artist?: string;
    singer?: string;
    url?: string;
    cover?: string;
    pic?: string;
    lrc?: string;
    id?: string | number;
}

function normalizeCustomPlaylist(items: CustomPlaylistItem[]): Song[] {
    return items
        .filter((item) => item && typeof item.url === "string" && item.url.trim() !== "")
        .map((item, index) => {
            const id = item.id != null ? String(item.id) : `custom-${index}`;
            return {
                id,
                neteaseId: "",
                name: item.name?.trim() || `歌曲 ${index + 1}`,
                artist: (item.artist ?? item.singer ?? "").trim(),
                pic: (item.cover ?? item.pic ?? "").trim(),
                // 自定义歌单自带音频地址：播放器会直接用它，不再走音源解析
                url: item.url!.trim(),
                lrc: item.lrc?.trim() ?? "",
            } satisfies Song;
        });
}

/** 拉取自定义歌单；URL 无效 / 结构不对 / 网络失败都返回 null（调用方回落到后端歌单） */
async function getCustomPlaylist(url: string): Promise<Song[] | null> {
    try {
        const res = await fetch(url, { next: { revalidate: 300 } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as unknown;
        const list = Array.isArray(json) ? json : (json as { data?: unknown })?.data;
        if (!Array.isArray(list)) throw new Error("歌单 JSON 不是数组");
        const songs = normalizeCustomPlaylist(list as CustomPlaylistItem[]);
        if (songs.length === 0) throw new Error("自定义歌单里没有可用条目（缺少 url）");
        return songs;
    } catch (error) {
        console.error("[music] 自定义歌单读取失败，回落到后端歌单：", error);
        return null;
    }
}

/**
 * 取音乐播放列表。
 *
 * 优先用站点配置里的自定义歌单（`music.player.custom_playlist`，一个 JSON 地址），
 * 没配或读取失败时回落到后端歌单 `GET /public/music/playlist`。
 *
 * 在服务端直连后端：后端不开放 CORS，浏览器端得经过同源代理；
 * 而歌单是进页面就要用的（不像音源要等用户点播），放在 RSC 里取最省事，
 * 也避免把 276 首的 JSON 走一遍浏览器。
 *
 * 后端自己缓存了这份歌单，这里再缓存 5 分钟（管理员改了歌单最多 5 分钟生效；
 * 页面上的「刷新缓存」按钮走 router.refresh()，同样受这个窗口约束）。
 */
export async function getMusicPlaylist(customPlaylistUrl?: string | null): Promise<Song[]> {
    const customUrl = customPlaylistUrl?.trim();
    if (customUrl) {
        const custom = await getCustomPlaylist(customUrl);
        if (custom) return custom;
    }

    try {
        const res = await fetch(`${API_URL}/public/music/playlist`, { next: { revalidate: 300 } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { data?: { songs?: Song[] } };
        return json.data?.songs ?? [];
    } catch (error) {
        console.error("获取音乐播放列表失败", error);
        return [];
    }
}
