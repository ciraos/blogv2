import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("评论管理");
}

export default function Comments() {
    return (
        <></>
    )
}
