"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "nextjs-toploader/app";
import { MailCheck } from "lucide-react";

import {
    Field,
    FieldGroup,
    FieldLabel,
    FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { ApiError, registerApi } from "@/lib/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RegisterPage() {
    const router = useRouter();
    const [nickname, setNickname] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [repeatPassword, setRepeatPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    /** 非空 = 注册成功且站点开启了邮箱激活：此时不跳登录，改显示「去邮箱激活」提示 */
    const [pendingEmail, setPendingEmail] = useState<string | null>(null);

    function validate(): string | null {
        if (!nickname.trim()) {
            return "请填写昵称";
        }
        if (!email.trim() || !password || !repeatPassword) {
            return "请填写邮箱、密码和确认密码";
        }
        if (!EMAIL_RE.test(email.trim())) {
            return "邮箱格式不正确";
        }
        if (password.length < 6) {
            return "密码长度至少 6 位";
        }
        if (password !== repeatPassword) {
            return "两次输入的密码不一致";
        }
        return null;
    }

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");

        const invalid = validate();
        if (invalid) {
            setError(invalid);
            return;
        }

        setLoading(true);
        try {
            // 注册走本应用同源路由 /api/auth/register（服务端转发）
            const { activationRequired } = await registerApi(nickname.trim(), email.trim(), password, repeatPassword);
            if (activationRequired) {
                // 开了邮箱激活：账号此时是未激活状态，登录会失败，先让用户去邮箱点链接
                setPendingEmail(email.trim());
            } else {
                router.replace("/login?registered=1");
            }
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.message);
            } else {
                setError("注册失败，请稍后重试");
            }
        } finally {
            setLoading(false);
        }
    }

    // 注册成功且站点开启了邮箱激活：整块换成提示页，不再把用户送去登录页
    // （此时账号是「未激活」状态，直接去登录只会失败）
    if (pendingEmail) {
        return (
            <div className="w-full">
                <FieldSet>
                    <div className="flex flex-col items-center gap-3 py-2 text-center">
                        <span className="flex size-12 items-center justify-center rounded-full bg-primary/10">
                            <MailCheck className="size-6 text-primary" aria-hidden />
                        </span>
                        <div className="space-y-2">
                            <h1 className="text-xl font-semibold tracking-tight">激活邮件已发送</h1>
                            <p className="text-sm leading-relaxed text-muted-foreground">
                                我们已向{" "}
                                <span className="break-all font-medium text-foreground">{pendingEmail}</span>{" "}
                                发送了一封激活邮件，请在 <span className="font-medium text-foreground">24 小时</span>{" "}
                                内点击邮件里的链接完成激活。
                            </p>
                            <p className="text-xs leading-relaxed text-muted-foreground/80">
                                没收到？先看看垃圾邮件 / 推广标签，再确认邮箱地址有没有写错。
                            </p>
                        </div>
                    </div>

                    <Button type="button" className="w-full" onClick={() => router.push("/login")}>
                        已激活，去登录
                    </Button>

                    <p className="text-center text-xs text-muted-foreground/80">
                        邮箱填错了？
                        <button
                            type="button"
                            className="ml-1 text-primary hover:underline"
                            onClick={() => setPendingEmail(null)}
                        >
                            返回重新填写
                        </button>
                    </p>
                </FieldSet>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="w-full">
            <FieldSet>
                <div>
                    <h1 className="text-xl font-semibold tracking-tight">注册</h1>
                    <p className="mt-2 text-sm text-muted-foreground">创建一个新账号</p>
                </div>

                <FieldGroup>
                    <Field>
                        <FieldLabel htmlFor="nickname">昵称</FieldLabel>
                        <Input
                            id="nickname"
                            type="text"
                            autoComplete="nickname"
                            placeholder="怎么称呼你？"
                            value={nickname}
                            onChange={(event) => setNickname(event.target.value)}
                        />
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="email">邮箱</FieldLabel>
                        <Input
                            id="email"
                            type="email"
                            autoComplete="email"
                            placeholder="请在此输入您的邮箱······"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                        />
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="password">密码</FieldLabel>
                        <Input
                            id="password"
                            type="password"
                            autoComplete="new-password"
                            placeholder="至少 6 位"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                        />
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="repeatPassword">确认密码</FieldLabel>
                        <Input
                            id="repeatPassword"
                            type="password"
                            autoComplete="new-password"
                            placeholder="再次输入密码"
                            value={repeatPassword}
                            onChange={(event) => setRepeatPassword(event.target.value)}
                        />
                    </Field>
                </FieldGroup>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "注册中…" : "注 册"}
                </Button>

                {/* 激活邮件提示：开关只有后台知道（后端不公开这个配置），所以文案写成条件式，
                    真正的「去邮箱激活」提示在注册成功、后端返回 activation_required 后显示 */}
                <p className="text-center text-xs text-muted-foreground/80">
                    若站点开启了邮箱验证，注册后需到邮箱点击激活链接
                </p>

                <p className="text-center text-sm text-muted-foreground">
                    已有账号？
                    <Link href="/login" className="ml-1 text-primary hover:underline">
                        去登录
                    </Link>
                </p>
            </FieldSet>
        </form>
    )
}
