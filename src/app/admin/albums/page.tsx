import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("相册管理");
}

export default function Albums() {
    return (
        <></>
    )
}
