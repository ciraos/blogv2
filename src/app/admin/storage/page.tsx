import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("存储策略");
}

export default function Storage() {
    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">存储策略</h2>
                <p className="text-slate-400 text-xs"></p>
            </div>
        </div>
    )
}
