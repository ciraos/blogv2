import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { OrdersManager } from "@/components/admin/orders-manager";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("订单管理");
}

export default function Orders() {
    return (
        <div className="admin-page">
            <div className="admin-page-head">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight">订单管理</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                        订单列表（后端 PRO 模块 /pro/admin/orders）；筛选、详情、关闭、退款暂为占位，接口接入后生效
                    </p>
                </div>
            </div>
            <OrdersManager />
        </div>
    )
}
