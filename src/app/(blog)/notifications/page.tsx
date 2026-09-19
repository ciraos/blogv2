import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("全部通知");
}

export default function Notifications() {
    return (
        <></>
    )
}
