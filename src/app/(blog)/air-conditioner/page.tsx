import type { Metadata } from "next";

import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("小空调");
}

export default function AirConditionerPage() {
    return (
        <div className=""></div>
    );
}
