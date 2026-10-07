// 站点配置变更的「同源跨标签页广播」。
//
// 场景：后台「系统设置」保存后，希望同一个浏览器里已经打开的前台标签页立刻用上新配置
// （不用用户手动按刷新）。官方前端（anheyu-app-frontend）的做法就是这一套：
//   保存方 broadcastSiteConfigUpdate(改动键) → 写 localStorage + BroadcastChannel；
//   每个前台标签页 subscribeSiteConfigUpdates 收到后，按改动键决定
//   「自己整页刷新」还是「只重取一次站点配置」。
//
// 边界（用之前先看清楚，不然会误以为它能做更多）：
//  - 只在**同源**内有效：localStorage / BroadcastChannel 都按 origin 隔离。
//    A 域的后台改了配置，B 域的标签页收不到 —— 那种场景只能靠服务端推送（SSE/WS）；
//  - 只覆盖**站点配置**类改动；文章/评论/随笔等内容变更不在本机制内
//    （前台另有定时 + 唤醒刷新兜底，见 components/(blog)/live-refresher.tsx）；
//  - 发送方自己收不到自己的广播（BroadcastChannel 不回显给发送者、storage 事件不在本文档触发），
//    保存方自己的界面更新仍由它自己的 router.refresh() 负责。

/** localStorage 里承载广播载荷的键（storage 事件靠它做兜底通道） */
const STORAGE_KEY = "anheyu:site-config-update";

/** BroadcastChannel 名字 */
const CHANNEL_NAME = "anheyu:site-config";

export interface SiteConfigUpdatePayload {
    /** 毫秒时间戳，单调递增；用于「storage + BroadcastChannel 双通道送同一条」时去重 */
    version: number;
    /** 本次保存改动的后端配置键（点号路径，如 footer.socialBar.left） */
    updatedKeys: string[];
}

/**
 * 一改就必须「整页刷新」的键：它们影响的是 <head>（站点标题/描述/关键词/图标、内联配色变量）
 * 或 <html> 上的属性（data-skin、明暗模式），只重跑 RSC 不保证能可靠生效。
 *
 * 其余键（footer.*、USER_AVATAR、GRAVATAR_URL、DEFAULT_GRAVATAR_TYPE、ICP_NUMBER、ABOUT_LINK…）
 * 都由 (blog) 布局里的服务端组件渲染，router.refresh() 重跑一遍即可。
 *
 * CUSTOM_* 目前本站前台还没渲染（见 types/site-config.ts），一并列上是为了以后接上时口径正确。
 */
export const RELOAD_ON_CHANGE_KEYS: ReadonlySet<string> = new Set([
    "APP_NAME",
    "SUB_TITLE",
    "SITE_URL",
    "SITE_KEYWORDS",
    "SITE_DESCRIPTION",
    "ICON_URL",
    "LOGO_URL",
    "LOGO_URL_192x192",
    "LOGO_URL_512x512",
    "LOGO_HORIZONTAL_DAY",
    "LOGO_HORIZONTAL_NIGHT",
    "APPEARANCE_SKIN",
    "APPEARANCE_TOKENS",
    "DEFAULT_THEME_MODE",
    "THEME_LIGHT_START_TIME",
    "THEME_DARK_START_TIME",
    "RESPECT_REDUCED_MOTION",
    "CUSTOM_CSS",
    "CUSTOM_JS",
    "CUSTOM_HEADER_HTML",
    "CUSTOM_FOOTER_HTML",
]);

/**
 * 这次改动要不要整页刷新。
 * updatedKeys 为空（不知道改了啥，例如后台没给键列表）按「要」处理 —— 与官方口径一致，宁可刷重一点。
 */
export function impactsWholeDocument(updatedKeys?: string[] | null): boolean {
    if (!updatedKeys || updatedKeys.length === 0) return true;
    return updatedKeys.some((key) => RELOAD_ON_CHANGE_KEYS.has(key));
}

/** 每个标签页复用同一个 BroadcastChannel（懒创建；不关闭，避免影响后续订阅） */
let sharedChannel: BroadcastChannel | null | undefined;

/** 本标签页广播过的最新 version（保证单调递增，见 broadcastSiteConfigUpdate） */
let lastBroadcastVersion = 0;

function getChannel(): BroadcastChannel | null {
    if (sharedChannel !== undefined) return sharedChannel;
    try {
        sharedChannel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL_NAME);
    } catch {
        // 隐私模式 / 老浏览器：退化成只走 localStorage 的 storage 事件
        sharedChannel = null;
    }
    return sharedChannel;
}

/** 广播一次站点配置改动（后台保存设置后调用） */
export function broadcastSiteConfigUpdate(updatedKeys: string[] = []): void {
    if (typeof window === "undefined") return;

    // 同一毫秒内连发两次时保证 version 严格递增，避免接收端按 version 去重时把后一条丢掉
    lastBroadcastVersion = Math.max(Date.now(), lastBroadcastVersion + 1);
    const payload: SiteConfigUpdatePayload = { version: lastBroadcastVersion, updatedKeys };
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
        // 写不了 localStorage（隐私模式/配额）也没关系：还有 BroadcastChannel 这条路
    }
    try {
        getChannel()?.postMessage(payload);
    } catch {
        // 通道被关闭等异常：忽略，前台还有定时兜底刷新
    }
}

/** 订阅站点配置改动；返回取消订阅函数 */
export function subscribeSiteConfigUpdates(
    listener: (payload: SiteConfigUpdatePayload) => void
): () => void {
    if (typeof window === "undefined") return () => {};

    // 同一条广播可能被 storage 与 BroadcastChannel 各送一次 → 用 version 去重
    let lastVersion = 0;
    const emit = (payload: SiteConfigUpdatePayload | null | undefined) => {
        if (!payload || typeof payload.version !== "number") return;
        if (payload.version <= lastVersion) return;
        lastVersion = payload.version;
        listener({
            version: payload.version,
            updatedKeys: Array.isArray(payload.updatedKeys) ? payload.updatedKeys : [],
        });
    };

    // 兜底通道：其它标签页写 localStorage 时本文档收到的 storage 事件
    const onStorage = (event: StorageEvent) => {
        if (event.key !== STORAGE_KEY || !event.newValue) return;
        try {
            emit(JSON.parse(event.newValue) as SiteConfigUpdatePayload);
        } catch {
            // 载荷不是合法 JSON：忽略
        }
    };
    window.addEventListener("storage", onStorage);

    const channel = getChannel();
    const onMessage = (event: MessageEvent) => emit(event.data as SiteConfigUpdatePayload);
    channel?.addEventListener("message", onMessage);

    return () => {
        window.removeEventListener("storage", onStorage);
        // 只摘监听、不关闭共享通道：可能还有别的订阅者
        channel?.removeEventListener("message", onMessage);
    };
}
