import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const site_url = process.env.NEXT_PUBLIC_SITE_URL ?? ""

/**
 * 后端返回的资源可能是相对路径（如 /api/f/...），拼上站点前缀。
 * 空值或已是完整 URL 时原样处理。
 */
export function resolveAssetUrl(url?: string | null): string | null {
  if (!url) return null
  return url.startsWith("http") ? url : `${site_url}${url}`
}

/**
 * 把后端返回的「本站托管媒体」绝对地址转成同源相对路径（pathname + search）。
 *
 * 场景：本地开发时后端可能按生产站点配置返回 `https://blog.ciraos.top/api/f/...`，
 * 转成 `/api/f/...` 后由当前域名 + next.config 的 rewrites 代理到当前环境后端，
 * 也便于直接存进站点配置（与既有配置里的相对路径口径一致）。
 * Gravatar、第三方 OSS 等非本站路径保持原样。
 *
 * 名单必须与 next.config.ts 的 rewrites 保持一致，否则会出现「转成了相对路径、但没有代理」
 * 的 404。`/api/pro/f/` 是 PRO 版直链前缀（实测 302 到 /api/f/，同一个文件）。
 */
export function toSameOriginMediaUrl(url?: string | null): string {
  if (!url) return ""
  const trimmed = url.trim()
  if (trimmed.startsWith("/")) return trimmed
  try {
    const parsed = new URL(trimmed)
    const path = parsed.pathname + parsed.search
    if (
      path.startsWith("/api/f/") ||
      path.startsWith("/api/pro/f/") ||
      path.startsWith("/api/pro/images/") ||
      path.startsWith("/static/") ||
      path.startsWith("/needcache/")
    ) {
      return path
    }
  } catch {
    // 非绝对 URL（或畸形）：原样返回
    return trimmed
  }
  return trimmed
}
