import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { AdminUnderConstruction } from "@/components/admin/under-construction";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("图片样式缓存");
}

export default function ImageStylesCache() {
    return (
        <div className="admin-page">
            <div>
                <h2 className="text-xl font-semibold tracking-tight">图片样式缓存</h2>
            </div>
            <AdminUnderConstruction feature="图片样式缓存" />
        </div>
    )
}
