"use client";

import { useCallback, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Check, Pencil, Plus, TagIcon, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    createAdminLinkCategoryApi,
    createAdminLinkTagApi,
    deleteAdminLinkCategoryApi,
    deleteAdminLinkTagApi,
    getAdminLinkCategoriesApi,
    getAdminLinkTagsApi,
    updateAdminLinkCategoryApi,
    updateAdminLinkTagApi,
} from "@/lib/api";
import type { LinkCategory, LinkTag } from "@/types/links";

/** 分类样式（后端枚举 card / list，必填） */
const CATEGORY_STYLES = [
    { value: "list", label: "列表（list）" },
    { value: "card", label: "卡片（card）" },
];

/** 通知友链表格重新取数（同一个事件由 LinkCreateButton 在用） */
const notifyLinksChanged = () => window.dispatchEvent(new CustomEvent("blog-admin:links-changed"));

type Kind = "category" | "tag";

/**
 * 友链分类 / 标签管理弹窗（管理端）：
 *   分类 POST|PUT|DELETE /api/admin/links/categories[/{id}]（远端 /links/categories）
 *   标签 POST|PUT|DELETE /api/admin/links/tags[/{id}]（远端 /links/tags）
 * 分类的 style 是后端必填项（card / list），编辑时一并可改。
 * 任何写操作成功后都会派发 blog-admin:links-changed，让表格的分类/标签下拉与列表跟着刷新。
 */
