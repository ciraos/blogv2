"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
    Field,
    FieldGroup,
    FieldLabel,
    FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { ApiError, loginApi } from "@/lib/api";

export function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");

        if (!email.trim() || !password) {
            setError("请输入邮箱和密码");
            return;
        }

        setLoading(true);
        try {
            // 登录走本应用同源路由 /api/auth/login（服务端转发 + 写入 httpOnly cookie）
            await loginApi(email.trim(), password);
            router.replace("/admin/dashboard");
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.message);
            } else {
                setError("登录失败，请稍后重试");
            }
        } finally {
            setLoading(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="w-full max-w-xs mx-auto">
            <FieldSet>
                <div className="text-center">
                    <h1 className="text-2xl font-bold tracking-tight">登录</h1>
                    <p className="mt-1 text-sm text-muted-foreground">欢迎回来，请登录你的账号</p>
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
                    <Field>
                        <FieldLabel htmlFor="password">密码</FieldLabel>
                        <Input
                            id="password"
                            type="password"
                            autoComplete="current-password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                        />
                    </Field>
                </FieldGroup>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "登录中…" : "登 录"}
                </Button>
            </FieldSet>
        </form>
    )
}
