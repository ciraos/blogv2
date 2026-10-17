"use client";

import { useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";

import { Field, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { ApiError, forgotPasswordApi } from "@/lib/api";

/**
 * 找回密码第一步：填邮箱 → 发重置邮件。
 *
 * ⚠️ 这里**故意不调用** `GET /auth/check-email` 做「邮箱是否已注册」预检：
 * 实测（2026-10，blog.ciraos.top）对任意邮箱（含明显不存在的 `nobody-9f3k@example.com`、
 * 以及已注册的站长邮箱）都返回 `exists: true`，返回值的语义不可信（见 docs/api-known-issues.md）。
 * 拿它做判断只会在语义反了的那天给出「该邮箱还没有注册过」这种误导提示。
 * 所以统一走远端防枚举口径：提交后一律提示「如果该邮箱已注册…」。
 */
export function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");

        const value = email.trim();
        if (!value) {
            setError("请输入邮箱");
            return;
        }

        setLoading(true);
        try {
            await forgotPasswordApi(value);
            setSent(true);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : "发送失败，请稍后重试");
        } finally {
            setLoading(false);
        }
    }

    if (sent) {
        return (
            <div className="flex w-full flex-col items-center gap-4 text-center">
                <MailCheck className="size-14 text-green-500" />
                <div className="space-y-1.5">
                    <h1 className="text-xl font-bold tracking-tight">邮件已发送</h1>
                    <p className="text-sm text-muted-foreground">
                        如果 <span className="font-medium text-foreground">{email.trim()}</span> 已注册，
                        你会收到一封密码重置邮件，请在有效期内点击链接完成重置。
                    </p>
                </div>
                <div className="mt-2 flex flex-wrap justify-center gap-3">
                    <Link
                        href="/login"
                        className="inline-flex items-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
                    >
                        返回登录
                    </Link>
                    <button
                        type="button"
                        onClick={() => setSent(false)}
                        className="inline-flex items-center rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
                    >
                        换个邮箱
                    </button>
                </div>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="w-full">
            <FieldSet>
                <div className="text-center">
                    <h1 className="text-xl font-semibold tracking-tight">找回密码</h1>
                    <p className="mt-2 text-sm text-muted-foreground">填写注册时用的邮箱，我们会发一封重置邮件</p>
                </div>

                <FieldGroup>
                    <Field>
                        <FieldLabel htmlFor="email">邮箱</FieldLabel>
                        <Input
                            id="email"
                            type="text"
                            autoComplete="email"
                            placeholder="请在此输入您的邮箱······"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                        />
                    </Field>
                </FieldGroup>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "发送中…" : "发送重置邮件"}
                </Button>

                <p className="mt-0 text-center text-sm text-muted-foreground">
                    想起密码了？{" "}
                    <Link href="/login" className="text-foreground underline underline-offset-4 hover:text-primary">
                        返回登录
                    </Link>
                </p>
            </FieldSet>
        </form>
    );
}
