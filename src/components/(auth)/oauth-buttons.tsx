"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export interface OAuthProviderOption {
    /** 服务商标识：qq / wechat / github / google / microsoft / logto / oidc / rainbow */
    id: string;
    /** 按钮文案（oauth.<provider>.display_name，未配置时用默认名） */
    label: string;
}

/** 登录成功后要记下来的 state（回调页校验用） */
const STATE_KEY = "blog:oauth-state";

/**
 * 第三方登录按钮组（登录页）。
 *
 * 流程：点按钮 → POST /api/pro/oauth/{provider}/authorize 拿授权地址
 *      → 整页跳到服务商 → 服务商回到 /callback/{provider} → 回调页换 token 写 cookie。
 *
 * 为什么整页跳而不是弹窗：QQ/微信/OIDC 都要求回调地址与登记一致，弹窗容易被拦，
 * 整页跳最稳，而且用户授权完回到本站就能直接进后台。
 */
export function OAuthButtons({ providers }: { providers: OAuthProviderOption[] }) {
    const [pending, setPending] = useState<string | null>(null);

    if (providers.length === 0) return null;

    async function start(provider: string) {
        setPending(provider);
        try {
            const redirectUrl = `${window.location.origin}/callback/${provider}`;
            const res = await fetch(`/api/pro/oauth/${provider}/authorize`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ redirect_url: redirectUrl, login_type: "login" }),
            });
            const json = (await res.json()) as {
                code?: number;
                message?: string;
                data?: { authorize_url?: string; url?: string; state?: string };
            };
            const target = json.data?.authorize_url || json.data?.url;
            if (!res.ok || !target) {
                throw new Error(json.message || "获取授权地址失败");
            }
            // state 记下来，回调页比对，防止串号
            if (json.data?.state) {
                try {
                    sessionStorage.setItem(STATE_KEY, json.data.state);
                } catch {
                    // 隐私模式：只是少了这层校验
                }
            }
            // 用 assign 而不是给 href 赋值：react-hooks/immutability 规则不允许写 window.location.href
            window.location.assign(target);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "第三方登录启动失败");
            setPending(null);
        }
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                或用第三方账号登录
                <span className="h-px flex-1 bg-border" />
            </div>
            <div className="grid grid-cols-2 gap-2">
                {providers.map((provider) => (
                    <Button
                        key={provider.id}
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pending !== null}
                        onClick={() => void start(provider.id)}
                        className="h-9 justify-center text-xs"
                    >
                        {pending === provider.id ? <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden /> : null}
                        {provider.label}
                    </Button>
                ))}
            </div>
        </div>
    );
}
