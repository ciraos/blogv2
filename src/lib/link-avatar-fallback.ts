/**
 * 友链头像加载失败时的兜底图（jsdmirror CDN，浏览器直连）。
 *
 * 只用于友链相关界面（前台 /link 与后台友链管理）：站点 logo 来自各自的域名，
 * 经常 404 / 证书过期 / 被墙，统一换成这张图，比首字方块更容易认。
 */
export const LINK_AVATAR_FALLBACK =
    "https://cdn.jsdmirror.com/gh/ciraos/ciraos-static@main/img/404_1.avif";
