"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ListMusic,
    Loader2,
    MicVocal,
    Pause,
    Play,
    Repeat,
    Repeat1,
    Shuffle,
    SkipBack,
    SkipForward,
    Volume2,
    VolumeX,
    X,
} from "lucide-react";

import { findLyricIndex, parseLrc } from "@/lib/lyrics";
import { cn } from "@/lib/utils";
import type { LyricLine, PlayMode } from "@/types/music";

/**
 * 左下角迷你音乐播放器。
 *
 * 歌单与音乐馆一致：GET /api/public/music/playlist（后端读后台设置里的 music.player.playlist_id，
 * 配了 music.player.custom_playlist 时优先用自定义歌单）。
 * 后端歌单里 url 恒为空，音源与歌词要按 neteaseId 现取：POST /api/public/music/song-resources。
 *
 * 交互：默认收起成一颗会转的唱片；点击展开成小卡片
 * （播放/上一首/下一首/播放模式/进度/音量/歌词/播放列表）。
 * 位置在左下角，AI 助手开启时上移一层，避免两个按钮叠在一起。
 */

interface MiniSong {
    id: string;
    neteaseId: string;
    name: string;
    artist: string;
    pic: string;
    url: string;
    lrc: string;
}

const VOLUME_KEY = "mini-player:volume";
const INDEX_KEY = "mini-player:index";
const MODE_KEY = "mini-player:mode";

const MODE_META: Record<PlayMode, { label: string; Icon: typeof Repeat }> = {
    sequence: { label: "顺序播放", Icon: Repeat },
    shuffle: { label: "随机播放", Icon: Shuffle },
    repeat: { label: "单曲循环", Icon: Repeat1 },
};

function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
}

/** http → https：后端音源是 http 直链，HTTPS 站点会被当 mixed content 拦掉 */
function ensureHttps(url: string): string {
    return url.startsWith("http://") ? url.replace("http://", "https://") : url;
}

