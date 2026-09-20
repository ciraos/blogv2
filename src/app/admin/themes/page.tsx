import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { AdminUnderConstruction } from "@/components/admin/under-construction";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("主题商城");
}

export default function Themes() {
    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">主题商城</h2>
            </div>
            <AdminUnderConstruction feature="主题商城" />
        </div>
    )
}
