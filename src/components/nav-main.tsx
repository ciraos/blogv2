"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

export interface NavMainItem {
  title: string
  url?: string
  icon?: React.ReactNode
  /** 有子项时渲染为可展开菜单（手风琴：一次只展开一个） */
  items?: { title: string; url: string; pro?: boolean }[]
}

/** 子菜单 PRO 标记：等宽小字 + 发丝边，跟正文一样平。
 *  原来是「紫→品红渐变底 + 白色星芒图标 + 阴影」，那正是 slop 的定义：
 *  用渐变和发光告诉人「这个功能很高级」。后台是天天开着的工具，
 *  一个词 + 一条边就够表达「这条要 PRO 版」。
 *  星芒（Sparkles）尤其不能留 —— 它就是「AI 感」最明显的那个符号。 */
function ProBadge() {
  return (
    <span className="ml-auto shrink-0 border border-border px-1 font-mono text-[9px] leading-[14px] tracking-wide text-muted-foreground">
      PRO
    </span>
  )
}

/* 悬停：背景加重（比默认 sidebar-accent 更明显） */
const HOVER_CLS =
  "hover:bg-[color-mix(in_oklch,var(--sidebar-accent),var(--sidebar-foreground)_8%)] hover:text-sidebar-accent-foreground"

/* 当前页主菜单项：实心主题色高亮（跟随 --primary 主题色） */
const ACTIVE_CLS =
  // 当前页：不再是整块实心主色，改成「左侧 2px 主题色竖线 + 浅底 + 主题色文字」（和前台栏目标记同一套语言）
  "relative bg-primary/10 text-primary font-medium hover:bg-primary/15 before:absolute before:inset-y-1.5 before:left-0 before:w-[2px] before:rounded-full before:bg-primary"

/* 当前页子菜单项：浅色主题填充高亮（跟随主题色） */
const SUB_ACTIVE_CLS = "text-primary font-medium"

/* 所在分组（子项命中当前页）的主菜单：浅灰 + 加粗 */
const PARENT_ACTIVE_CLS = "bg-sidebar-accent/70 font-medium"

/**
 * 找出当前 pathname 对应的导航项 url。
 *
 * 只做 `url === pathname` 精确比较是不够的：进入 /admin/post-management/new、
 * /admin/storage/<id>、/admin/image-styles/cache 这类子页时，父项不会高亮、
 * 分组也不会自动展开（用户看到的症状是「我明明在后台，侧边栏却没选中任何一项」）。
 *
 * 所以按「精确命中 → 最长前缀」取一个：最长前缀能同时处理
 * /admin/image-styles 与 /admin/image-styles/cache 这种互为前缀的兄弟项，
 * 不会让两个都亮。
 */
function matchActiveUrl(items: NavMainItem[], pathname: string): string | null {
  const urls = items
    .flatMap((item) => [item.url, ...(item.items?.map((sub) => sub.url) ?? [])])
    .filter((url): url is string => Boolean(url))

  let best: string | null = null
  for (const url of urls) {
    const hit = pathname === url || pathname.startsWith(url.endsWith("/") ? url : `${url}/`)
    if (hit && (!best || url.length > best.length)) best = url
  }
  return best
}

