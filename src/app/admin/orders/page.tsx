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
                        订单列表（后端 PRO 模块 /pro/admin/orders）；支持筛选、详情弹窗、软删除与当前页 CSV 导出。
                        后端没有「关闭订单 / 退款」接口，故不再提供这两个按钮
                    </p>
                </div>
            </div>
            <OrdersManager />
        </div>
    )
}
