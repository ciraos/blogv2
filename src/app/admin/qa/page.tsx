import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { AdminUnderConstruction } from "@/components/admin/under-construction";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("社区问答");
}

export default function CommunityQa() {
    return (
        <div className="admin-page">
            <div>
                <h2 className="text-xl font-semibold tracking-tight">社区问答</h2>
            </div>
            <AdminUnderConstruction feature="社区问答" />
        </div>
    )
}
