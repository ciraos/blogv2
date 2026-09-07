"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import { ChevronRight } from "lucide-react"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

export interface NavMainItem {
  title: string
  url?: string
  icon?: React.ReactNode
  /** 有子项时渲染为可展开菜单（手风琴：一次只展开一个） */
  items?: { title: string; url: string; pro?: boolean }[]
}

/** 子菜单 PRO 徽章（右侧，primary 浅底 + sparkles 图标） */
function ProBadge() {
  return (
    <span className="ml-auto flex h-3.5 shrink-0 items-center gap-0.5 rounded bg-gradient-to-r from-violet-600 to-fuchsia-600 px-1.5 text-[10px] font-bold leading-none text-white shadow-sm">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        role="img"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="size-2.5! shrink-0"
      >
        <path d="M14 4.438A2.437 2.437 0 0 0 16.438 2h1.125A2.437 2.437 0 0 0 20 4.438v1.125A2.437 2.437 0 0 0 17.563 8h-1.125A2.437 2.437 0 0 0 14 5.563zM1 11a6 6 0 0 0 6-6h2a6 6 0 0 0 6 6v2a6 6 0 0 0-6 6H7a6 6 0 0 0-6-6zm3.876 1A8.04 8.04 0 0 1 8 15.124A8.04 8.04 0 0 1 11.124 12A8.04 8.04 0 0 1 8 8.876A8.04 8.04 0 0 1 4.876 12m12.374 2A3.25 3.25 0 0 1 14 17.25v1.5A3.25 3.25 0 0 1 17.25 22h1.5A3.25 3.25 0 0 1 22 18.75v-1.5A3.25 3.25 0 0 1 18.75 14z" />
      </svg>
      PRO
    </span>
  )
}

/* 悬停：背景加重（比默认 sidebar-accent 更明显） */
const HOVER_CLS =
  "hover:bg-[color-mix(in_oklch,var(--sidebar-accent),var(--sidebar-foreground)_8%)] hover:text-sidebar-accent-foreground"

/* 当前页主菜单项：实心主题色高亮 */
const ACTIVE_CLS =
  "bg-sidebar-primary text-sidebar-primary-foreground font-medium hover:bg-sidebar-primary/90 hover:text-sidebar-primary-foreground"

/* 当前页子菜单项：浅色主题填充高亮 */
const SUB_ACTIVE_CLS = "bg-sidebar-primary/10 text-sidebar-primary font-medium"

/* 所在分组（子项命中当前页）的主菜单：浅灰 + 加粗 */
const PARENT_ACTIVE_CLS = "bg-sidebar-accent font-medium"

export function NavMain({ items }: { items: NavMainItem[] }) {
  const pathname = usePathname()

  // 初始展开包含当前页面的分组
  const [openKey, setOpenKey] = useState<string | null>(
    () => items.find((item) => item.items?.some((sub) => sub.url === pathname))?.title ?? null
  )

  const groupActive = (item: NavMainItem) =>
    item.items?.some((sub) => sub.url === pathname) ?? false
  const itemActive = (item: NavMainItem) => item.url === pathname || groupActive(item)

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu className="gap-1.5">
          {items.map((item) =>
            item.items && item.items.length > 0 ? (
              /* ===== 可展开菜单项 ===== */
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  tooltip={item.title}
                  onClick={() => setOpenKey((prev) => (prev === item.title ? null : item.title))}
                  className={cn(
                    "min-h-10 w-full px-2.5 transition-colors",
                    groupActive(item) && PARENT_ACTIVE_CLS,
                    HOVER_CLS
                  )}
                >
                  {item.icon}
                  <span>{item.title}</span>
                  <ChevronRight
                    className={cn(
                      "ml-auto size-4 transition-transform duration-200",
                      openKey === item.title && "rotate-90"
                    )}
                  />
                </SidebarMenuButton>

                {openKey === item.title && (
                  <SidebarMenuSub className="gap-1 pt-1">
                    {item.items.map((sub) => {
                      const active = sub.url === pathname
                      return (
                        <SidebarMenuSubItem key={sub.title}>
                          <SidebarMenuSubButton
                            asChild
                            className={cn(
                              "min-h-9 transition-colors",
                              active ? SUB_ACTIVE_CLS : HOVER_CLS
                            )}
                          >
                            <a href={sub.url}>
                              <span>{sub.title}</span>
                              {sub.pro && <ProBadge />}
                            </a>
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
                    "min-h-10 px-2.5 transition-colors",
                    itemActive(item) ? ACTIVE_CLS : HOVER_CLS
                  )}
                >
                  <a href={item.url}>
                    {item.icon}
                    <span>{item.title}</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
