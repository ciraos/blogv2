"use client";

import { useMemo, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { FolderDownIcon, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { importAdminLinksApi } from "@/lib/api";
import type { ImportLinkItem, ImportLinksResponse } from "@/types/links";

/** 通知友链表格重新取数（与 LinkCreateButton / 分类标签弹窗同一个事件） */
const notifyLinksChanged = () => window.dispatchEvent(new CustomEvent("blog-admin:links-changed"));

function str(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/**
 * 解析导入内容：接受
 *   - 友链数组 `[{ name, url, ... }]`
 *   - 或导出接口的原样返回 `{ links: [...], total }`
 * 后端要求每项至少有 name 与 url，缺项在这里就拦下来并指出是第几条。
 */
function parseLinks(raw: string): { links?: ImportLinkItem[]; error?: string } {
    const text = raw.trim();
    if (!text) return { error: "请先粘贴 JSON，或选择一个 .json 文件" };

    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        return { error: "JSON 解析失败，请检查是否多余逗号 / 缺少引号" };
    }

    const list = Array.isArray(data)
        ? data
        : data && typeof data === "object" && Array.isArray((data as { links?: unknown }).links)
          ? ((data as { links: unknown[] }).links)
          : null;
    if (!list) return { error: '没找到友链数组：需要 [{...}] 或 {"links":[{...}]}' };
    if (list.length === 0) return { error: "数组是空的" };

    const links: ImportLinkItem[] = [];
    for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (!item || typeof item !== "object") return { error: `第 ${i + 1} 项不是对象` };
        const o = item as Record<string, unknown>;
        const name = str(o.name);
        const url = str(o.url);
        if (!name || !url) return { error: `第 ${i + 1} 项缺少 name 或 url` };
        links.push({
            name,
            url,
            // 导出接口给的是 rss_url；列表接口叫 rss，两种都认
            rss_url: str(o.rss_url) ?? str(o.rss),
            logo: str(o.logo),
            description: str(o.description),
            siteshot: str(o.siteshot),
            email: str(o.email),
            category_name: str(o.category_name),
            tag_name: str(o.tag_name),
            tag_color: str(o.tag_color),
            status: str(o.status),
        });
    }
    return { links };
}

/**
 * 导入友链弹窗（管理端）：
 *   POST /api/admin/links/import → 远端 POST /links/import
 * 支持粘贴 JSON 或选文件；导出接口返回的文件可以直接回灌（格式同构）。
 * 后端按条返回成败，这里把成功/失败/跳过与失败原因展示出来。
 */
export function LinkImportDialog() {
    const [open, setOpen] = useState(false);
    const [raw, setRaw] = useState("");
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<ImportLinksResponse | null>(null);
    // 导入选项（与后端 ImportLinksRequest 一致）
    const [skipDuplicates, setSkipDuplicates] = useState(true);
    const [createCategories, setCreateCategories] = useState(true);
    const [createTags, setCreateTags] = useState(true);

    const parsed = useMemo(() => parseLinks(raw), [raw]);
    /** 失败明细（后端可能不返回该字段） */
    const importFailures = result?.failed_list ?? [];

    const reset = () => {
        setRaw("");
        setResult(null);
    };

    const handleOpenChange = (next: boolean) => {
        setOpen(next);
        if (!next) reset();
    };

    /** 选择本地 .json 文件 → 读成文本填进文本框（统一走同一条解析路径） */
    const handleFile = async (file: File | undefined) => {
        if (!file) return;
        try {
            setRaw(await file.text());
            setResult(null);
        } catch {
            toast.error("读取文件失败");
        }
    };

    const handleImport = async () => {
        if (!parsed.links) {
            toast.error(parsed.error || "内容有误");
            return;
        }
        setBusy(true);
        setResult(null);
        try {
            const res = await importAdminLinksApi({
                links: parsed.links,
                skip_duplicates: skipDuplicates,
                create_categories: createCategories,
                create_tags: createTags,
            });
            setResult(res);
            if (res.success > 0) {
                toast.success(`导入完成：成功 ${res.success} 条`);
                notifyLinksChanged();
            } else {
                toast.warning("没有成功导入任何友链，看看下方失败原因");
            }
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "导入失败");
        } finally {
            setBusy(false);
        }
    };

    return (
        <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
            <DialogPrimitive.Trigger asChild>
                <Button variant="outline" aria-label="导入" title="导入">
                    <FolderDownIcon size={16} />
                    <span className="hidden sm:inline">导入</span>
                </Button>
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
                <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[min(94vw,40rem)] max-h-[86vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border bg-card p-5 shadow-2xl data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
                    <DialogPrimitive.Title className="text-base font-semibold">导入友链</DialogPrimitive.Title>
                    <DialogPrimitive.Description className="mt-1 text-xs text-muted-foreground">
                        粘贴 JSON 或选择文件。格式为 <code>[{`{"name":"…","url":"…"}`}]</code>，也可以是「导出」得到的{" "}
                        <code>{`{"links":[…],"total":n}`}</code> 原文件 —— 导出文件可直接回灌。
                    </DialogPrimitive.Description>

                    <div className="mt-4 space-y-2">
                        <div className="flex items-center gap-2">
                            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors hover:bg-muted">
                                <Upload className="size-3.5" />
                                选择 .json 文件
                                <input
                                    type="file"
                                    accept=".json,application/json"
                                    className="hidden"
                                    onChange={(e) => void handleFile(e.target.files?.[0])}
                                />
                            </label>
                            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={reset} disabled={busy || !raw}>
                                清空
                            </Button>
                            <span className="ml-auto text-xs text-muted-foreground">
                                {parsed.links
                                    ? `解析到 ${parsed.links.length} 条`
                                    : raw.trim()
                                      ? "格式有误"
                                      : "等待内容"}
                            </span>
                        </div>

                        <textarea
                            value={raw}
                            onChange={(e) => {
                                setRaw(e.target.value);
                                setResult(null);
                            }}
                            placeholder='[{"name":"示例博客","url":"https://example.com","category_name":"友链","status":"APPROVED"}]'
                            spellCheck={false}
                            className="h-44 w-full resize-y rounded-lg border bg-transparent p-3 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
                        />
                        {parsed.error && raw.trim() !== "" && <p className="text-xs text-destructive">{parsed.error}</p>}
                    </div>

                    {/* 导入选项 */}
                    <div className="mt-3 space-y-1.5">
                        {[
                            { label: "跳过重复友链（按 URL 判断）", checked: skipDuplicates, set: setSkipDuplicates },
                            { label: "分类不存在时自动创建", checked: createCategories, set: setCreateCategories },
                            { label: "标签不存在时自动创建", checked: createTags, set: setCreateTags },
                        ].map((opt) => (
                            <label key={opt.label} className="flex cursor-pointer items-center gap-2 text-xs">
                                <Checkbox checked={opt.checked} onCheckedChange={(v) => opt.set(v === true)} />
                                {opt.label}
                            </label>
                        ))}
                    </div>

                    {/* 结果 */}
                    {result && (
                        <div className="mt-4 space-y-2 rounded-lg border p-3 text-xs">
                            <div className="flex flex-wrap gap-x-4 gap-y-1">
                                <span>共 {result.total} 条</span>
                                <span className="text-emerald-600 dark:text-emerald-400">成功 {result.success}</span>
                                <span className={result.failed > 0 ? "text-destructive" : "text-muted-foreground"}>
                                    失败 {result.failed}
                                </span>
                                <span className="text-muted-foreground">跳过 {result.skipped}</span>
                            </div>
                            {importFailures.length > 0 && (
                                <ul className="max-h-32 space-y-1 overflow-y-auto text-muted-foreground">
                                    {importFailures.slice(0, 8).map((f, i) => (
                                        <li key={`${f.link?.url ?? i}`}>
                                            <span className="text-destructive">失败</span> {f.link?.name || f.link?.url || `第 ${i + 1} 条`}：{f.reason}
                                        </li>
                                    ))}
                                    {importFailures.length > 8 && <li>…还有 {importFailures.length - 8} 条</li>}
                                </ul>
                            )}
                        </div>
                    )}

                    <div className="mt-5 flex justify-end gap-2">
                        <DialogPrimitive.Close asChild>
                            <Button variant="outline" size="sm">
                                关闭
                            </Button>
                        </DialogPrimitive.Close>
                        <Button size="sm" onClick={handleImport} disabled={busy || !parsed.links}>
                            {busy ? "导入中…" : "开始导入"}
                        </Button>
                    </div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}
