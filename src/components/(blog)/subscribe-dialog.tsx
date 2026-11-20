"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { sendSubscribeCodeApi, subscribeApi } from "@/lib/api-subscribe";

export interface SubscribeDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** post.subscribe.dialog_title */
    title?: string;
    /** post.subscribe.dialog_desc */
    description?: string;
    /** post.subscribe.button_text（提交按钮文案，默认「订阅」） */
    submitText?: string;
}

/** 验证码重发冷却（秒） */
const COOLDOWN = 60;

/**
 * 文章订阅弹窗（后台 post.subscribe.*）。
 *
 * 两步式：邮箱 → 发验证码 → 填 6 位验证码 → 订阅成功。
 * 后端两个接口（见 lib/api-subscribe.ts）都是真接口，订阅成功会由后端发确认邮件。
 *
 * 为什么暂不做图形验证码：现在站上没开，先把链路跑通；将来后端要求 captcha 参数时，
 * 在 SendVerificationCode 的 body 里补字段即可（lib/api-subscribe.ts 里留了位置）。
 */
export function SubscribeDialog({ open, onOpenChange, title, description, submitText }: SubscribeDialogProps) {
    const [email, setEmail] = useState("");
    const [code, setCode] = useState("");
    const [codeSent, setCodeSent] = useState(false);
    const [sending, setSending] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const timer = useRef<number | null>(null);

    /** 打开时清空表单（放在事件里而不是 effect 里：effect 内同步 setState 会被 lint 拦，
     *  而且关闭动画期间保留旧内容更自然） */
    const resetForm = useCallback(() => {
        setCode("");
        setCodeSent(false);
        setDone(false);
        setSubmitting(false);
        setSending(false);
    }, []);

    const handleOpenChange = useCallback(
        (next: boolean) => {
            if (next) resetForm();
            onOpenChange(next);
        },
        [onOpenChange, resetForm]
    );

    // 重发倒计时
    useEffect(() => {
        if (cooldown <= 0) return;
        timer.current = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
        return () => {
            if (timer.current !== null) window.clearTimeout(timer.current);
        };
    }, [cooldown]);

    const sendCode = useCallback(async () => {
        const target = email.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
            toast.error("请先填写正确的邮箱地址");
            return;
        }
        setSending(true);
        try {
            await sendSubscribeCodeApi(target);
            setCodeSent(true);
            setCooldown(COOLDOWN);
            toast.success("验证码已发送，请查收邮件（含垃圾箱）");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "验证码发送失败");
        } finally {
            setSending(false);
        }
    }, [email]);

    const submit = useCallback(async () => {
        const target = email.trim();
        const value = code.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
            toast.error("请先填写正确的邮箱地址");
            return;
        }
        if (!/^\d{4,8}$/.test(value)) {
            toast.error("请填写邮件里的验证码");
            return;
        }
        setSubmitting(true);
        try {
            await subscribeApi(target, value);
            setDone(true);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "订阅失败，请稍后再试");
        } finally {
            setSubmitting(false);
        }
    }, [email, code]);

    return (
        <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-60 bg-black/50 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
                <DialogPrimitive.Content
                    data-slot="subscribe-dialog"
                    className="fixed top-1/2 left-1/2 z-60 w-[min(94vw,26rem)] -translate-x-1/2 -translate-y-1/2 soft-surface p-5 text-card-foreground data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
                >
                    <DialogPrimitive.Title className="text-base font-semibold">
                        {title?.trim() || "订阅博客更新"}
                    </DialogPrimitive.Title>
                    <DialogPrimitive.Description className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        {description?.trim() || "留下邮箱，新文章发布时收到提醒；随时可以退订。"}
                    </DialogPrimitive.Description>

                    {done ? (
                        <div className="mt-5 flex flex-col items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-6 text-center">
                            <CheckCircle2 className="size-7 text-emerald-500" aria-hidden />
                            <div className="text-sm font-medium">订阅成功</div>
                            <p className="text-xs text-muted-foreground">
                                确认邮件已发往 {email.trim()}，以后有新文章会通知你。
                            </p>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="mt-2"
                                onClick={() => onOpenChange(false)}
                            >
                                完成
                            </Button>
                        </div>
                    ) : (
                        <div className="mt-4 space-y-3">
                            <label className="block">
                                <span className="mb-1 block text-xs text-muted-foreground">邮箱</span>
                                <div className="flex gap-2">
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(event) => setEmail(event.target.value)}
                                        placeholder="you@example.com"
                                        autoComplete="email"
                                        className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-primary"
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-9 shrink-0"
                                        disabled={sending || cooldown > 0}
                                        onClick={sendCode}
                                    >
                                        {sending ? (
                                            <Loader2 className="size-3.5 animate-spin" aria-hidden />
                                        ) : cooldown > 0 ? (
                                            `${cooldown}s`
                                        ) : codeSent ? (
                                            "重新发送"
                                        ) : (
                                            "发送验证码"
                                        )}
                                    </Button>
                                </div>
                            </label>

                            <label className="block">
                                <span className="mb-1 block text-xs text-muted-foreground">
                                    验证码
                                    {codeSent && (
                                        <span className="ml-1 text-[11px]">（已发到邮箱，10 分钟内有效）</span>
                                    )}
                                </span>
                                <div className="flex items-center gap-2">
                                    <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                                    <input
                                        inputMode="numeric"
                                        value={code}
                                        onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
                                        placeholder="邮件里的 6 位数字"
                                        className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm tracking-widest outline-none transition-colors focus:border-primary"
                                    />
                                </div>
                            </label>

                            <div className="flex justify-end gap-2 pt-1">
                                <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                                    取消
                                </Button>
                                <Button type="button" size="sm" disabled={submitting} onClick={submit}>
                                    {submitting ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
                                    {submitText?.trim() || "订阅"}
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}
