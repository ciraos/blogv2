// ===================== 音乐馆相关类型 =====================
// 对应后端两个接口：
//   GET  /public/music/playlist        → { songs: Song[], total: number }
//   POST /public/music/song-resources  → { audioUrl, lyricsText }（body: { neteaseId }）
// 依据：后端 swagger 的 music.Song / music.SongResourceResponse 定义 + 线上实测。

/** 播放列表里的单曲（后端 music.Song） */
export interface Song {
    id: string;
    /** 网易云歌曲 ID：取音源/歌词要用它 */
    neteaseId: string;
    name: string;
    artist: string;
    /** 封面图 */
    pic: string;
    /**
     * 后端目前恒为空字符串 —— 线上 276 首实测 url/lrc 全为空，
     * 音源与歌词必须另走 POST /public/music/song-resources。
     */
    url: string;
    lrc: string;
}

/** 解析后的歌词行 */
export interface LyricLine {
    /** 该行开始时间（秒） */
    time: number;
    text: string;
}

/** 播放模式：顺序 / 随机 / 单曲循环 */
export type PlayMode = "sequence" | "shuffle" | "repeat";

/** POST /public/music/song-resources 返回的 data */
export interface SongResources {
    audioUrl: string;
    lyricsText: string;
}
