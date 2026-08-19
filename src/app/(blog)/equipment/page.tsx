import type { Metadata } from "next";

import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("我的装备");
}

export default function Equipment() {
    return (
        <></>
    )
}
