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
                        管理商品、规格与卡密库存（后端 PRO 接口），接口接入前为静态外壳
                    </p>
                </div>
            </div>
            <ProductsManager />
        </div>
    )
}
