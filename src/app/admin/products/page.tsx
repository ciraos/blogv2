import type { Metadata } from "next";
import { generateBlogMetadata } from "@/lib/seo";
import { ProductsManager } from "@/components/admin/products-manager";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("商品管理");
}

export default function Products() {
    return (
        <div className="admin-page">
            <div className="admin-page-head">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight">商品管理</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                        管理商品、规格（型号）与卡密库存（后端 PRO 接口）；支持增删改、上下架、卡密导入与作废。
                        价格字段单位为分，页面按元展示；写操作本轮未对线上实测
                    </p>
                </div>
            </div>
            <ProductsManager />
        </div>
    )
}
