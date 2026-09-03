"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

/**
 * Token 过期静默登出提示（挂在 (blog) 布局内）：
 * 服务端组件检测到登录 token 无效（401）后，把 expired 置为 true 传入本组件。
 * 组件挂载时：静默调用 /api/auth/logout 清除认证 cookie（httpOnly，只能由服务端路由删），
 * 然后 router.refresh() 刷新服务端布局（Header 变未登录态），toast 保留提示。
 */
export function AuthExpiredNotifier({ expired }: { expired: boolean }) {
    const router = useRouter();
    const notifiedRef = useRef(false);

    useEffect(() => {
        if (!expired || notifiedRef.current) return;
        notifiedRef.current = true;

        let cancelled = false;
        // React Compiler 规则：不在 effect 内同步执行副作用逻辑，用宏任务包裹
        const timer = setTimeout(async () => {
            try {
                await fetch("/api/auth/logout?redirect=0");
            } catch {
                // 登出接口失败也继续提示（不阻塞用户知晓状态）
            }
            if (cancelled) return;
            toast.error("登录已过期，请重新登录");
            router.refresh();
        }, 0);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [expired, router]);

    return null;
}
