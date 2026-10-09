"use client";

import { useId, useState } from "react";
import {
    closestCenter,
    DndContext,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
    arrayMove,
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Dialog as DialogPrimitive } from "radix-ui";
import { ArrowDown, ArrowUp, GripVertical, ListOrdered, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    getAdminLinksForSortApi,
    isSameLinkOrder,
    toLinkSortItems,
    updateAdminLinkSortApi,
} from "@/lib/api-links";
import type { FriendLink } from "@/types/links";

// 拖拽排序能力不需要新装依赖：@dnd-kit/core / sortable / modifiers / utilities 已是本项目
// 依赖（package.json），且 src/components/data-table.tsx 已有同样的可用写法，这里照抄其组合方式
// （MouseSensor + TouchSensor + KeyboardSensor、closestCenter、restrictToVerticalAxis）。

/**
 * 一行友链：拖拽把手 + 序号 + 名称 + 上移 / 下移。
 * 上移 / 下移不只是无障碍兜底，也是触屏上比拖拽更稳的操作入口。
 */
function SortableLinkRow({
    link,
    index,
    total,
    disabled,
    onMove,
}: {
    link: FriendLink;
    index: number;
    total: number;
    disabled: boolean;
    onMove: (from: number, to: number) => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: link.id,
        disabled,
    });

    return (
        <div
            ref={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            className={`flex items-center gap-2 rounded-lg border bg-card px-2.5 py-2 text-sm ${isDragging ? "relative z-10 opacity-80 shadow-lg" : ""
                }`}
        >
            {/* 把手是唯一的拖拽触发点：避免误拖整行 */}
            <button
                type="button"
                {...attributes}
                {...listeners}
                disabled={disabled}
                aria-label={`拖拽排序：${link.name}`}
                className="shrink-0 cursor-grab rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
                <GripVertical className="size-4" />
            </button>
            <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
                {index + 1}
            </span>
            <span className="min-w-0 flex-1 truncate" title={link.name}>
                {link.name}
            </span>
            <span className="flex shrink-0 items-center gap-0.5">
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`上移 ${link.name}`}
                    title="上移"
                    disabled={disabled || index === 0}
                    onClick={() => onMove(index, index - 1)}
                >
                    <ArrowUp className="size-3.5" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`下移 ${link.name}`}
                    title="下移"
                    disabled={disabled || index === total - 1}
                    onClick={() => onMove(index, index + 1)}
                >
                    <ArrowDown className="size-3.5" />
                </Button>
            </span>
        </div>
    );
}

/**
 * 友链拖拽排序对话框（管理端）：
 * 全量拉取友链 → 拖拽 / 上移下移调整顺序 → PUT /api/admin/links/sort 一次性保存。
 *
 * 为什么放到对话框里、而不是直接在表格行上拖：表格是分页的（每页 10/20/50 条），
 * 在某一页里拖动只能表达「这一页内部的顺序」，会把其它页的排序权重挤乱；
 * 而排序接口是全局顺序（sort_order DESC），所以这里始终基于不带筛选的全量列表。
 */
