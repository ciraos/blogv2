"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/** 返回上一页（浏览器历史存在时才可用） */
export function BackButton() {
    const router = useRouter();

    function handleBack() {
        if (typeof window !== "undefined" && window.history.length > 1) {
            router.back();
        } else {
            router.push("/");
        }
    }

    return (
        <button
            onClick={handleBack}
            className="inline-flex items-center gap-1.5 rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
        >
            <ArrowLeft className="size-4" />
            返回上一页
        </button>
    );
}
