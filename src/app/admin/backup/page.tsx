import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";

import { BackupManager } from "@/components/admin/backup-manager";

export function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("配置备份与迁移");
}

/**
 * 后台「配置备份与迁移」页（/admin/backup）。
 * 页面本身是服务端组件（只负责标题与外壳），列表与所有动作都在客户端组件 BackupManager 里，
 * 请求统一走同源代理 /api/admin/config/*（见 src/app/api/admin/config/**）。
 */
export default function Backup() {
    return (
        <div className="admin-page">
            <div className="admin-page-head">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight">配置备份与迁移</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                        备份与恢复数据库中的系统设置（配置项），支持导出、导入 JSON 配置文件
                    </p>
                </div>
            </div>

            {/* 备份列表 + 创建 / 恢复 / 删除 / 清理 / 导出 / 导入（高危操作均带二次确认） */}
            <BackupManager />
        </div>
    );
}
