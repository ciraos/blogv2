/* eslint-disable @next/next/no-img-element -- 唱片各层是后端 /static 下由 rewrites 同源代理的静态图、封面来自网易云 CDN，用不上 next/image */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
    List,
    ListOrdered,
    Loader2,
    Music2,
    Pause,
    Play,
    RefreshCw,
    Repeat1,
    Shuffle,
    SkipBack,
    SkipForward,
    Volume,
    Volume1,
    Volume2,
    VolumeX,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import type { LyricLine, PlayMode, Song } from "@/types/music";
import { parseLrc } from "@/lib/lyrics";
import { LyricsScroll } from "./lyrics-scroll";
import styles from "../music.module.css";

/** 没有封面/没有歌曲时的兜底色（与参照项目一致） */
const FALLBACK_ACCENT = "#667eea";
const FALLBACK_ACCENT_2 = "#764ba2";

/** http → https：后端返回的音源是 http 直链，HTTPS 站点直接播放会被当 mixed content 拦掉 */
function ensureHttps(url: string): string {
    return url.startsWith("http://") ? url.replace("http://", "https://") : url;
}

function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface MusicPlayerProps {
    songs: Song[];
    vinyl: {
        background: string;
        outer: string;
        inner: string;
        needle: string;
        groove: string;
    };
    /** 音源解析服务配置（site-config 的 music.api.*） */
    musicApi: {
        baseUrl: string;
        server: string;
        protocol: string;
    };
}

/**
 * 向 Meting 解析服务要一首歌的音源。
 * 参照项目就是这么调的：POST `${base_url}/Song_V1`，表单 url=歌曲ID、level=音质、type=json，
 * 返回 { url, lyric, level, size }。实测该服务放开了 CORS（Access-Control-Allow-Origin: *），
 * 所以浏览器可以直连，不需要走后端代理。
 * `server`（netease/tencent/…）是 Meting 的平台参数，本站按配置传；参照项目不传它。
 * 音质由调用方决定：先 exhigh，拿不到再降级 standard。
 */
