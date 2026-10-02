import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { AdminUnderConstruction } from "@/components/admin/under-construction";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("SEO推送 ");
}

export default function SeoPush() {
    return (
        <div className="admin-page">
            <div>
                <h2 className="text-xl font-semibold tracking-tight">SEO推送 </h2>
            </div>
            <AdminUnderConstruction feature="SEO推送 " />
        </div>
    )
}
