import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { AdminUnderConstruction } from "@/components/admin/under-construction";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("知识库管理");
}

export default function Knowledge() {
    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">知识库管理</h2>
            </div>
            <AdminUnderConstruction feature="知识库管理" />
        </div>
    )
}
