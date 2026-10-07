"use client";

import { useState } from "react";
import { FolderOutputIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { exportAdminLinksApi } from "@/lib/api";

/**
 * 导出友链按钮（管理端）：GET /api/admin/links/export → 远端 GET /links/export。
 *
 * 远端返回 `{ links: ImportLinkItem[], total }`，与导入接口同构 —— 下载下来的文件
 * 可以直接在「导入」里回灌（备份 / 换站迁移就靠这一对）。
 */
export function LinkExportButton() {
    const [busy, setBusy] = useState(false);

    const handleExport = async () => {
        setBusy(true);
        try {
            const data = await exportAdminLinksApi();
            const links = data?.links ?? [];
            if (links.length === 0) {
                toast.info("没有可导出的友链");
                return;
            }

            const json = JSON.stringify({ links, total: data.total ?? links.length }, null, 2);
            const blob = new Blob([json], { type: "application/json;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `links-export-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);

            toast.success(`已导出 ${links.length} 条友链`, { description: "文件可直接在「导入」里回灌" });
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "导出失败");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Button variant="outline" onClick={handleExport} disabled={busy}>
            <FolderOutputIcon size={16} />
            {busy ? "导出中…" : "导出"}
        </Button>
    );
}
