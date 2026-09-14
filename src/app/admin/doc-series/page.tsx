import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("文档系列");
}

export default function DocSeries() {
    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">文档系列</h2>
                <p className="text-slate-400 text-xs"></p>
            </div>
        </div>
    )
}
