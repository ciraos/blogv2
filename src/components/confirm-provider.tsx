"use client"

import * as React from "react"

import { ConfirmDialog } from "@/components/ui/confirm-dialog"

/** confirm() 的入参：与 ConfirmDialog 的展示参数一一对应（open / 回调由 Provider 管） */
export interface ConfirmOptions {
  title: React.ReactNode
  description?: React.ReactNode
  confirmText?: string
  cancelText?: string
  /** 破坏性操作（删除 / 卸载 / 清空等不可恢复）：确认按钮走 destructive 红 */
  danger?: boolean
  /** "alert" = 单按钮提示（对应原 window.alert）；默认 "confirm" 两态 */
  variant?: "confirm" | "alert"
}

/**
 * 调用 confirm({...}) 的返回值：
 * - variant 为默认的 "confirm" 时：true = 点了确认，false = 取消 / Esc / 点遮罩；
 * - variant 为 "alert" 时：点「知道了」也返回 true（调用方通常忽略返回值）。
 */
export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = React.createContext<ConfirmFn | null>(null)

interface DialogState extends ConfirmOptions {
  open: boolean
}

/** 打开弹窗的元素（关闭后把焦点还回去）；Radix 的 Dialog 没有 Trigger，得我们自己记 */
function activeElementOrNull(): HTMLElement | null {
  return typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)
}

/**
 * 应用内确认弹窗的 Provider：在布局里包一层，业务组件用 useConfirm() 拿到 confirm()。
 *
 * 为什么做成 Promise 风格：原生 window.confirm 是同步阻塞取值，替换时写成
 * `if (!(await confirm({...}))) return;` 就能把原来的分支逻辑原样保留下来，
 * 调用点只多一个 await，语义不变。
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = React.useState<DialogState | null>(null)
  // resolve 放在 ref 里：弹窗关闭动画期间 state 还留着旧值，回调必须指向当前这次 confirm
  const resolverRef = React.useRef<((ok: boolean) => void) | null>(null)
  /** confirm() 那一刻的焦点元素：关闭后焦点还原到它。
   *  为什么是 state 而不是 ref：这个值要作为 `restoreFocusTo` 传给 ConfirmDialog（渲染期用），
   *  用 ref 就得在渲染期读 `openerRef.current`（react-hooks/refs：Cannot access refs during render）。
   *  它不是「渲染不需要的值」，所以应该进 state；写入点与 setDialog 同一次事件里，React 会批处理成一次渲染，
   *  不多出渲染轮次（弹窗关闭后 state 上仍留着它，语义与原来的 ref 一样）。 */
  const [opener, setOpener] = React.useState<HTMLElement | null>(null)

  /** 结算当前挂起的 Promise（只结算一次，重复调用无副作用） */
  const settle = React.useCallback((ok: boolean) => {
    const resolve = resolverRef.current
    resolverRef.current = null
    resolve?.(ok)
  }, [])

  const confirm = React.useCallback<ConfirmFn>((options) => {
    // 连续弹两次（理论上不该发生）：先把上一次按「取消」结算掉，避免它的 await 永远挂着
    resolverRef.current?.(false)
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
      setOpener(activeElementOrNull())
      setDialog({ ...options, open: true })
    })
  }, [])

  const requestClose = React.useCallback(
    (ok: boolean) => {
      settle(ok)
      // 保留 dialog 内容但置 open=false：让 Radix 播完关闭动画，也避免关闭瞬间文字闪空
      setDialog((prev) => (prev ? { ...prev, open: false } : prev))
    },
    [settle]
  )

  // 卸载时结算挂起的 Promise，否则调用方的 await 会一直悬着（例如切页途中弹窗被卸载）
  React.useEffect(() => {
    return () => {
      resolverRef.current?.(false)
      resolverRef.current = null
    }
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog ? (
        <ConfirmDialog
          open={dialog.open}
          variant={dialog.variant}
          title={dialog.title}
          description={dialog.description}
          confirmText={dialog.confirmText}
          cancelText={dialog.cancelText}
          danger={dialog.danger}
          restoreFocusTo={opener}
          onConfirm={() => requestClose(true)}
          onCancel={() => requestClose(false)}
        />
      ) : null}
    </ConfirmContext.Provider>
  )
}

/**
 * 取出 confirm()。必须在 <ConfirmProvider> 之下使用。
 *
 * 这里刻意抛错而不是回退到 window.confirm：缺 Provider 属于装配错误，
 * 应该立刻暴露出来，而不是悄悄退回原生弹窗（用户看到的就是那个「难看的框框」）。
 */
export function useConfirm(): ConfirmFn {
  const ctx = React.useContext(ConfirmContext)
  if (!ctx) {
    throw new Error("useConfirm 必须在 <ConfirmProvider> 内使用（检查 app/admin 或 app/(blog) 的 layout 是否包了 Provider）")
  }
  return ctx
}