export function LinkSortDialog() {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    /** 当前工作顺序（界面所见） */
    const [links, setLinks] = useState<FriendLink[]>([]);
    /** 最后一次「已加载 / 已保存成功」的顺序基线：还原与保存失败回滚都用它 */
    const [baseline, setBaseline] = useState<FriendLink[]>([]);
    /** 后端报的总条数（可能大于已加载的条数） */
    const [total, setTotal] = useState(0);

    const dndId = useId();
    const sensors = useSensors(
        useSensor(MouseSensor, {}),
        useSensor(TouchSensor, {}),
        useSensor(KeyboardSensor, {})
    );

    const dirty = !isSameLinkOrder(links, baseline);
    const linkIds = links.map((link) => link.id);

    /** 打开时拉取全量友链（管理员接口，浏览器自动携带登录 cookie） */
    const handleOpenChange = (next: boolean) => {
        setOpen(next);
        if (!next) return;
        setLoading(true);
        getAdminLinksForSortApi()
            .then((data) => {
                const list = data.list ?? [];
                setLinks(list);
                setBaseline(list);
                setTotal(data.total ?? list.length);
            })
            .catch((e) => toast.error(e instanceof Error ? e.message : "获取友链列表失败"))
            .finally(() => setLoading(false));
    };

    /** 拖拽结束：把被拖的行放到目标行原来的位置 */
    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const from = linkIds.indexOf(Number(active.id));
        const to = linkIds.indexOf(Number(over.id));
        if (from < 0 || to < 0) return;
        setLinks((prev) => arrayMove(prev, from, to));
    };

    /** 上移 / 下移共用的移动入口（拖拽之外的无障碍与触屏兜底） */
    const move = (from: number, to: number) => {
        setLinks((prev) => (from < 0 || from >= prev.length || to < 0 || to >= prev.length ? prev : arrayMove(prev, from, to)));
    };

    /** 还原为基线顺序（未保存的改动全部丢弃） */
    const handleReset = () => {
        setLinks(baseline);
        toast.success("已还原为保存前的顺序");
    };

    /** 保存：一次性提交全部顺序；失败则回滚本地顺序并提示 */
    const handleSave = async () => {
        if (links.length === 0) return;
        setSaving(true);
        const snapshot = baseline;
        try {
            await updateAdminLinkSortApi(toLinkSortItems(links));
            setBaseline(links);
            toast.success(`已保存 ${links.length} 条友链的排序`);
            // 复用现有的列表刷新机制：friends-table 监听该事件后重新拉取列表，
            // 同时会清掉表头那个「按名称排序」的本地客户端排序，否则刷新后看到的顺序不会变。
            window.dispatchEvent(new CustomEvent("blog-admin:links-changed"));
        } catch (e) {
            setLinks(snapshot);
            toast.error(e instanceof Error ? e.message : "排序保存失败", {
                description: "已恢复为保存前的顺序",
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
            <DialogPrimitive.Trigger asChild>
                <Button variant="outline">
                    <ListOrdered size={16} />
                    友链排序
                </Button>
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
                <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[min(94vw,32rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card p-5 shadow-2xl data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
                    <DialogPrimitive.Title className="text-base font-semibold">
                        友链排序
                    </DialogPrimitive.Title>
                    <DialogPrimitive.Description className="mt-1 text-xs text-muted-foreground">
                        从上到下即后台友链列表的展示顺序（后端按 sort_order 从大到小排）。拖动左侧把手调整，也可用每行的上移 / 下移；保存时一次性提交全部顺序。
                    </DialogPrimitive.Description>

                    <div className="mt-4 max-h-80 overflow-y-auto pr-1">
                        {loading ? (
                            <p className="py-10 text-center text-sm text-muted-foreground">加载中…</p>
                        ) : links.length === 0 ? (
                            <p className="py-10 text-center text-sm text-muted-foreground">暂无友链</p>
                        ) : (
                            <DndContext
                                id={dndId}
                                collisionDetection={closestCenter}
                                modifiers={[restrictToVerticalAxis]}
                                onDragEnd={handleDragEnd}
                                sensors={sensors}
                            >
                                <SortableContext items={linkIds} strategy={verticalListSortingStrategy}>
                                    <div className="space-y-2">
                                        {links.map((link, index) => (
                                            <SortableLinkRow
                                                key={link.id}
                                                link={link}
                                                index={index}
                                                total={links.length}
                                                disabled={saving}
                                                onMove={move}
                                            />
                                        ))}
                                    </div>
                                </SortableContext>
                            </DndContext>
                        )}
                    </div>

                    {/* 只加载了前 1000 条（后端单页上限）时如实说明覆盖范围，避免误以为排了全部 */}
                    {total > links.length && (
                        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                            共 {total} 条友链，本次只加载了前 {links.length} 条（后端单页上限 1000），保存仅覆盖已加载的部分。
                        </p>
                    )}

                    <div className="mt-5 flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                            {dirty ? "有未保存的改动" : links.length > 0 ? "顺序与已保存的一致" : ""}
                        </span>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" disabled={!dirty || saving} onClick={handleReset}>
                                <RotateCcw className="size-3.5" />
                                还原
                            </Button>
                            <DialogPrimitive.Close asChild>
                                <Button variant="outline" size="sm">
                                    关闭
                                </Button>
                            </DialogPrimitive.Close>
                            <Button size="sm" disabled={!dirty || saving} onClick={() => void handleSave()}>
                                {saving ? "保存中…" : "保存排序"}
                            </Button>
                        </div>
                    </div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}