async function fetchMetingSong(
    baseUrl: string,
    server: string,
    songId: string,
    level: "exhigh" | "standard"
): Promise<{ url: string; lyric: string; serverError: boolean }> {
    const form = new URLSearchParams();
    form.append("url", songId);
    form.append("level", level);
    form.append("type", "json");
    if (server) form.append("server", server);

    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/Song_V1`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
    });
    if (!res.ok) return { url: "", lyric: "", serverError: res.status >= 500 };

    const json = (await res.json()) as {
        status?: number;
        success?: boolean;
        data?: { url?: string; lyric?: string };
    };
    if (json?.status !== 200 || !json.success) return { url: "", lyric: "", serverError: false };
    return { url: json.data?.url ?? "", lyric: json.data?.lyric ?? "", serverError: false };
}

/**
 * 音乐馆播放器。
 *
 * 数据流：
 *   - 歌单：page.tsx 在服务端从后端取好（getMusicPlaylist）后传进来；
 *   - 音源 + 歌词：点播某首时才向 Meting（`music.api.base_url`）解析，按歌曲 ID 在内存里缓存。
 * 音源直链带时间戳会过期，所以不落盘缓存；播放出错会清掉缓存重取一次。
 */
export function MusicPlayer({ songs, vinyl, musicApi }: MusicPlayerProps) {
    const router = useRouter();
    const audioRef = useRef<HTMLAudioElement>(null);
    /** neteaseId → 已解析好的音源/歌词（内存缓存，避免重播重复请求） */
    const resourcesRef = useRef(new Map<string, { audioUrl: string; lyricsText: string }>());
    /** 请求令牌：快速连点上一首/下一首时，防止先发的响应回来把后发的覆盖掉 */
    const reqIdRef = useRef(0);
    const progressRef = useRef<HTMLDivElement>(null);

    const [index, setIndex] = useState(0);
    /** 用户是否想让它播（真正的 play() 交给下面那个 effect，因为音源是异步拿到的） */
    const [playIntent, setPlayIntent] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [audioSrc, setAudioSrc] = useState("");
    const [lyrics, setLyrics] = useState<LyricLine[]>([]);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [buffered, setBuffered] = useState(0);
    const [volume, setVolume] = useState(1);
    const [showVolume, setShowVolume] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [dragPercent, setDragPercent] = useState(0);
    const [showThumb, setShowThumb] = useState(false);
    const [playMode, setPlayMode] = useState<PlayMode>("sequence");
    const [isPending, startTransition] = useTransition();

    const current = songs[index] ?? null;

    /** 当前唱到哪一句歌词（二分找最后一个 time <= currentTime 的行） */
    const lyricIndex = useMemo(() => {
        if (lyrics.length === 0) return -1;
        const t = dragging ? (dragPercent / 100) * duration : currentTime;
        let lo = 0;
        let hi = lyrics.length - 1;
        let ans = -1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (lyrics[mid].time <= t) {
                ans = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        return ans;
    }, [lyrics, currentTime, dragging, dragPercent, duration]);

    const playedPercentage = duration > 0 ? ((dragging ? dragPercent : currentTime / duration) * 100) : 0;
    const loadedPercentage = duration > 0 ? Math.min(100, (buffered / duration) * 100) : 0;

    /** 取（或复用缓存的）音源与歌词；成功返回 true */
    const loadResources = useCallback(async (song: Song): Promise<boolean> => {
        const id = song.neteaseId || song.id;
        // 缓存键带上解析服务地址，避免改了 music.api.base_url 还命中旧结果
        const cacheKey = `${musicApi.baseUrl}|${id}`;
        const reqId = ++reqIdRef.current;
        setLoading(true);
        setError(null);
        try {
            let cached = resourcesRef.current.get(cacheKey);
            if (!cached) {
                if (musicApi.protocol === "meting") {
                    // protocol=meting：歌单自带音源地址，直接用（与参照项目一致）
                    if (!song.url) throw new Error("歌单里没有音源地址（protocol=meting）");
                    cached = { audioUrl: song.url, lyricsText: song.lrc || "" };
                } else {
                    // protocol=legacy：逐首解析，先 exhigh，拿不到再降级 standard
                    if (!id) throw new Error("这首歌缺少网易云 ID，取不到音源");
                    let result = await fetchMetingSong(musicApi.baseUrl, musicApi.server, id, "exhigh");
                    if (result.serverError) throw new Error("音乐服务暂时不可用");
                    if (!result.url) {
                        result = await fetchMetingSong(musicApi.baseUrl, musicApi.server, id, "standard");
                        if (result.serverError) throw new Error("音乐服务暂时不可用");
                    }
                    if (!result.url) throw new Error("该歌曲暂无可用音源");
                    cached = { audioUrl: result.url, lyricsText: song.lrc || result.lyric || "" };
                }
                resourcesRef.current.set(cacheKey, cached);
            }
            // 期间又切了歌：这次结果作废
            if (reqId !== reqIdRef.current) return false;
            setAudioSrc(ensureHttps(cached.audioUrl));
            setLyrics(parseLrc(cached.lyricsText));
            return true;
        } catch (e) {
            if (reqId !== reqIdRef.current) return false;
            setAudioSrc("");
            setLyrics([]);
            setError(e instanceof Error ? e.message : "取音源失败");
            return false;
        } finally {
            if (reqId === reqIdRef.current) setLoading(false);
        }
    }, [musicApi.baseUrl, musicApi.protocol, musicApi.server]);

    /** 切歌：重置进度与歌词；本来在播就顺手去取新歌音源（取好后由起播 effect 起播） */
    const selectSong = useCallback(
        (nextIndex: number) => {
            if (songs.length === 0) return;
            const wrapped = (nextIndex + songs.length) % songs.length;
            setIndex(wrapped);
            setCurrentTime(0);
            setDuration(0);
            setBuffered(0);
            setAudioSrc("");
            setLyrics([]);
            setError(null);
            if (playIntent) {
                const song = songs[wrapped];
                if (song) void loadResources(song);
            }
        },
        [songs, playIntent, loadResources]
    );

    const next = useCallback(() => {
        if (songs.length === 0) return;
        if (playMode === "repeat") {
            const audio = audioRef.current;
            if (audio) {
                audio.currentTime = 0;
                void audio.play().catch(() => setIsPlaying(false));
            }
            return;
        }
        if (playMode === "shuffle" && songs.length > 1) {
            let r = index;
            while (r === index) r = Math.floor(Math.random() * songs.length);
            selectSong(r);
            return;
        }
        selectSong(index + 1);
    }, [songs.length, playMode, index, selectSong]);

    const togglePlay = useCallback(() => {
        const audio = audioRef.current;
        if (!audio || !current) return;
        if (playIntent) {
            setPlayIntent(false);
            audio.pause();
            return;
        }
        setPlayIntent(true);
        // 音源是异步的，这里只负责去取；起播交给下面那个 effect（那时 React 才把 src 写到 <audio> 上）
        if (!audioSrc) void loadResources(current);
    }, [current, playIntent, audioSrc, loadResources]);

    /**
     * 起播：音源是异步拿到的，所以不能在上面的回调里直接 play() ——
     * setAudioSrc 之后 React 才把 src 写到 <audio> 上，那时读 audio.src 还是空的。
     * 这里统一在「想播 && 有音源 && 还没在播」时起播。
     */
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !playIntent || !audioSrc) return;
        if (!audio.paused) return;
        void audio.play().catch(() => setIsPlaying(false));
    }, [playIntent, audioSrc]);

    // 音量 / 静音
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.volume = volume;
        audio.muted = volume === 0;
    }, [volume]);

    // 播放失败（音源过期等）：清掉缓存重取一次，重取成功后由上面的 effect 起播
    const handleAudioError = useCallback(() => {
        if (!current) return;
        setIsPlaying(false);
        const cacheKey = `${musicApi.baseUrl}|${current.neteaseId || current.id}`;
        if (resourcesRef.current.delete(cacheKey) && audioSrc) {
            void loadResources(current);
            return;
        }
        setError("播放失败，音源可能已过期");
    }, [current, audioSrc, loadResources, musicApi.baseUrl]);

    // 键盘快捷键（与参照项目一致）
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
            switch (event.code) {
                case "Space":
                    event.preventDefault();
                    void togglePlay();
                    break;
                case "ArrowLeft":
                    event.preventDefault();
                    selectSong(index - 1);
                    break;
                case "ArrowRight":
                    event.preventDefault();
                    next();
                    break;
                case "ArrowUp":
                    event.preventDefault();
                    setVolume((v) => Math.min(1, Number((v + 0.1).toFixed(2))));
                    break;
                case "ArrowDown":
                    event.preventDefault();
                    setVolume((v) => Math.max(0, Number((v - 0.1).toFixed(2))));
                    break;
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [togglePlay, selectSong, next, index]);

    // 进度条点击 / 拖拽
    const percentFromEvent = (clientX: number) => {
        const el = progressRef.current;
        if (!el) return 0;
        const rect = el.getBoundingClientRect();
        return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    };
    const onProgressPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (duration <= 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
        setDragPercent(percentFromEvent(event.clientX));
    };
    const onProgressPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!dragging) return;
        setDragPercent(percentFromEvent(event.clientX));
    };
    const onProgressPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!dragging) return;
        const pct = percentFromEvent(event.clientX);
        const audio = audioRef.current;
        if (audio && duration > 0) audio.currentTime = (pct / 100) * duration;
        setDragging(false);
    };

    const VolumeIcon = volume === 0 ? VolumeX : volume > 0.6 ? Volume2 : volume > 0.3 ? Volume1 : Volume;
    const PlayModeIcon = playMode === "shuffle" ? Shuffle : playMode === "repeat" ? Repeat1 : ListOrdered;
    const playModeTitle = playMode === "shuffle" ? "随机播放" : playMode === "repeat" ? "单曲循环" : "顺序播放";
    const trackTitle = current ? `${current.name}${current.artist ? " - " + current.artist : ""}` : "";
    const hasSong = !!current;

    // 背景：有封面就用封面（CSS 里 blur 42px 让它变成氛围底色），没有就用兜底渐变
    const backgroundStyle = current?.pic
        ? { backgroundImage: `url("${current.pic}")`, backgroundColor: FALLBACK_ACCENT }
        : { backgroundImage: `linear-gradient(135deg, ${FALLBACK_ACCENT} 0%, ${FALLBACK_ACCENT_2} 100%)`, backgroundColor: FALLBACK_ACCENT };

    return (
        <div className={cn(styles.musicHome, !hasSong && styles.noSong)}>
            <audio
                ref={audioRef}
                src={audioSrc || undefined}
                preload="metadata"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
                onProgress={(e) => {
                    const audio = e.currentTarget;
                    if (audio.buffered.length > 0) setBuffered(audio.buffered.end(audio.buffered.length - 1));
                }}
                onEnded={next}
                onError={handleAudioError}
            />

            {/* 动态背景：有封面就用封面（CSS 里 blur 42px 让它变成氛围底色），没有就用兜底渐变 */}
            <div className={styles.musicBackground} style={backgroundStyle} />
            <div
                className={styles.musicBackgroundAura}
                style={{
                    backgroundImage:
                        "radial-gradient(circle at 18% 22%, rgb(102 126 234 / 48%) 0%, rgb(0 0 0 / 0%) 52%), radial-gradient(circle at 82% 78%, rgb(118 75 162 / 38%) 0%, rgb(0 0 0 / 0%) 56%)",
                }}
            />
            <div
                className={styles.backgroundOverlay}
                style={
                    {
                        "--music-overlay-soft": "rgba(102, 126, 234, 0.48)",
                        "--music-overlay-accent": "rgba(102, 126, 234, 0.72)",
                        "--music-overlay-shadow": "rgba(0, 0, 0, 0.46)",
                    } as React.CSSProperties
                }
            />

            <div className={styles.musicContainer}>
                <div className={styles.playerSection}>
                    {/* 唱片机：5 层图来自 site-config 的 music.vinyl；点唱片本身可播放/暂停 */}
                    <div className={styles.albumArtwork}>
                        <button
                            type="button"
                            className={cn(styles.artworkContainer, isPlaying && styles.isPlaying)}
                            style={{ cursor: hasSong ? "pointer" : "default" }}
                            aria-label={hasSong ? (isPlaying ? `暂停 ${current?.name}` : `播放 ${current?.name}`) : "暂无可播放歌曲"}
                            disabled={!hasSong}
                            onClick={() => void togglePlay()}
                        >
                            <img src={vinyl.background} alt="" aria-hidden="true" className={styles.vinylBackground} />
                            <img src={vinyl.outer} alt="" aria-hidden="true" className={styles.artworkImageVinylBackground} />
                            <img src={vinyl.inner} alt="" aria-hidden="true" className={styles.artworkImageVinylInnerBackground} />
                            <img
                                src={vinyl.needle}
                                alt=""
                                aria-hidden="true"
                                className={cn(styles.artworkImageNeedleBackground, isPlaying && styles.needlePlaying)}
                            />
                            <img src={vinyl.groove} alt="" aria-hidden="true" className={styles.artworkImageGrooveBackground} />

                            {/* 封面：有歌就是专辑图（转起来），没有就用占位 */}
                            {current?.pic ? (
                                <div className={styles.artworkTransitionWrapper}>
                                    <div className={styles.artworkRotateWrapper}>
                                        <img
                                            src={current.pic}
                                            alt={current.name}
                                            className={styles.artworkImage}
                                            style={{ borderColor: "rgba(102, 126, 234, 0.7)" }}
                                        />
                                        <img src={current.pic} alt="" aria-hidden="true" className={styles.artworkImageBlur} />
                                        <div className={styles.artworkBorderRing} />
                                    </div>
                                </div>
                            ) : (
                                <div className={styles.artworkPlaceholder}>
                                    <Music2 />
                                </div>
                            )}

                            {isPlaying && (
                                <div className={styles.playingIndicator}>
                                    <div className={styles.soundWave}>
                                        <div className={styles.waveBar} />
                                        <div className={styles.waveBar} />
                                        <div className={styles.waveBar} />
                                        <div className={styles.waveBar} />
                                    </div>
                                </div>
                            )}
                        </button>

                        <div className={styles.trackInfo}>
                            <h2 className={styles.trackTitle}>{trackTitle}</h2>
                            {error && <p className="mt-1 text-xs text-red-300/90">{error}</p>}
                        </div>
                    </div>

                    {/* 歌词 */}
                    <div className={styles.lyricsSection}>
                        <LyricsScroll lyrics={lyrics} currentIndex={lyricIndex} dominantColor={FALLBACK_ACCENT} />
                    </div>
                </div>

                {/* 播放控制 */}
                <div className={styles.playbackControls}>
                    <div className={styles.progressContainer}>
                        <span className={styles.timeLabel}>{formatTime(currentTime)}</span>
                        <div
                            ref={progressRef}
                            className={cn(styles.progressTrack, dragging && styles.dragging, loading && styles.isLoading)}
                            onPointerDown={onProgressPointerDown}
                            onPointerMove={onProgressPointerMove}
                            onPointerUp={onProgressPointerUp}
                            onPointerCancel={onProgressPointerUp}
                            onMouseEnter={() => setShowThumb(true)}
                            onMouseLeave={() => setShowThumb(false)}
                        >
                            <div className={cn(styles.progressBuffer, loadedPercentage > 0 && styles.hasContent)} style={{ width: `${loadedPercentage}%` }} />
                            <div className={styles.progressFill} style={{ width: `${playedPercentage}%` }} />
                            <div className={cn(styles.progressThumb, (showThumb || dragging) && styles.show)} style={{ left: `${playedPercentage}%` }} />
                        </div>
                        <span className={styles.timeLabel}>{formatTime(duration)}</span>
                    </div>

                    <div className={styles.controlButtons}>
                        {/* 刷新歌单：router.refresh() 重新跑一遍服务端取歌单 */}
                        <button
                            type="button"
                            aria-label={isPending ? "加载中..." : "刷新歌单"}
                            title={isPending ? "加载中..." : "刷新歌单"}
                            disabled={isPending}
                            onClick={() => startTransition(() => router.refresh())}
                            className={cn(styles.controlBtn, styles.secondary, styles.mobileHidden)}
                        >
                            {isPending ? <Loader2 className={styles.loadingIcon} size={20} /> : <RefreshCw size={20} />}
                        </button>

                        {/* 音量 */}
                        <div className={cn(styles.volumeControlWrapper, styles.mobileHidden)}>
                            <button
                                type="button"
                                aria-label="音量控制"
                                title="音量控制"
                                onClick={() => setShowVolume((v) => !v)}
                                className={cn(styles.controlBtn, styles.secondary)}
                            >
                                <VolumeIcon size={20} />
                            </button>
                            <div className={cn(styles.verticalVolumeSlider, showVolume && styles.show)}>
                                <div className={styles.volumeTrack}>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        aria-label="音量"
                                        className={styles.volumeRange}
                                        value={Math.round(volume * 100)}
                                        onChange={(e) => setVolume(Number(e.target.value) / 100)}
                                    />
                                </div>
                            </div>
                        </div>

                        <button
                            type="button"
                            aria-label="上一曲"
                            title="上一曲"
                            disabled={songs.length <= 1}
                            onClick={() => selectSong(index - 1)}
                            className={cn(styles.controlBtn, styles.secondary, styles.mobileOrder2)}
                        >
                            <SkipBack size={20} />
                        </button>

                        <button
                            type="button"
                            aria-label={loading ? "加载中..." : isPlaying ? "暂停" : "播放"}
                            title={loading ? "加载中..." : isPlaying ? "暂停" : "播放"}
                            disabled={!hasSong}
                            onClick={() => void togglePlay()}
                            className={cn(styles.controlBtn, styles.primary, styles.mobileOrder3, loading && styles.isLoadingBtn)}
                        >
                            {loading ? <Loader2 className={styles.loadingIcon} size={24} /> : isPlaying ? <Pause size={24} /> : <Play size={24} />}
                        </button>

                        <button
                            type="button"
                            aria-label="下一曲"
                            title="下一曲"
                            disabled={songs.length <= 1}
                            onClick={next}
                            className={cn(styles.controlBtn, styles.secondary, styles.mobileOrder4)}
                        >
                            <SkipForward size={20} />
                        </button>

                        {/* 播放列表（沿用本站 Drawer，列表项套上游 songItem 样式） */}
                        <Drawer swipeDirection="right">
                            <DrawerTrigger
                                render={
                                    <button
                                        type="button"
                                        aria-label="播放列表"
                                        title="播放列表"
                                        className={cn(styles.controlBtn, styles.secondary, styles.mobileOrder5)}
                                    />
                                }
                            >
                                <List size={20} />
                            </DrawerTrigger>
                            <DrawerContent>
                                <DrawerHeader>
                                    <DrawerTitle>播放列表</DrawerTitle>
                                    <DrawerDescription>
                                        {songs.length > 0 ? `共 ${songs.length} 首，点击即播放` : "歌单为空"}
                                    </DrawerDescription>
                                </DrawerHeader>
                                <div className={styles.playlistBody}>
                                    <div className={styles.playlistList}>
                                        {songs.map((song, i) => (
                                            <button
                                                key={song.id || song.neteaseId || i}
                                                type="button"
                                                onClick={() => selectSong(i)}
                                                className={cn(styles.songItem, i === index && styles.isActive)}
                                            >
                                                <div className={styles.songNumber}>
                                                    <span className={styles.number}>{i + 1}</span>
                                                </div>
                                                <div className={styles.songContent}>
                                                    <div className={styles.songMeta}>
                                                        <div className={styles.songTitle}>{song.name}</div>
                                                        <div className={styles.songArtist}>{song.artist || "—"}</div>
                                                    </div>
                                                </div>
                                                {song.pic ? (
                                                    <div className={styles.songArtwork}>
                                                        <img src={song.pic} alt="" aria-hidden="true" />
                                                    </div>
                                                ) : (
                                                    <div className={styles.songArtworkPlaceholder}>
                                                        <Music2 className="size-4" />
                                                    </div>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <DrawerFooter>
                                    <DrawerClose render={<Button variant="outline" />}>关闭</DrawerClose>
                                </DrawerFooter>
                            </DrawerContent>
                        </Drawer>

                        <button
                            type="button"
                            aria-label={playModeTitle}
                            title={playModeTitle}
                            onClick={() => setPlayMode((m) => (m === "sequence" ? "shuffle" : m === "shuffle" ? "repeat" : "sequence"))}
                            className={cn(styles.controlBtn, styles.secondary, styles.mobileOrder1)}
                        >
                            <PlayModeIcon size={20} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
