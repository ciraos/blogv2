import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { KnowledgeManager } from "@/components/admin/knowledge-manager";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("知识库管理");
}

export default function Knowledge() {
    return (
        <div className="admin-page">
            <div className="admin-page-head">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight">知识库管理</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                        管理知识库文档的索引状态与分块：列表/上传/删除/清空/重建索引/同步文章，接口走 PRO 模块
                        /pro/admin/knowledge
                    </p>
                </div>
            </div>
            <KnowledgeManager />
        </div>
    )
}
