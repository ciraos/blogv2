// 评论/用户头像地址（站点统一的 Gravatar 口径）
//
// 为什么单独抽出来：原先头像 URL 散落在多处（post-comments / comments-timeline / blog-sidebar /
// recentcomments / user-center），域名与 d= 参数各写各的（有的写死 cravatar.cn，有的写死 d=identicon
// 或 d=mp），既不读站点配置，也没有「无头像时兜底」这一层。
// 现在统一成：站点配置 GRAVATAR_URL + DEFAULT_GRAVATAR_TYPE 驱动（与线上 comment-utils.ts 一致）。

/** 头像配置来源：site-config 的 GRAVATAR_URL / DEFAULT_GRAVATAR_TYPE */
export interface GravatarConfig {
    /** 头像服务地址（可带或不带结尾 /，也可写成 …/avatar） */
    url?: string | null;
    /** 邮箱没有自定义头像时的兜底类型：monsterid / identicon / mp / retro … */
    defaultType?: string | null;
}

export const DEFAULT_GRAVATAR_BASE = process.env.NEXT_PUBLIC_GRAVATAR_URL || "https://cravatar.cn";
export const DEFAULT_GRAVATAR_TYPE = "identicon";

/** 头像请求尺寸（与线上 comment-utils.ts 的 140 对齐） */
const AVATAR_SIZE = 140;

/**
 * 归一化 Gravatar 基址：去掉结尾斜杠，并兼容「配置里已经带了 /avatar」的写法。
 * 后台设置项 GRAVATAR_URL 的占位文案就是 `https://cravatar.cn/avatar/`，
 * 而线上代码按「基址 + /avatar/哈希」拼接，两种写法都得能用，否则会拼出 /avatar/avatar/。
 *
 * 优先级：调用方传入的站点配置 GRAVATAR_URL > 构建期环境变量 NEXT_PUBLIC_GRAVATAR_URL > 内置默认。
 * 保留环境变量这一层是为了兼容老配置（自建镜像），但运行时以站点配置为准。
 *
 * ⚠️ 域名纠正（2026-10 实测，别删）：
 *   后台把 GRAVATAR_URL 填成了 `https://cravatar.cn/`，而 `cravatar.cn` 现在只发 **301**，
 *   跳转到 `https://cn.cravatar.com/avatar/...`；实测 `cn.cravatar.com` **连不上**
 *   （25s 超时，exit 28），于是**评论头像全部空白**——不是 404、不是错图，是干脆加载不出来。
 *   对照实测：`cravatar.com`（不带 .cn）→ `200 image/webp 4.5KB`，`secure.gravatar.com` 也超时。
 *   所以这里把已知「会 301 到不可达域名」的 cravatar.cn 直接改写成 cravatar.com；
 *   同时建议后台把 GRAVATAR_URL 改成 `https://cravatar.com/`（改配置是根治，这里是兜底）。
 */
export function normalizeGravatarBase(url?: string | null): string {
    const cleaned = (url || "")
        .trim()
        .replace(/\/+$/, "")
        .replace(/\/avatar$/i, "");
    const base =
        cleaned || DEFAULT_GRAVATAR_BASE.replace(/\/+$/, "").replace(/\/avatar$/i, "") || "https://cravatar.cn";
    // cravatar.cn → cravatar.com（前者 301 到一个连不上的镜像，见上面的实测记录）
    return base.replace(/^(https?:\/\/)(?:www\.)?cravatar\.cn(?=\/|$)/i, "$1cravatar.com");
}

/** 从 Gravatar 风格 URL 里取出邮箱哈希（只认 /avatar/<32 位 hex>；取不到 = 不是 Gravatar 链接） */
function gravatarHashFrom(url: string): string | null {
    const m = /\/avatar\/([0-9a-f]{32})(?:[?/]|$)/i.exec(url);
    return m ? m[1].toLowerCase() : null;
}

/**
 * 取一条评论的头像地址（永远返回可用 URL，不再出现「头像啥也不显示」）：
 *  1. 后端给了 avatar_url：
 *     · 上传的自定义头像（非 Gravatar 链接）→ 原样使用；
 *     · 只是个 Gravatar 链接（只含邮箱哈希）→ 按站点配置重建。后端的 d= 是写死的 identicon，
 *       不重建的话同一个人会在同一页出现两个不同头像（父评论走前端拼、子评论走后端给的）。
 *  2. 有 email_md5 → 走 Gravatar；邮箱没有自定义头像时，由 `d=` 让服务端生成兜底头像
 *     （本站配置为 DEFAULT_GRAVATAR_TYPE，例如 monsterid）；
 *  3. 连邮箱哈希都没有 → 用不带哈希的默认头像，保证仍有图。
 */
export function resolveCommentAvatar(
    comment: { avatar_url?: string | null; email_md5?: string | null },
    config?: GravatarConfig,
): string {
    const base = normalizeGravatarBase(config?.url);
    const type = (config?.defaultType || "").trim() || DEFAULT_GRAVATAR_TYPE;

    const backendAvatar = comment.avatar_url?.trim();
    if (backendAvatar) {
        const hash = gravatarHashFrom(backendAvatar);
        if (!hash) return backendAvatar; // 自定义头像，保持原样
        return `${base}/avatar/${hash}?s=${AVATAR_SIZE}&d=${type}`;
    }

    const md5 = comment.email_md5?.trim();
    if (md5) return `${base}/avatar/${md5}?s=${AVATAR_SIZE}&d=${type}`;
    return `${base}/avatar/?s=${AVATAR_SIZE}&d=${type}`;
}
