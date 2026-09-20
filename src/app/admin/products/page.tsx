import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { AdminUnderConstruction } from "@/components/admin/under-construction";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("商品管理");
}

export default function Products() {
    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">商品管理</h2>
            </div>
            <AdminUnderConstruction feature="商品管理" />
        </div>
    )
}
