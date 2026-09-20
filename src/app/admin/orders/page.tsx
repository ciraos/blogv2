import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { AdminUnderConstruction } from "@/components/admin/under-construction";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("订单管理");
}

export default function Orders() {
    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">订单管理</h2>
            </div>
            <AdminUnderConstruction feature="订单管理" />
        </div>
    )
}
