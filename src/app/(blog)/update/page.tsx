import type { Metadata } from "next";

import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("更新日志");
}

export default function Update() {
    return (
        <></>
    )
}
