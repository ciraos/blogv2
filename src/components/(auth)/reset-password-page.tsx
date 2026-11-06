"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Eye, EyeOff } from "lucide-react";

import { Field, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { ApiError, resetPasswordApi } from "@/lib/api";

/** 与 route.ts 的 MIN_PASSWORD 保持一致（本地先提示，避免白跑一次请求） */
const MIN_PASSWORD = 6;

/**
 * 找回密码第二步：用重置邮件里的 publicUserId + sign 设置新密码。
 *
 * 参数由页面（server component）从 URL 解出来传入；缺参数时由页面直接展示失效状态，
 * 这里假定两个参数都是有效的非空字符串。
 */
export function ResetPasswordPage({ publicUserId, sign }: { publicUserId: string; sign: string }) {
    const [password, setPassword] = useState("");
    const [repeatPassword, setRepeatPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");

        if (password.length < MIN_PASSWORD) {
            setError(`密码至少 ${MIN_PASSWORD} 位`);
            return;
        }
        if (password !== repeatPassword) {
            setError("两次输入的密码不一致");
            return;
        }

        setLoading(true);
        try {
            await resetPasswordApi({ publicUserId, sign, password, repeatPassword });
            setDone(true);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : "重置失败，请稍后重试");
        } finally {
            setLoading(false);
        }
    }

    if (done) {
        return (
            <div className="flex w-full flex-col items-center gap-4 text-center">
                <CheckCircle2 className="size-14 text-green-500" />
                <div className="space-y-1.5">
                    <h1 className="text-xl font-bold tracking-tight">密码已重置</h1>
                    <p className="text-sm text-muted-foreground">请用新密码登录</p>
                </div>
                <Link
                    href="/login"
                    className="mt-2 inline-flex items-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
                >
                    去登录
                </Link>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="w-full">
            <FieldSet>
                <div>
                    <h1 className="text-xl font-semibold tracking-tight">设置新密码</h1>
                    <p className="mt-2 text-sm text-muted-foreground">重置链接有时效，提交后会立即生效</p>
                </div>

                <FieldGroup>
                    <Field>
                        <FieldLabel htmlFor="password">新密码</FieldLabel>
                        <div className="relative">
                            <Input
                                id="password"
                                type={showPassword ? "text" : "password"}
                                autoComplete="new-password"
                                placeholder={`至少 ${MIN_PASSWORD} 位`}
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                className="pr-9"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((v) => !v)}
                                aria-label={showPassword ? "隐藏密码" : "显示密码"}
                                title={showPassword ? "隐藏密码" : "显示密码"}
                                className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
                            >
                                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                            </button>
                        </div>
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="repeatPassword">确认新密码</FieldLabel>
                        <Input
                            id="repeatPassword"
                            type={showPassword ? "text" : "password"}
                            autoComplete="new-password"
                            placeholder="再输入一次"
                            value={repeatPassword}
                            onChange={(event) => setRepeatPassword(event.target.value)}
                        />
                    </Field>
                </FieldGroup>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "提交中…" : "重置密码"}
                </Button>

                <p className="mt-0 text-center text-sm text-muted-foreground">
                    链接失效了？{" "}
                    <Link
                        href="/forgot-password"
                        className="text-foreground underline underline-offset-4 hover:text-primary"
                    >
                        重新发送邮件
                    </Link>
                </p>
            </FieldSet>
        </form>
    );
}