export function LinkTaxonomyDialog() {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [categories, setCategories] = useState<LinkCategory[]>([]);
    const [tags, setTags] = useState<LinkTag[]>([]);

    // 新增表单
    const [newCategory, setNewCategory] = useState({ name: "", style: "list", description: "" });
    const [newTag, setNewTag] = useState({ name: "", color: "" });

    // 行内编辑
    const [editingCategory, setEditingCategory] = useState<LinkCategory | null>(null);
    const [editingTag, setEditingTag] = useState<LinkTag | null>(null);
    // 删除二次确认
    const [confirmDelete, setConfirmDelete] = useState<{ kind: Kind; id: number } | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [cs, ts] = await Promise.all([getAdminLinkCategoriesApi(), getAdminLinkTagsApi()]);
            setCategories([...cs].sort((a, b) => a.id - b.id));
            setTags([...ts].sort((a, b) => a.id - b.id));
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "获取分类/标签失败");
        } finally {
            setLoading(false);
        }
    }, []);

    const handleOpenChange = (next: boolean) => {
        setOpen(next);
        if (!next) {
            setEditingCategory(null);
            setEditingTag(null);
            setConfirmDelete(null);
            return;
        }
        void load();
    };

    /** 统一的写操作包装：成功才算成功（失败时调用方不要清表单/关编辑器） */
    const run = async (action: () => Promise<unknown>, okText: string): Promise<boolean> => {
        setBusy(true);
        try {
            await action();
            toast.success(okText);
            await load();
            notifyLinksChanged();
            return true;
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "操作失败");
            return false;
        } finally {
            setBusy(false);
        }
    };

    const addCategory = () => {
        const name = newCategory.name.trim();
        if (!name) {
            toast.error("分类名称必填");
            return;
        }
        void run(
            () => createAdminLinkCategoryApi({ name, style: newCategory.style, description: newCategory.description.trim() }),
            "分类已创建"
        ).then((ok) => {
            if (ok) setNewCategory({ name: "", style: "list", description: "" });
        });
    };

    const addTag = () => {
        const name = newTag.name.trim();
        if (!name) {
            toast.error("标签名称必填");
            return;
        }
        void run(() => createAdminLinkTagApi({ name, color: newTag.color.trim() }), "标签已创建").then((ok) => {
            if (ok) setNewTag({ name: "", color: "" });
        });
    };

    const saveCategory = () => {
        if (!editingCategory) return;
        const name = editingCategory.name.trim();
        if (!name) {
            toast.error("分类名称必填");
            return;
        }
        void run(
            () =>
                updateAdminLinkCategoryApi(editingCategory.id, {
                    name,
                    style: editingCategory.style || "list",
                    description: editingCategory.description || "",
                }),
            "分类已更新"
        ).then((ok) => {
            if (ok) setEditingCategory(null);
        });
    };

    const saveTag = () => {
        if (!editingTag) return;
        const name = editingTag.name.trim();
        if (!name) {
            toast.error("标签名称必填");
            return;
        }
        void run(() => updateAdminLinkTagApi(editingTag.id, { name, color: editingTag.color || "" }), "标签已更新").then(
            (ok) => {
                if (ok) setEditingTag(null);
            }
        );
    };

    const doDelete = () => {
        if (!confirmDelete) return;
        const { kind, id } = confirmDelete;
        setConfirmDelete(null);
        void run(
            () => (kind === "category" ? deleteAdminLinkCategoryApi(id) : deleteAdminLinkTagApi(id)),
            kind === "category" ? "分类已删除" : "标签已删除"
        );
    };

    const confirmBanner = confirmDelete && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
            <span>
                确认删除「
                {confirmDelete.kind === "category"
                    ? categories.find((c) => c.id === confirmDelete.id)?.name
                    : tags.find((t) => t.id === confirmDelete.id)?.name}
                」？该分类/标签下的友链不会被删除，只是失去归属。
            </span>
            <span className="flex shrink-0 gap-1.5">
                <Button size="sm" variant="destructive" className="h-7" onClick={doDelete} disabled={busy}>
                    删除
                </Button>
                <Button size="sm" variant="outline" className="h-7" onClick={() => setConfirmDelete(null)}>
                    取消
                </Button>
            </span>
        </div>
    );

    return (
        <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
            <DialogPrimitive.Trigger asChild>
                <Button variant="outline" aria-label="分类标签" title="分类标签">
                    <TagIcon size={16} />
                    <span className="hidden sm:inline">分类标签</span>
                </Button>
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
                <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[min(94vw,52rem)] max-h-[86vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border bg-card p-5 shadow-2xl data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
                    <DialogPrimitive.Title className="text-base font-semibold">分类与标签</DialogPrimitive.Title>
                    <DialogPrimitive.Description className="mt-1 text-xs text-muted-foreground">
                        分类决定前台友链页的分区（style 选 card / list）；标签用于给单个友链打标记。改动后前台 /link 页与下方表格会同步刷新。
                    </DialogPrimitive.Description>

                    {loading ? (
                        <p className="py-16 text-center text-sm text-muted-foreground">加载中…</p>
                    ) : (
                        <div className="mt-4 grid gap-5 lg:grid-cols-2">
                            {/* ===== 分类 ===== */}
                            <section className="rounded-lg border p-3">
                                <h3 className="flex items-center justify-between text-sm font-medium">
                                    分类
                                    <span className="text-xs font-normal text-muted-foreground">{categories.length} 个</span>
                                </h3>

                                {/* 新增 */}
                                <div className="mt-2 space-y-1.5">
                                    <Input
                                        value={newCategory.name}
                                        onChange={(e) => setNewCategory((v) => ({ ...v, name: e.target.value }))}
                                        placeholder="分类名称（必填）"
                                        className="h-8"
                                    />
                                    <div className="flex gap-1.5">
                                        <Select
                                            value={newCategory.style}
                                            onValueChange={(v) => setNewCategory((prev) => ({ ...prev, style: v }))}
                                        >
                                            <SelectTrigger className="h-8 w-32 shrink-0">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {CATEGORY_STYLES.map((s) => (
                                                    <SelectItem key={s.value} value={s.value}>
                                                        {s.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Input
                                            value={newCategory.description}
                                            onChange={(e) => setNewCategory((v) => ({ ...v, description: e.target.value }))}
                                            placeholder="说明（可选）"
                                            className="h-8"
                                        />
                                        <Button size="sm" className="h-8 shrink-0" onClick={addCategory} disabled={busy}>
                                            <Plus className="size-4" />
                                            新增
                                        </Button>
                                    </div>
                                </div>

                                {/* 列表 */}
                                <div className="mt-3 space-y-1.5">
                                    {categories.length === 0 ? (
                                        <p className="py-6 text-center text-xs text-muted-foreground">暂无分类</p>
                                    ) : (
                                        categories.map((c) =>
                                            editingCategory?.id === c.id ? (
                                                <div key={c.id} className="space-y-1.5 rounded-lg border bg-muted/40 p-2">
                                                    <div className="flex gap-1.5">
                                                        <Input
                                                            value={editingCategory.name}
                                                            onChange={(e) =>
                                                                setEditingCategory({ ...editingCategory, name: e.target.value })
                                                            }
                                                            className="h-8"
                                                        />
                                                        <Select
                                                            value={editingCategory.style || "list"}
                                                            onValueChange={(v) =>
                                                                setEditingCategory({ ...editingCategory, style: v })
                                                            }
                                                        >
                                                            <SelectTrigger className="h-8 w-28 shrink-0">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {CATEGORY_STYLES.map((s) => (
                                                                    <SelectItem key={s.value} value={s.value}>
                                                                        {s.label}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className="flex gap-1.5">
                                                        <Input
                                                            value={editingCategory.description || ""}
                                                            onChange={(e) =>
                                                                setEditingCategory({
                                                                    ...editingCategory,
                                                                    description: e.target.value,
                                                                })
                                                            }
                                                            placeholder="说明"
                                                            className="h-8"
                                                        />
                                                        <Button size="sm" className="h-8 shrink-0" onClick={saveCategory} disabled={busy}>
                                                            <Check className="size-4" />
                                                            保存
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-8 shrink-0"
                                                            onClick={() => setEditingCategory(null)}
                                                        >
                                                            <X className="size-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div
                                                    key={c.id}
                                                    className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm"
                                                >
                                                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                                                    <span className="shrink-0 rounded-full border px-1.5 py-px text-[10px] text-muted-foreground">
                                                        {c.style || "list"}
                                                    </span>
                                                    <span className="shrink-0 text-xs text-muted-foreground">#{c.id}</span>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-7 shrink-0 px-1.5"
                                                        title="编辑"
                                                        aria-label="编辑分类"
                                                        onClick={() => setEditingCategory(c)}
                                                    >
                                                        <Pencil className="size-3.5" />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-7 shrink-0 px-1.5 text-destructive"
                                                        title="删除"
                                                        aria-label="删除分类"
                                                        onClick={() => setConfirmDelete({ kind: "category", id: c.id })}
                                                    >
                                                        <Trash2 className="size-3.5" />
                                                    </Button>
                                                </div>
                                            )
                                        )
                                    )}
                                </div>
                                {confirmDelete?.kind === "category" && confirmBanner}
                            </section>

                            {/* ===== 标签 ===== */}
                            <section className="rounded-lg border p-3">
                                <h3 className="flex items-center justify-between text-sm font-medium">
                                    标签
                                    <span className="text-xs font-normal text-muted-foreground">{tags.length} 个</span>
                                </h3>

                                <div className="mt-2 flex gap-1.5">
                                    <Input
                                        value={newTag.name}
                                        onChange={(e) => setNewTag((v) => ({ ...v, name: e.target.value }))}
                                        placeholder="标签名称（必填）"
                                        className="h-8"
                                    />
                                    <Input
                                        value={newTag.color}
                                        onChange={(e) => setNewTag((v) => ({ ...v, color: e.target.value }))}
                                        placeholder="颜色（可选，如 #3b82f6）"
                                        className="h-8 w-40 shrink-0"
                                    />
                                    <Button size="sm" className="h-8 shrink-0" onClick={addTag} disabled={busy}>
                                        <Plus className="size-4" />
                                        新增
                                    </Button>
                                </div>

                                <div className="mt-3 space-y-1.5">
                                    {tags.length === 0 ? (
                                        <p className="py-6 text-center text-xs text-muted-foreground">暂无标签</p>
                                    ) : (
                                        tags.map((t) =>
                                            editingTag?.id === t.id ? (
                                                <div key={t.id} className="flex gap-1.5 rounded-lg border bg-muted/40 p-2">
                                                    <Input
                                                        value={editingTag.name}
                                                        onChange={(e) => setEditingTag({ ...editingTag, name: e.target.value })}
                                                        className="h-8"
                                                    />
                                                    <Input
                                                        value={editingTag.color || ""}
                                                        onChange={(e) => setEditingTag({ ...editingTag, color: e.target.value })}
                                                        placeholder="颜色"
                                                        className="h-8 w-32 shrink-0"
                                                    />
                                                    <Button size="sm" className="h-8 shrink-0" onClick={saveTag} disabled={busy}>
                                                        <Check className="size-4" />
                                                        保存
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-8 shrink-0"
                                                        onClick={() => setEditingTag(null)}
                                                    >
                                                        <X className="size-4" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <div
                                                    key={t.id}
                                                    className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm"
                                                >
                                                    {t.color ? (
                                                        <span
                                                            className="size-2.5 shrink-0 rounded-full border"
                                                            style={{ backgroundColor: t.color }}
                                                            aria-hidden
                                                        />
                                                    ) : null}
                                                    <span className="min-w-0 flex-1 truncate">{t.name}</span>
                                                    {t.color ? (
                                                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                                                            {t.color}
                                                        </span>
                                                    ) : null}
                                                    <span className="shrink-0 text-xs text-muted-foreground">#{t.id}</span>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-7 shrink-0 px-1.5"
                                                        title="编辑"
                                                        aria-label="编辑标签"
                                                        onClick={() => setEditingTag(t)}
                                                    >
                                                        <Pencil className="size-3.5" />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-7 shrink-0 px-1.5 text-destructive"
                                                        title="删除"
                                                        aria-label="删除标签"
                                                        onClick={() => setConfirmDelete({ kind: "tag", id: t.id })}
                                                    >
                                                        <Trash2 className="size-3.5" />
                                                    </Button>
                                                </div>
                                            )
                                        )
                                    )}
                                </div>
                                {confirmDelete?.kind === "tag" && confirmBanner}
                            </section>
                        </div>
                    )}

                    <div className="mt-5 flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading || busy}>
                            刷新
                        </Button>
                        <DialogPrimitive.Close asChild>
                            <Button size="sm">完成</Button>
                        </DialogPrimitive.Close>
                    </div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}
