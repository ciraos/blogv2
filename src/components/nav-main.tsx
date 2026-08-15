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
  items?: { title: string; url: string }[]
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
