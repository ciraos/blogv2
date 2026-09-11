import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("评论管理");
}

export default function Comments() {
    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">评论管理</h2>
                <p className="text-slate-400 text-xs"></p>
            </div>
        </div>
    )
}
