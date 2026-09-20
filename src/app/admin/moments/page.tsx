import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { AdminUnderConstruction } from "@/components/admin/under-construction";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("朋友圈");
}

export default function Moments() {
    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">朋友圈</h2>
            </div>
            <AdminUnderConstruction feature="朋友圈" />
        </div>
    )
}
