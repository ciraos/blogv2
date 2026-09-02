"use client";

import { useCallback, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { GripVertical, ListOrdered } from "lucide-react";
import { toast } from "sonner";
import {
    DndContext,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    arrayMove,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Button } from "@/components/ui/button";
import { getPublicLinkCategoriesApi } from "@/lib/api";
import type { LinkCategory } from "@/types/links";

const STORAGE_KEY = "link_category_order";

/** 单个可拖拽分类行 */
function SortableRow({ category }: { category: LinkCategory }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: category.id,
    });
    return (
        <div
            ref={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            className={`flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 text-sm ${
                isDragging ? "z-10 shadow-lg opacity-80" : ""
            }`}
        >
            <button
                type="button"
                {...attributes}
                {...listeners}
                className="cursor-grab text-muted-foreground transition-colors hover:text-foreground active:cursor-grabbing"
                aria-label={`拖动 ${category.name}`}
            >
                <GripVertical className="size-4" />
            </button>
            <span className="min-w-0 flex-1 truncate">{category.name}</span>
            {category.description && (
                <span className="truncate text-xs text-muted-foreground">{category.description}</span>
            )}
        </div>
    );
}

/**
 * 友链分类排序对话框（管理端）：
 * 拖拽调整分类展示顺序，保存到 localStorage（link_category_order: 分类 id 数组）。
 * 前台 /link 页按此顺序渲染；未排序（新部署）时保持后端 API 返回顺序。
 */
export function CategorySortDialog() {
    const [open, setOpen] = useState(false);
    const [categories, setCategories] = useState<LinkCategory[]>([]);
    const [loading, setLoading] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    /** 打开对话框时：拉取分类 + 按已保存顺序排列 */
    const handleOpenChange = (next: boolean) => {
        setOpen(next);
        if (!next) return;
        setLoading(true);
        getPublicLinkCategoriesApi()
            .then((list) => {
                // 按 localStorage 已有顺序重排（未保存过的保持 API 顺序）
                let items = list;
                try {
                    const raw = localStorage.getItem(STORAGE_KEY);
                    if (raw) {
                        const ids: number[] = JSON.parse(raw);
                        if (Array.isArray(ids) && ids.length > 0) {
                            const byId = new Map(list.map((c) => [c.id, c]));
                            const sorted: LinkCategory[] = [];
                            for (const id of ids) {
                                const c = byId.get(id);
                                if (c) {
                                    sorted.push(c);
                                    byId.delete(id);
                                }
                            }
                            for (const c of list) if (byId.has(c.id)) sorted.push(c);
                            items = sorted;
                        }
                    }
                } catch {
                    // 忽略损坏的存储值
                }
                setCategories(items);
            })
            .catch(() => toast.error("获取分类列表失败"))
            .finally(() => setLoading(false));
    };

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        setCategories((prev) => {
            const oldIndex = prev.findIndex((c) => c.id === active.id);
            const newIndex = prev.findIndex((c) => c.id === over.id);
            if (oldIndex < 0 || newIndex < 0) return prev;
            return arrayMove(prev, oldIndex, newIndex);
        });
    }, []);

    /** 保存排序到 localStorage */
    const handleSave = () => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(categories.map((c) => c.id)));
            toast.success("分类排序已保存，刷新 /link 页生效");
            setOpen(false);
        } catch {
            toast.error("保存失败（浏览器可能禁用了本地存储）");
        }
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
                        拖拽调整友链分类在前台 /link 页的展示顺序，保存后仅对当前浏览器生效。
                    </DialogPrimitive.Description>

                    <div className="mt-4">
                        {loading ? (
                            <p className="py-10 text-center text-sm text-muted-foreground">加载中…</p>
                        ) : categories.length === 0 ? (
                            <p className="py-10 text-center text-sm text-muted-foreground">暂无分类</p>
                        ) : (
                            <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={handleDragEnd}
                            >
                                <SortableContext
                                    items={categories.map((c) => c.id)}
                                    strategy={verticalListSortingStrategy}
                                >
                                    <div className="space-y-2">
                                        {categories.map((c) => (
                                            <SortableRow key={c.id} category={c} />
                                        ))}
                                    </div>
                                </SortableContext>
                            </DndContext>
                        )}
                    </div>

                    <div className="mt-5 flex justify-end gap-2">
                        <DialogPrimitive.Close asChild>
                            <Button variant="outline" size="sm">
                                取消
                            </Button>
                        </DialogPrimitive.Close>
                        <Button size="sm" onClick={handleSave} disabled={loading || categories.length === 0}>
                            保存
                        </Button>
                    </div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}
