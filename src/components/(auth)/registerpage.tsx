"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
            await registerApi(nickname.trim(), email.trim(), password, repeatPassword);
            router.replace("/login?registered=1");
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

    return (
        <form onSubmit={handleSubmit} className="w-full max-w-xs mx-auto">
            <FieldSet>
                <div className="text-center">
                    <h1 className="text-2xl font-bold tracking-tight">注册</h1>
                    <p className="mt-1 text-sm text-muted-foreground">创建一个新账号</p>
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

                {/* 激活邮件提示 */}
                <p className="text-center text-xs text-muted-foreground/80">
                    注册成功后请查收激活邮件完成账号激活
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
