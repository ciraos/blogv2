import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { AdminUnderConstruction } from "@/components/admin/under-construction";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("文档系列");
}

export default function DocSeries() {
    return (
        <div className="admin-page">
            <div>
                <h2 className="text-xl font-semibold tracking-tight">文档系列</h2>
            </div>
            <AdminUnderConstruction feature="文档系列" />
        </div>
    )
}
