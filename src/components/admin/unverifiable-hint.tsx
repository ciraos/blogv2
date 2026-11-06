"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * 设置项标签右侧的 ⚠：点一下展开一段说明。
 *
 * 用于「保存成功也无法从外部确认」的键（私密项 / PRO 后台专有键）：
 * 它们不出现在公开 site-config 里，所以改完只能靠自己刷新页面看值有没有保留。
 * 用点击展开而不是 hover tooltip：说明文字较长，鼠标一移开就消失反而看不清。
 */
export function UnverifiableHint({ className }: { className?: string }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLSpanElement>(null);

    // 点空白处收起
    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: PointerEvent) => {
            if (ref.current?.contains(event.target as Node)) return;
            setOpen(false);
        };
        document.addEventListener("pointerdown", onPointerDown);
        return () => document.removeEventListener("pointerdown", onPointerDown);
    }, [open]);

    return (
        <span ref={ref} className={cn("relative inline-flex shrink-0", className)}>
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                aria-label="为什么这项可能保存不生效"
                aria-expanded={open}
                className="inline-flex size-4 items-center justify-center rounded-full text-amber-500 transition-colors hover:text-amber-600"
            >
                <AlertTriangle className="size-3.5" />
            </button>

            {open && (
                <span
                    role="note"
                    className="absolute left-0 top-5 z-50 w-64 rounded-md border bg-popover p-2.5 text-[11px] leading-relaxed font-normal text-popover-foreground shadow-lg"
                >
                    这个键不在公开的 site-config 里（属于后端私密项或 PRO 后台专有键），
                    所以没法从外部验证是否真的写入。
                    <br />
                    <span className="text-muted-foreground">
                        改完保存 → 刷新本页：值还在就是生效了；回到旧值说明后端不认这个键。
                    </span>
                </span>
            )}
        </span>
    );
}
