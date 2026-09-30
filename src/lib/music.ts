import { API_URL } from "@/lib/api";
import type { Song } from "@/types/music";

/**
 * 取音乐播放列表（GET /public/music/playlist）。
 *
 * 在服务端直连后端：后端不开放 CORS，浏览器端得经过同源代理；
 * 而歌单是进页面就要用的（不像音源要等用户点播），放在 RSC 里取最省事，
 * 也避免把 276 首的 JSON 走一遍浏览器。
 *
 * 后端自己缓存了这份歌单，这里再缓存 5 分钟（管理员改了歌单最多 5 分钟生效；
 * 页面上的「刷新缓存」按钮走 router.refresh()，同样受这个窗口约束）。
 */
export async function getMusicPlaylist(): Promise<Song[]> {
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
