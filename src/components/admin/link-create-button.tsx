"use client";

import { useEffect, useState } from "react";
import {
    AlignLeft,
    ArrowUpDown,
    BadgeCheck,
    Camera,
    FolderOpen,
    Globe,
    Image as ImageIcon,
    Mail,
    Plus,
    Rss,
    Tag,
    Type,
} from "lucide-react";
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
    rss: "",
    siteshot: "",
    email: "",
    status: "PENDING",
    category_id: "",
    tag_id: "",
    sort_order: "",
    skip_health_check: false,
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
                rss: form.rss || undefined,
                siteshot: form.siteshot || undefined,
                email: form.email || undefined,
                status: form.status || undefined,
                category_id: form.category_id ? Number(form.category_id) : undefined,
                tag_id: form.tag_id ? Number(form.tag_id) : undefined,
                sort_order: form.sort_order ? Number(form.sort_order) : undefined,
                skip_health_check: form.skip_health_check,
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
                        className="w-full max-w-xl rounded-xl border bg-card p-5 shadow-xl"
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
                            <div className="grid grid-cols-2 gap-3">
                                <label className="block">
                                    <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                        <Type className="size-3.5" />
                                        名称（必填）
                                    </span>
                                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                                </label>
                                <label className="block">
                                    <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                        <Globe className="size-3.5" />
                                        网站地址（必填）
                                    </span>
                                    <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" />
                                </label>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <label className="block">
                                    <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                        <ImageIcon className="size-3.5" />
                                        头像地址
                                    </span>
                                    <Input value={form.logo} onChange={(e) => setForm({ ...form, logo: e.target.value })} />
                                </label>
                                <label className="block">
                                    <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                        <AlignLeft className="size-3.5" />
                                        描述
                                    </span>
                                    <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                                </label>
                            </div>
                            <label className="block rounded-lg border border-border/60 bg-muted/40 px-3 py-3">
                                <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                    <Rss className="size-3.5" />
                                    RSS 地址（可选）
                                </span>
                                <Input value={form.rss} onChange={(e) => setForm({ ...form, rss: e.target.value })} placeholder="https://…/feed.xml" />
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <label className="block">
                                    <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                        <Camera className="size-3.5" />
                                        网站快照（可选）
                                    </span>
                                    <Input value={form.siteshot} onChange={(e) => setForm({ ...form, siteshot: e.target.value })} placeholder="https://…" />
                                </label>
                                <label className="block">
                                    <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                        <Mail className="size-3.5" />
                                        联系邮箱
                                    </span>
                                    <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@example.com" />
                                </label>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <label className="block">
                                    <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                        <BadgeCheck className="size-3.5" />
                                        状态
                                    </span>
                                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                                        <SelectTrigger className="w-full">
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
                                    <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                        <FolderOpen className="size-3.5" />
                                        分类
                                    </span>
                                    <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                                        <SelectTrigger className="w-full">
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
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <label className="block">
                                    <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                        <Tag className="size-3.5" />
                                        标签
                                    </span>
                                    <Select value={form.tag_id} onValueChange={(v) => setForm({ ...form, tag_id: v })}>
                                        <SelectTrigger className="w-full">
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
                                <label className="block">
                                    <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                        <ArrowUpDown className="size-3.5" />
                                        排序权重
                                    </span>
                                    <Input
                                        type="number"
                                        value={form.sort_order}
                                        onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                                        placeholder="0"
                                    />
                                </label>
                            </div>
                            {/* 跳过健康检查：左侧文字 + 右侧开关（开启后背景变绿、滑块右滚） */}
                            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-green-500/20 bg-green-500/10 px-3 py-3">
                                <span className="text-xs leading-snug">
                                    <span className="block font-medium text-foreground">跳过健康检查</span>
                                    <span className="block text-[11px] text-muted-foreground/70">启用后后台不再对该友链执行自动健康检查</span>
                                </span>
                                <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
                                    <input
                                        type="checkbox"
                                        role="switch"
                                        aria-label="跳过健康检查"
                                        checked={form.skip_health_check}
                                        onChange={(e) => setForm({ ...form, skip_health_check: e.target.checked })}
                                        className="peer sr-only"
                                    />
                                    <span aria-hidden className="absolute inset-0 rounded-full bg-input transition-colors peer-checked:bg-green-500" />
                                    <span aria-hidden className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
                                </span>
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
