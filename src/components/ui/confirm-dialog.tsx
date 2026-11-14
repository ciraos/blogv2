"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export interface ConfirmDialogProps {
  open: boolean
  /** 标题：一句话说清「要做什么」，对齐原生 confirm 的第一行文案 */
  title: React.ReactNode
  /** 描述：换行文案（后果说明、路径、预览等）都塞这里，保留 \n */
  description?: React.ReactNode
  confirmText?: string
  cancelText?: string
  /** true = 删除/卸载/清空这类不可恢复的破坏性操作，确认按钮走 destructive 红 */
  danger?: boolean
  /**
   * "confirm"：确认 + 取消两个按钮（默认）。
   * "alert"：只有一个「知道了」按钮 —— 对应原生 window.alert 的单按钮提示。
   */
  variant?: "confirm" | "alert"
  /** 用户点了确认（alert 变体里即「知道了」） */
  onConfirm: () => void
  /** 取消 / Esc / 点遮罩 —— 一律按「未确认」处理 */
  onCancel: () => void
  /**
   * 关闭后把焦点还给谁。
   * 为什么要自己传：Radix 只在用了 <DialogTrigger> 时才会还原焦点（内部记住的是 triggerRef），
   * 而确认弹窗是 confirm() 编程打开的、没有 Trigger，不传的话关闭后焦点会掉到 body 上。
   */
  restoreFocusTo?: HTMLElement | null
}

/**
 * 站内统一的确认弹窗：替代 window.confirm / window.alert。
 *
 * 为什么不用 window.confirm：浏览器原生框的样式、字体、深浅色完全不受站点控制，
 * 在暗色主题下是一块突兀的系统白框（用户反馈「好难看」）。
 *
 * 复用 radix-ui 的 Dialog（与 ui/sheet.tsx 同一个包，不新增依赖），
 * 样式对齐站内其它模态框（article-import-dialog / link-import-dialog 同一套 class）。
 *
 * 交互约定：
 * - Esc / 点遮罩 / 点「取消」= 取消（不做右上角的 X，两态确认弹窗没必要）；
 *   两条路径都会走到 onCancel，Provider 里的 Promise 只结算一次，所以不会重复 resolve；
 * - 打开时焦点自动落在确认按钮上（Radix 的 autoFocus），
 *   所以「回车确认」由按钮自身触发，不额外绑定 Enter —— 避免一次回车触发两次确认；
 * - 关闭后焦点由 restoreFocusTo 手动还给打开弹窗的元素（Radix 的 triggerRef 在这里是空的）。
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = "确定",
  cancelText = "取消",
  danger = false,
  variant = "confirm",
  onConfirm,
  onCancel,
  restoreFocusTo,
}: ConfirmDialogProps) {
  const isAlert = variant === "alert"
  // alert 变体只有一个按钮，没传 confirmText 时给一个「知道了」的默认文案
  const primaryText = isAlert && confirmText === "确定" ? "知道了" : confirmText

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        // Radix 只在 Esc / 点遮罩时回调 false，语义都是「取消」
        if (!next) onCancel()
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          data-slot="confirm-dialog"
          data-variant={variant}
          onCloseAutoFocus={(event) => {
            const target = restoreFocusTo
            if (!target || !target.isConnected) return
            event.preventDefault()
            target.focus()
          }}
          className={cn(
            "fixed top-1/2 left-1/2 z-50 w-[min(94vw,26rem)] -translate-x-1/2 -translate-y-1/2",
            "soft-surface p-5 text-card-foreground",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          )}
        >
          <DialogPrimitive.Title
            data-slot="confirm-dialog-title"
            className="text-base font-semibold"
          >
            {title}
          </DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description
              data-slot="confirm-dialog-description"
              // whitespace-pre-line：调用方文案里的 \n 直接生效，不用改写成 JSX 片段
              className="mt-2 text-sm whitespace-pre-line text-muted-foreground"
            >
              {description}
            </DialogPrimitive.Description>
          ) : null}

          <div className="mt-5 flex justify-end gap-2">
            {isAlert ? null : (
              <Button
                type="button"
                variant="outline"
                data-slot="confirm-dialog-cancel"
                onClick={onCancel}
              >
                {cancelText}
              </Button>
            )}
            <Button
              type="button"
              variant={danger && !isAlert ? "destructive" : "default"}
              data-slot="confirm-dialog-confirm"
              autoFocus
              onClick={onConfirm}
            >
              {primaryText}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
