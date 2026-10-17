"use client";

/**
 * 「发送测试邮件」小面板：挂在后台设置 → 邮件服务 → SMTP 配置 分区下方。
 *
 * 为什么单独一个组件：设置页是按字段描述表（lib/admin-settings.ts）通用渲染的，
 * 表达不了「拿当前草稿里的收件人 + 一个会真的发信的按钮」。同 AiSettingsPanel /
 * PaymentSettingsPanel 的做法：遇到特定分组时整块换成专用面板。
 *
 * 数据来源：
 *   POST /api/admin/settings/test-email（同源代理 → 远端 /settings/test-email，body { to_email }）
 *   远端要求 body 必填 to_email；用当前草稿里的 SMTP_SENDER_EMAIL / SMTP_USERNAME 预填，
 *   允许手改成任意地址（测外部收件）。
 *
 * ⚠️ 会真的发信：只在点按钮时调用；SMTP 没配好时远端回 500，错误文案直接透出。
 */

import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { sendTestEmailApi } from "@/lib/api";

export function TestEmailButton({ defaultRecipient }: { defaultRecipient?: string }) {
    const [toEmail, setToEmail] = useState(defaultRecipient ?? "");
    const [sending, setSending] = useState(false);

    async function handleSend() {
        const value = toEmail.trim();
        if (!value) {
            toast.error("请填写收件邮箱");
            return;
        }
        setSending(true);
        try {
            await sendTestEmailApi(value);
            toast.success(`测试邮件已发送到 ${value}，请查收（含垃圾箱）`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "发送失败，请检查 SMTP 配置");
        } finally {
            setSending(false);
        }
    }

    return (
        <div className="mt-4 rounded-lg border border-dashed p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-medium">发送测试邮件</span>
                <span className="text-[11px] text-muted-foreground">
                    用当前生效的 SMTP 配置发一封测试信（未保存的改动不参与）
                </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <input
                    type="email"
                    value={toEmail}
                    onChange={(event) => setToEmail(event.target.value)}
                    placeholder="收件邮箱，如 you@example.com"
                    aria-label="测试邮件收件邮箱"
                    className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                />
                <button
                    type="button"
                    onClick={handleSend}
                    disabled={sending}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50 dark:border-input dark:bg-input/30"
                >
                    {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                    {sending ? "发送中…" : "发送"}
                </button>
            </div>
        </div>
    );
}
