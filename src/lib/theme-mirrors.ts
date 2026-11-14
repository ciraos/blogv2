/**
 * GitHub 加速镜像（主题包下载用）。
 *
 * 背景：Anheyu 安装 SSR 主题时，是**后端自己去下载** tar.gz（见 pkg/ssr/manager.go），
 * 所以「哪个镜像快」应该以**服务器视角**为准，而不是浏览器视角 —— 探测因此放在服务端
 * （src/app/api/admin/theme-mirrors/route.ts），这里只放共用的数据与 URL 规范化。
 *
 * 前缀规则：镜像都是「把原始 github 链接直接拼在前缀后面」，例如
 *   https://ghfast.top/https://github.com/owner/repo/releases/download/v1/x.tar.gz
 */

export interface ThemeMirror {
    /** 稳定标识，前端做 key */
    id: string;
    /** 展示名 */
    label: string;
    /** 拼在原始链接前面的部分；空串表示直连 GitHub */
    prefix: string;
}

export const THEME_MIRRORS: ThemeMirror[] = [
    { id: "direct", label: "GitHub 直连", prefix: "" },
    { id: "ghfast", label: "ghfast.top", prefix: "https://ghfast.top/" },
    { id: "ghproxy-net", label: "ghproxy.net", prefix: "https://ghproxy.net/" },
    { id: "gh-proxy", label: "gh-proxy.com", prefix: "https://gh-proxy.com/" },
    { id: "gitmirror", label: "hub.gitmirror.com", prefix: "https://hub.gitmirror.com/" },
    { id: "ghproxy-cc", label: "ghproxy.cc", prefix: "https://ghproxy.cc/" },
];

/** 允许探测的目标域名：GitHub 的下载链路（含 Release 附件的对象存储跳转） */
const ALLOWED_HOSTS = [
    "github.com",
    "www.github.com",
    "codeload.github.com",
    "objects.githubusercontent.com",
    "raw.githubusercontent.com",
    "gist.githubusercontent.com",
    "release-assets.githubusercontent.com",
];

/**
 * 从「可能已经带镜像前缀」的地址里，还原出原始 GitHub 链接。
 *
 * 用户可能先粘了 `https://ghfast.top/https://github.com/...`，
 * 再点测速；这里统一剥成 `https://github.com/...` 再重新生成候选，避免前缀套前缀。
 */
export function unwrapMirrorUrl(raw: string): string {
    const url = raw.trim();
    for (const mirror of THEME_MIRRORS) {
        if (!mirror.prefix) continue;
        if (url.startsWith(mirror.prefix)) {
            return url.slice(mirror.prefix.length);
        }
    }
    return url;
}

/** 原始链接是否是我们允许探测的 GitHub 地址 */
export function isAllowedThemeSource(raw: string): boolean {
    try {
        const url = new URL(raw);
        if (url.protocol !== "https:" && url.protocol !== "http:") return false;
        return ALLOWED_HOSTS.includes(url.hostname.toLowerCase());
    } catch {
        return false;
    }
}

/** 生成候选下载地址（直连 + 各镜像） */
export function buildMirrorCandidates(originalUrl: string): Array<ThemeMirror & { url: string }> {
    return THEME_MIRRORS.map((mirror) => ({ ...mirror, url: `${mirror.prefix}${originalUrl}` }));
}

/** 单个候选的测速结果（前端与服务端共用） */
export interface MirrorProbeResult {
    id: string;
    label: string;
    url: string;
    ok: boolean;
    status: number;
    /** 首字节耗时（ms） */
    ttfb: number;
    /** 拿到探测样本的总耗时（ms） */
    elapsed: number;
    /** 实测吞吐（MB/s） */
    speedMBps: number;
    bytes: number;
    /** 探测时拿到的包总大小（来自 content-range） */
    totalBytes?: number;
    /** 按实测吞吐估算的整包下载耗时（秒） */
    etaSeconds?: number;
    /** ETA 超过后端 60 秒超时阈值时置 true */
    slow?: boolean;
    error?: string;
}
