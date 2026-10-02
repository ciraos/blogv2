import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { AdminUnderConstruction } from "@/components/admin/under-construction";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("订单管理");
}

export default function Orders() {
    return (
        <div className="admin-page">
            <div>
                <h2 className="text-xl font-semibold tracking-tight">订单管理</h2>
            </div>
            <AdminUnderConstruction feature="订单管理" />
        </div>
    )
}
