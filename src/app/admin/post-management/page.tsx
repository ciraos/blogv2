import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("文章管理");
}

export default function Comments() {
    return (
        <></>
    )
}
