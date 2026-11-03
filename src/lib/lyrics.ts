import type { LyricLine } from "@/types/music";

/**
 * 解析 LRC 歌词文本（网易云 song-resources 返回的 lyricsText）。
 *
 * 容错三种时间格式：`[mm:ss.xx]`、`[mm:ss:xx]`、`[mm:ss]`；
 * 时间戳后面允许多余字符（线上实测有 `[00:00.00-1] 作曲 : xxx` 这种带 `-1` 的写法）。
 */
export function parseLrc(text: string): LyricLine[] {
    if (!text) return [];
    const lines: LyricLine[] = [];
    for (const raw of text.split(/\r?\n/)) {
        const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?[^\]]*\]/g)];
        if (stamps.length === 0) continue;
        const content = raw.replace(/\[[^\]]*\]/g, "").trim();
        if (!content) continue;
        for (const m of stamps) {
            const min = Number(m[1]);
            const sec = Number(m[2]);
            const frac = m[3] ? Number(`0.${m[3]}`) : 0;
            lines.push({ time: min * 60 + sec + frac, text: content });
        }
    }
    // 多时间戳行会打乱顺序，统一按时间排一次
    return lines.sort((a, b) => a.time - b.time);
}

/** 当前时间对应的歌词行下标（找不到时返回 -1） */
export function findLyricIndex(lyrics: LyricLine[], time: number): number {
    if (lyrics.length === 0) return -1;
    let lo = 0;
    let hi = lyrics.length - 1;
    let ans = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (lyrics[mid].time <= time) {
            ans = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return ans;
}