export function MiniMusicPlayer({ embedded = false }: { embedded?: boolean }) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const lyricsBoxRef = useRef<HTMLDivElement | null>(null);

    const [songs, setSongs] = useState<MiniSong[]>([]);
    const [index, setIndex] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [listOpen, setListOpen] = useState(false);
    const [showLyrics, setShowLyrics] = useState(false);
    const [lyrics, setLyrics] = useState<LyricLine[]>([]);
    const [mode, setMode] = useState<PlayMode>("sequence");
    const [current, setCurrent] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(0.6);
    const [muted, setMuted] = useState(false);
    const [error, setError] = useState("");

    const currentSong = songs[index];
    const activeLyric = useMemo(() => findLyricIndex(lyrics, current), [lyrics, current]);

    // 歌单：进页面拉一次（同源代理，服务端已缓存 5 分钟）
    useEffect(() => {
        let cancelled = false;
        fetch("/api/public/music/playlist", { cache: "no-store" })
            .then((res) => res.json())
            .then((json: { data?: { songs?: MiniSong[] } }) => {
                if (cancelled) return;
                const list = Array.isArray(json?.data?.songs) ? json.data.songs : [];
                setSongs(list);

                // 恢复上次听到的那首、音量与播放模式（放在异步回调里，避免 effect 内同步 setState）
                let savedIndex = 0;
                let savedVolume = NaN;
                let savedMode = "";
                try {
                    savedIndex = Number(window.localStorage.getItem(INDEX_KEY) ?? 0) || 0;
                    savedVolume = Number(window.localStorage.getItem(VOLUME_KEY) ?? "");
                    savedMode = window.localStorage.getItem(MODE_KEY) ?? "";
                } catch {
                    // 忽略
                }
                setIndex(list.length > 0 ? Math.min(Math.max(savedIndex, 0), list.length - 1) : 0);
                if (Number.isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 1) setVolume(savedVolume);
                if (savedMode === "shuffle" || savedMode === "repeat" || savedMode === "sequence") setMode(savedMode);
            })
            .catch(() => {
                if (!cancelled) setError("歌单加载失败");
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // 音量：写回 audio + 持久化
    useEffect(() => {
        const audio = audioRef.current;
        if (audio) {
            audio.volume = volume;
            audio.muted = muted;
        }
        try {
            window.localStorage.setItem(VOLUME_KEY, String(volume));
        } catch {
            // 忽略
        }
    }, [volume, muted]);

    // 当前曲目/播放状态广播给页面（关于页的「此刻在听」监听 mini-player:state）。
    // 用自定义事件而不是全局 store：只有真正在用的页面才需要，零额外依赖。
    useEffect(() => {
        if (!currentSong) return;
        window.dispatchEvent(
            new CustomEvent("mini-player:state", {
                detail: { name: currentSong.name, artist: currentSong.artist, playing },
            })
        );
    }, [currentSong, playing]);

    // 歌词自动滚动：把当前行滚到歌词框中间（只动容器，不带动整页）
    useEffect(() => {
        const box = lyricsBoxRef.current;
        if (!box || activeLyric < 0) return;
        const target = box.querySelector<HTMLElement>(`[data-lyric-index="${activeLyric}"]`);
        if (!target) return;
        const top = target.offsetTop - box.clientHeight / 2 + target.clientHeight / 2;
        box.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }, [activeLyric]);

    /** 播放第 i 首：优先用歌单自带 url，否则按 neteaseId 现取音源；歌词同一次请求里带回 */
    const playAt = useCallback(
        async (i: number) => {
            const song = songs[i];
            const audio = audioRef.current;
            if (!song || !audio) return;

            setIndex(i);
            setLoading(true);
            setError("");
            try {
                window.localStorage.setItem(INDEX_KEY, String(i));
            } catch {
                // 忽略
            }

            try {
                let url = song.url?.trim() ?? "";
                let lyricsText = "";

                if (!url && song.neteaseId) {
                    const res = await fetch("/api/public/music/song-resources", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ neteaseId: song.neteaseId }),
                    });
                    const json = (await res.json().catch(() => null)) as {
                        data?: { audioUrl?: string; lyricsText?: string } | null;
                        message?: string;
                    } | null;
                    url = json?.data?.audioUrl?.trim() ?? "";
                    lyricsText = json?.data?.lyricsText ?? "";
                    if (!url) setError(json?.message || "这首取不到音源");
                } else if (song.lrc?.trim()) {
                    // 自定义歌单：lrc 既可能是内联歌词，也可能是 .lrc 链接
                    const lrc = song.lrc.trim();
                    if (/^https?:\/\//i.test(lrc)) {
                        lyricsText = await fetch(lrc)
                            .then((r) => (r.ok ? r.text() : ""))
                            .catch(() => "");
                    } else {
                        lyricsText = lrc;
                    }
                }

                setLyrics(parseLrc(lyricsText));

                if (!url) return;
                audio.src = ensureHttps(url);
                await audio.play();
                setPlaying(true);
            } catch {
                setError("播放失败，换一首试试");
                setPlaying(false);
            } finally {
                setLoading(false);
            }
        },
        [songs]
    );

    const nextRandom = useCallback(() => {
        if (songs.length <= 1) return 0;
        let next = index;
        while (next === index) next = Math.floor(Math.random() * songs.length);
        return next;
    }, [index, songs.length]);

    const togglePlay = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;
        if (!audio.src) {
            void playAt(index);
            return;
        }
        if (audio.paused) {
            void audio
                .play()
                .then(() => setPlaying(true))
                .catch(() => setError("播放失败"));
        } else {
            audio.pause();
            setPlaying(false);
        }
    }, [index, playAt]);

    /** 手动切歌：识别当前模式（单曲循环只影响「播完自动」，手动仍按顺序/随机走） */
    const step = useCallback(
        (delta: number) => {
            if (songs.length === 0) return;
            const next = mode === "shuffle" ? nextRandom() : (index + delta + songs.length) % songs.length;
            void playAt(next);
        },
        [index, mode, nextRandom, playAt, songs.length]
    );

    /** 播完一首之后的行为：单曲循环重播、随机抽一首、顺序下一首 */
    const handleEnded = useCallback(() => {
        if (mode === "repeat") {
            const audio = audioRef.current;
            if (audio) {
                audio.currentTime = 0;
                void audio.play().catch(() => setPlaying(false));
            }
            return;
        }
        step(1);
    }, [mode, step]);

    const cycleMode = () => {
        const order: PlayMode[] = ["sequence", "shuffle", "repeat"];
        const next = order[(order.indexOf(mode) + 1) % order.length];
        setMode(next);
        try {
            window.localStorage.setItem(MODE_KEY, next);
        } catch {
            // 忽略
        }
    };

    const seek = (ratio: number) => {
        const audio = audioRef.current;
        if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
        audio.currentTime = Math.min(Math.max(ratio, 0), 1) * audio.duration;
    };

    if (songs.length === 0) return null;

    const ModeIcon = MODE_META[mode].Icon;

    return (
        <div
            className={
                embedded
                    ? "flex flex-col items-start gap-2"
                    : "fixed bottom-5 left-5 z-40 flex flex-col items-start gap-2"
            }
            data-mini-music-player=""
        >
            <audio
                ref={audioRef}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={handleEnded}
                onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                onError={() => {
                    setError("音频加载失败");
                    setPlaying(false);
                }}
                preload="none"
            />

            {/* 展开面板 */}
            {expanded && (
                <div className="w-[min(20rem,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border bg-card/95 shadow-lg backdrop-blur-md">
                    <div className="flex items-start gap-3 p-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={currentSong?.pic || "/file.svg"}
                            alt=""
                            className={cn(
                                "size-12 shrink-0 rounded-full border object-cover",
                                playing ? "animate-[spin_8s_linear_infinite]" : ""
                            )}
                        />
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium" title={currentSong?.name}>
                                {currentSong?.name || "未选择歌曲"}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">{currentSong?.artist || "未知歌手"}</div>
                            <div className="mt-1 flex items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
                                <span>{formatTime(current)}</span>
                                <div
                                    role="slider"
                                    aria-label="播放进度"
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                    aria-valuenow={duration ? Math.round((current / duration) * 100) : 0}
                                    tabIndex={0}
                                    className="h-1.5 flex-1 cursor-pointer rounded-full bg-muted"
                                    onClick={(e) => {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        seek((e.clientX - rect.left) / rect.width);
                                    }}
                                >
                                    <div
                                        className="h-full rounded-full bg-primary transition-[width]"
                                        style={{ width: duration ? `${(current / duration) * 100}%` : "0%" }}
                                    />
                                </div>
                                <span>{formatTime(duration)}</span>
                            </div>
                        </div>
                        <button
                            type="button"
                            aria-label="收起"
                            className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            onClick={() => setExpanded(false)}
                        >
                            <X className="size-3.5" />
                        </button>
                    </div>

                    {/* 歌词：点「词」展开，当前行高亮并自动居中 */}
                    {showLyrics && (
                        <div
                            ref={lyricsBoxRef}
                            className="max-h-40 overflow-y-auto border-t bg-muted/20 px-3 py-2 text-center text-xs leading-6"
                        >
                            {lyrics.length === 0 ? (
                                <p className="py-3 text-muted-foreground">♪ 暂无歌词 ♪</p>
                            ) : (
                                lyrics.map((line, i) => (
                                    <p
                                        key={`${line.time}-${i}`}
                                        data-lyric-index={i}
                                        className={cn(
                                            "truncate transition-colors",
                                            i === activeLyric ? "font-medium text-primary" : "text-muted-foreground/70"
                                        )}
                                    >
                                        {line.text}
                                    </p>
                                ))
                            )}
                        </div>
                    )}

                    <div className="flex items-center gap-1 px-3 py-3">
                        <button
                            type="button"
                            aria-label="上一首"
                            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            onClick={() => step(-1)}
                        >
                            <SkipBack className="size-4" />
                        </button>
                        <button
                            type="button"
                            aria-label={playing ? "暂停" : "播放"}
                            className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105 disabled:opacity-60"
                            disabled={loading}
                            onClick={togglePlay}
                        >
                            {loading ? <Loader2 className="size-4 animate-spin" /> : playing ? <Pause className="size-4" /> : <Play className="size-4" />}
                        </button>
                        <button
                            type="button"
                            aria-label="下一首"
                            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            onClick={() => step(1)}
                        >
                            <SkipForward className="size-4" />
                        </button>

                        <button
                            type="button"
                            aria-label={MODE_META[mode].label}
                            title={MODE_META[mode].label}
                            className={cn(
                                "ml-0.5 rounded-full p-1.5 transition-colors hover:bg-muted",
                                mode === "sequence" ? "text-muted-foreground hover:text-foreground" : "text-primary"
                            )}
                            onClick={cycleMode}
                        >
                            <ModeIcon className="size-4" />
                        </button>

                        <button
                            type="button"
                            aria-label="歌词"
                            title="歌词"
                            aria-pressed={showLyrics}
                            className={cn(
                                "rounded-full p-1.5 transition-colors hover:bg-muted",
                                showLyrics ? "text-primary" : "text-muted-foreground hover:text-foreground"
                            )}
                            onClick={() => setShowLyrics((v) => !v)}
                        >
                            <MicVocal className="size-4" />
                        </button>

                        <button
                            type="button"
                            aria-label={muted ? "取消静音" : "静音"}
                            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            onClick={() => setMuted((v) => !v)}
                        >
                            {muted || volume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                        </button>
                        <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={muted ? 0 : volume}
                            aria-label="音量"
                            className="h-1 w-14 cursor-pointer accent-primary"
                            onChange={(e) => {
                                setMuted(false);
                                setVolume(Number(e.target.value));
                            }}
                        />

                        <button
                            type="button"
                            aria-label="播放列表"
                            aria-expanded={listOpen}
                            className={cn(
                                "ml-auto rounded-full p-1.5 transition-colors hover:bg-muted",
                                listOpen ? "text-primary" : "text-muted-foreground hover:text-foreground"
                            )}
                            onClick={() => setListOpen((v) => !v)}
                        >
                            <ListMusic className="size-4" />
                        </button>
                    </div>

                    {error && <p className="px-3 pb-2 text-[11px] text-destructive">{error}</p>}

                    {listOpen && (
                        <ul className="max-h-48 overflow-y-auto border-t">
                            {songs.map((song, i) => (
                                <li key={song.id || song.neteaseId || i}>
                                    <button
                                        type="button"
                                        className={cn(
                                            "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted",
                                            i === index ? "text-primary" : "text-foreground/80"
                                        )}
                                        onClick={() => void playAt(i)}
                                    >
                                        <span className="w-4 shrink-0 tabular-nums text-muted-foreground/70">{i + 1}</span>
                                        <span className="min-w-0 flex-1 truncate">{song.name}</span>
                                        <span className="shrink-0 truncate text-[11px] text-muted-foreground">{song.artist}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {/* 收起态：一颗唱片 + 歌名 */}
            {!expanded && (
                <button
                    type="button"
                    onClick={() => setExpanded(true)}
                    title={currentSong ? `${currentSong.name} - ${currentSong.artist}` : "打开音乐播放器"}
                    aria-label="打开音乐播放器"
                    className="flex items-center gap-2 rounded-full border bg-card/90 py-1 pr-3 pl-1 shadow-md backdrop-blur-md transition-colors hover:bg-card"
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={currentSong?.pic || "/file.svg"}
                        alt=""
                        className={cn(
                            "size-9 rounded-full border object-cover",
                            playing ? "animate-[spin_8s_linear_infinite]" : ""
                        )}
                    />
                    <span className="max-w-[9rem] truncate text-xs text-foreground/80">{currentSong?.name || "音乐"}</span>
                    <span
                        role="button"
                        tabIndex={0}
                        aria-label={playing ? "暂停" : "播放"}
                        className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground"
                        onClick={(e) => {
                            e.stopPropagation();
                            togglePlay();
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                togglePlay();
                            }
                        }}
                    >
                        {loading ? <Loader2 className="size-3.5 animate-spin" /> : playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                    </span>
                </button>
            )}
        </div>
    );
}
