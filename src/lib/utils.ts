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
