"use client";

import { useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Circle, ListOrdered } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getAdminLinkCategoriesApi } from "@/lib/api";
import type { LinkCategory } from "@/types/links";

/**
 * 友链分类排序对话框（管理端）：
 * 后端暂无分类排序字段，前台 /link 按分类 id 升序展示（创建顺序）。
 * 此对话框仅用于查看全部分类；拖拽保存功能等后端支持排序 API 后再接入。
 */
export function CategorySortDialog() {
    const [open, setOpen] = useState(false);
    const [categories, setCategories] = useState<LinkCategory[]>([]);
    const [loading, setLoading] = useState(false);

    /** 打开对话框时：拉取全部分类（管理员接口），按 id 升序展示 */
    const handleOpenChange = (next: boolean) => {
        setOpen(next);
        if (!next) return;
        setLoading(true);
        getAdminLinkCategoriesApi()
            .then((list) => {
                // 排序待后端 API 支持；当前展示按 id 升序（与前台 /link 一致）
                setCategories([...list].sort((a, b) => a.id - b.id));
            })
            .catch(() => toast.error("获取分类列表失败"))
            .finally(() => setLoading(false));
    };

    return (
        <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
            <DialogPrimitive.Trigger asChild>
                <Button>
                    <ListOrdered size={4} />
                    分类排序
                </Button>
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
                <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[min(94vw,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card p-5 shadow-2xl data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
                    <DialogPrimitive.Title className="text-base font-semibold">
                        分类排序
                    </DialogPrimitive.Title>
                    <DialogPrimitive.Description className="mt-1 text-xs text-muted-foreground">
                        当前前台按分类 id 升序展示（创建顺序）。拖拽排序待后端支持后开放。
                    </DialogPrimitive.Description>

                    <div className="mt-4 max-h-80 overflow-y-auto">
                        {loading ? (
                            <p className="py-10 text-center text-sm text-muted-foreground">加载中…</p>
                        ) : categories.length === 0 ? (
                            <p className="py-10 text-center text-sm text-muted-foreground">暂无分类</p>
                        ) : (
                            <div className="space-y-2">
                                {categories.map((c, index) => (
                                    <div
                                        key={c.id}
                                        className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 text-sm"
                                    >
                                        <span className="flex w-5 items-center justify-center text-xs text-muted-foreground">
                                            {index + 1}
                                        </span>
                                        <Circle className="size-1.5 fill-current text-muted-foreground" />
                                        <span className="min-w-0 flex-1 truncate">{c.name}</span>
                                        {c.description && (
                                            <span className="truncate text-xs text-muted-foreground">
                                                {c.description}
                                            </span>
                                        )}
                                        <span className="shrink-0 text-xs text-muted-foreground">#{c.id}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="mt-5 flex justify-end gap-2">
                        <DialogPrimitive.Close asChild>
                            <Button variant="outline" size="sm">
                                关闭
                            </Button>
                        </DialogPrimitive.Close>
                        {/* 保存功能待后端分类排序 API 支持后启用 */}
                        <Button size="sm" disabled title="待后端支持后开放">
                            保存排序
                        </Button>
                    </div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}
