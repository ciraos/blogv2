"use client"

import * as React from "react"
import { ArrowUpRightIcon } from "lucide-react"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export function NavSecondary({
  items,
  ...props
}: {
  items: {
    title: string
    url: string
    icon: React.ReactNode
    target?: string
  }[]
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              {/* 收成图标栏时只留图标（hover 有 tooltip） */}
              <SidebarMenuButton asChild tooltip={item.title} className="group-data-[collapsible=icon]:justify-center">
                <a
                  href={item.url}
                  target={item.target}
                  rel={item.target === "_blank" ? "noopener noreferrer" : undefined}
                >
                  {item.icon}
                  <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
                  {/* 新标签页打开的入口给个外向箭头提示（收起成图标栏时隐藏） */}
                  {item.target === "_blank" && (
                    <ArrowUpRightIcon className="ml-auto size-3.5 shrink-0 opacity-50 group-data-[collapsible=icon]:hidden" />
                  )}
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
