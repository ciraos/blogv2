"use client"

import * as React from "react"
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer"

import { cn } from "@/lib/utils"

/**
 * 基于 Base UI 的新版 Drawer（替代旧版 vaul 封装）。
 * 方向由 <Drawer swipeDirection="..."> 控制：'up' | 'down' | 'left' | 'right'（默认 'down'）。
 * 触发器/关闭按钮用 Base UI 的 `render` prop 组合元素（不再用 vaul 的 asChild）。
 */
function Drawer({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Root>) {
    return <DrawerPrimitive.Root data-slot="drawer" {...props} />
}

function DrawerPortal({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
    return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />
}

function DrawerTrigger({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
    return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

function DrawerClose({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Close>) {
    return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
}

function DrawerOverlay({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Backdrop>) {
    return (
        <DrawerPrimitive.Backdrop
            data-slot="drawer-overlay"
            className={cn(
                "fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
                className
            )}
            {...props}
        />
    )
}

function DrawerContent({
    className,
    children,
    ...props
}: React.ComponentProps<typeof DrawerPrimitive.Popup>) {
    return (
        <DrawerPortal>
            <DrawerOverlay />
            {/* Viewport 是 Popup 的容器（swipe 手势/touch 锁定依赖它），不拦截指针事件 */}
            <DrawerPrimitive.Viewport data-slot="drawer-viewport" className="pointer-events-none fixed inset-0 z-50">
                <DrawerPrimitive.Popup
                    data-slot="drawer-content"
                    className={cn(
                        "pointer-events-auto fixed flex flex-col bg-background text-foreground shadow-lg outline-none transition-transform duration-300 ease-out",
                        // 默认：底部（swipeDirection="down"）
                        "inset-x-0 bottom-0 max-h-[90dvh] w-full rounded-t-2xl border-t",
                        // 顶部
                        "data-[swipe-direction=up]:top-0 data-[swipe-direction=up]:bottom-auto data-[swipe-direction=up]:rounded-b-2xl data-[swipe-direction=up]:rounded-t-none data-[swipe-direction=up]:border-b data-[swipe-direction=up]:border-t-0",
                        // 左侧
                        "data-[swipe-direction=left]:inset-y-0 data-[swipe-direction=left]:left-0 data-[swipe-direction=left]:right-auto data-[swipe-direction=left]:h-full data-[swipe-direction=left]:max-h-none data-[swipe-direction=left]:w-3/4 data-[swipe-direction=left]:max-w-sm data-[swipe-direction=left]:rounded-r-2xl data-[swipe-direction=left]:rounded-t-none data-[swipe-direction=left]:border-r data-[swipe-direction=left]:border-t-0",
                        // 右侧
                        "data-[swipe-direction=right]:inset-y-0 data-[swipe-direction=right]:right-0 data-[swipe-direction=right]:left-auto data-[swipe-direction=right]:h-full data-[swipe-direction=right]:max-h-none data-[swipe-direction=right]:w-3/4 data-[swipe-direction=right]:max-w-sm data-[swipe-direction=right]:rounded-l-2xl data-[swipe-direction=right]:rounded-t-none data-[swipe-direction=right]:border-l data-[swipe-direction=right]:border-t-0",
                        // 进入/退出动画（隐藏态 translate 到屏幕外）
                        "data-[swipe-direction=down]:data-[starting-style]:translate-y-full data-[swipe-direction=down]:data-[ending-style]:translate-y-full",
                        "data-[swipe-direction=up]:data-[starting-style]:-translate-y-full data-[swipe-direction=up]:data-[ending-style]:-translate-y-full",
                        "data-[swipe-direction=left]:data-[starting-style]:-translate-x-full data-[swipe-direction=left]:data-[ending-style]:-translate-x-full",
                        "data-[swipe-direction=right]:data-[starting-style]:translate-x-full data-[swipe-direction=right]:data-[ending-style]:translate-x-full",
                        className
                    )}
                    {...props}
                >
                    {children}
                </DrawerPrimitive.Popup>
            </DrawerPrimitive.Viewport>
        </DrawerPortal>
    )
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="drawer-header"
            className={cn("flex flex-col gap-1.5 p-4", className)}
            {...props}
        />
    )
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="drawer-footer"
            className={cn("mt-auto flex flex-col gap-2 p-4", className)}
            {...props}
        />
    )
}

function DrawerTitle({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Title>) {
    return (
        <DrawerPrimitive.Title
            data-slot="drawer-title"
            className={cn("font-semibold text-foreground", className)}
            {...props}
        />
    )
}

function DrawerDescription({
    className,
    ...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) {
    return (
        <DrawerPrimitive.Description
            data-slot="drawer-description"
            className={cn("text-sm text-muted-foreground", className)}
            {...props}
        />
    )
}

export {
    Drawer,
    DrawerPortal,
    DrawerOverlay,
    DrawerTrigger,
    DrawerClose,
    DrawerContent,
    DrawerHeader,
    DrawerFooter,
    DrawerTitle,
    DrawerDescription,
}