export function NavMain({ items }: { items: NavMainItem[] }) {
  const pathname = usePathname()
  const { state, isMobile } = useSidebar()
  // 桌面端把侧边栏收成「图标栏」时：目录项点击在右侧弹出子菜单
  const iconMode = state === "collapsed" && !isMobile

  // 当前高亮的导航项（精确命中优先，其次最长前缀 —— 处理子页与互为前缀的兄弟项）
  const activeUrl = matchActiveUrl(items, pathname)

  // 初始展开包含当前页面的分组
  const [openKey, setOpenKey] = useState<string | null>(
    () => items.find((item) => item.items?.some((sub) => sub.url === matchActiveUrl(items, pathname)))?.title ?? null
  )

  // 客户端软导航（next/link）时 pathname 变化但组件不会重挂载，导致分组不跟随展开。
  // 用 React 推荐的「渲染期派生状态调整」（对比上一次 pathname）让页面所在分组跟随展开，
  // 避免在副作用里同步 setState（满足 React Compiler 的 lint：set-state-in-effect）。
  const [prevPathname, setPrevPathname] = useState(pathname)
  if (prevPathname !== pathname) {
    setPrevPathname(pathname)
    const nextActive = matchActiveUrl(items, pathname)
    const activeTitle =
      items.find((item) => item.items?.some((sub) => sub.url === nextActive))?.title ?? null
    if (activeTitle) {
      setOpenKey((prev) => (prev === activeTitle ? prev : activeTitle))
    }
  }

  const groupActive = (item: NavMainItem) =>
    item.items?.some((sub) => sub.url === activeUrl) ?? false
  const itemActive = (item: NavMainItem) => item.url === activeUrl || groupActive(item)

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu className="gap-1">
          {items.map((item) => {
            const hasChildren = Boolean(item.items && item.items.length > 0)

            /* ===== 图标栏模式下的目录项：点击图标 → 右侧弹出子菜单 ===== */
            if (hasChildren && iconMode) {
              return (
                <SidebarMenuItem key={item.title}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuButton
                        aria-label={item.title}
                        className={cn(
                          "min-h-9 w-full px-2.5 transition-colors group-data-[collapsible=icon]:justify-center",
                          groupActive(item) && PARENT_ACTIVE_CLS,
                          HOVER_CLS
                        )}
                      >
                        {item.icon}
                        <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
                        <ChevronRight className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
                      </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start" sideOffset={8} className="w-48">
                      {item.items!.map((sub) => (
                        <DropdownMenuItem key={sub.url} asChild>
                          <Link
                            href={sub.url}
                            className={cn(
                              "flex w-full cursor-pointer items-center gap-2",
                              sub.url === activeUrl && SUB_ACTIVE_CLS
                            )}
                          >
                            <span className="truncate">{sub.title}</span>
                            {sub.pro && <ProBadge />}
                          </Link>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              )
            }

            return hasChildren ? (
              /* ===== 展开态的可展开菜单项（手风琴：一次只展开一个） ===== */
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  tooltip={item.title}
                  onClick={() => setOpenKey((prev) => (prev === item.title ? null : item.title))}
                  className={cn(
                    "min-h-9 w-full px-2.5 transition-colors group-data-[collapsible=icon]:justify-center",
                    groupActive(item) && PARENT_ACTIVE_CLS,
                    HOVER_CLS
                  )}
                >
                  {item.icon}
                  <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
                  <ChevronRight
                    className={cn(
                      "ml-auto size-4 transition-transform duration-200 group-data-[collapsible=icon]:hidden",
                      openKey === item.title && "rotate-90"
                    )}
                  />
                </SidebarMenuButton>

                {openKey === item.title && (
                  <SidebarMenuSub className="gap-1 pt-1">
                    {item.items!.map((sub) => {
                      const active = sub.url === activeUrl
                      return (
                        <SidebarMenuSubItem key={sub.title}>
                          <SidebarMenuSubButton
                            asChild
                            className={cn(
                              "min-h-8 transition-colors",
                              active ? SUB_ACTIVE_CLS : HOVER_CLS
                            )}
                          >
                            <Link href={sub.url}>
                              <span>{sub.title}</span>
                              {sub.pro && <ProBadge />}
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )
                    })}
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>
            ) : (
              /* ===== 普通菜单项 ===== */
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  tooltip={item.title}
                  className={cn(
                    "min-h-10 px-2.5 transition-colors group-data-[collapsible=icon]:justify-center",
                    itemActive(item) ? ACTIVE_CLS : HOVER_CLS
                  )}
                >
                  {/* 软导航必须用 next/link：原来这里是 <a href>，每次点侧边栏都整页刷新，
                      TopProgress 与侧边栏折叠状态都会白做一遍 */}
                  <Link href={item.url ?? "#"}>
                    {item.icon}
                    <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
