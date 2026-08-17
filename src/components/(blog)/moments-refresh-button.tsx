"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface MomentsRefreshButtonProps {
    isLoggedIn: boolean;
}

// 朋友圈手动刷新按钮：未登录提示登录；已登录触发后端抓取后刷新页面
export function MomentsRefreshButton({ isLoggedIn }: MomentsRefreshButtonProps) {
    const [loading, setLoading] = useState(false);

    async function handleRefresh() {
        if (!isLoggedIn) {
            toast.warning("登录后才能刷新", {
                description: "请先登录账号，再手动刷新朋友圈",
            });
            return;
        }
        setLoading(true);
        try {
            const res = await fetch("/api/admin/moments/fetch", { method: "POST" })
            const json = (await res.json()) as { code: number; message: string }
            if (res.ok) {
                toast.success("已触发抓取", {
                    description: "后台处理中，稍后刷新页面即可看到最新动态",
                })
                // 短暂延迟后刷新，让后端开始抓取
                setTimeout(() => window.location.reload(), 1200)
            } else {
                toast.error("触发失败", { description: json.message || "请稍后重试" })
            }
        } catch {
            toast.error("网络请求失败", { description: "请检查网络后重试" })
        } finally {
            setLoading(false)
        }
    }

    return (
        <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            aria-label="手动刷新朋友圈"
            className="inline-flex size-6 items-center justify-center rounded border border-border bg-white text-black transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
        >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
    );
}
