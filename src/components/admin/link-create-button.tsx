"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
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
    createAdminLinkApi,
    getAdminLinkCategoriesApi,
    getAdminLinkTagsApi,
} from "@/lib/api";
import type { LinkCategory, LinkTag } from "@/types/links";

const STATUS_OPTIONS = [
    { value: "APPROVED", label: "已通过" },
    { value: "PENDING", label: "待审核" },
    { value: "REJECTED", label: "已拒绝" },
    { value: "INVALID", label: "已失效" },
];

const EMPTY_FORM = {
    name: "",
    url: "",
    logo: "",
    description: "",
    status: "PENDING",
    category_id: "",
    tag_id: "",
};

/** 新建友链按钮：打开创建弹窗 → POST /api/admin/links → 通知列表刷新 */
export function LinkCreateButton() {
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [categories, setCategories] = useState<LinkCategory[]>([]);
    const [tags, setTags] = useState<LinkTag[]>([]);
    const [form, setForm] = useState(EMPTY_FORM);

    // 打开时加载分类/标签下拉数据
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        (async () => {
            try {
                const [cs, ts] = await Promise.all([
                    getAdminLinkCategoriesApi(),
                    getAdminLinkTagsApi(),
                ]);
                if (!cancelled) {
                    setCategories(cs);
                    setTags(ts);
                }
            } catch {
                // 失败不阻塞创建
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open]);

    const close = () => {
        setOpen(false);
        setForm(EMPTY_FORM);
    };

    async function handleCreate() {
        if (!form.name || !form.url) {
            toast.error("名称和网址必填");
            return;
        }
        setSaving(true);
        try {
            await createAdminLinkApi({
                name: form.name,
                url: form.url,
                logo: form.logo || undefined,
                description: form.description || undefined,
                status: form.status || undefined,
                category_id: form.category_id ? Number(form.category_id) : undefined,
                tag_id: form.tag_id ? Number(form.tag_id) : undefined,
            });
            toast.success("创建成功");
            window.dispatchEvent(new CustomEvent("blog-admin:links-changed"));
            close();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "创建失败");
        } finally {
            setSaving(false);
        }
    }

    return (
        <>
            <Button onClick={() => setOpen(true)}>
                <Plus size={4} />
                新建友链
            </Button>

            {open && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                    onMouseDown={close}
                >
                    <div
                        className="w-full max-w-md rounded-xl border bg-card p-5 shadow-xl"
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-base font-semibold">新建友链</h3>
                            <button
                                type="button"
                                onClick={close}
                                aria-label="关闭"
                                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="space-y-3">
                            <label className="block">
                                <span className="mb-1 block text-xs font-medium text-muted-foreground">名称（必填）</span>
                                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-xs font-medium text-muted-foreground">网址（必填）</span>
                                <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" />
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-xs font-medium text-muted-foreground">头像地址</span>
                                <Input value={form.logo} onChange={(e) => setForm({ ...form, logo: e.target.value })} />
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-xs font-medium text-muted-foreground">描述</span>
                                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-xs font-medium text-muted-foreground">状态</span>
                                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="选择状态" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {STATUS_OPTIONS.map((o) => (
                                            <SelectItem key={o.value} value={o.value}>
                                                {o.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-xs font-medium text-muted-foreground">分类</span>
                                <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="不分类" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="">不分类</SelectItem>
                                        {categories.map((c) => (
                                            <SelectItem key={c.id} value={String(c.id)}>
                                                {c.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-xs font-medium text-muted-foreground">标签</span>
                                <Select value={form.tag_id} onValueChange={(v) => setForm({ ...form, tag_id: v })}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="无标签" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="">无标签</SelectItem>
                                        {tags.map((t) => (
                                            <SelectItem key={t.id} value={String(t.id)}>
                                                {t.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </label>
                            <div className="flex justify-end gap-2 pt-2">
                                <Button variant="outline" onClick={close}>
                                    取消
                                </Button>
                                <Button onClick={handleCreate} disabled={saving}>
                                    {saving ? "创建中…" : "创建"}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
