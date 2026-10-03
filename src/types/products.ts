// ===================== 商品（PRO）相关类型 =====================
// 字段来源：src/components/admin/products-manager.tsx 里的内联类型与常量（未做任何改动），
// 那里注明字段名与官方前端类型定义 product.ts 对齐。
// 远端路径：后端 PRO 模块 /pro/admin/products；同源代理 /api/admin/products（本次新增）。
// 列表响应形状（已线上探活确认）：{ list, total, page, page_size }。

/** ProductStatus：与 product.ts 一致（Draft=1 / Published=2 / Offline=3） */
export const ProductStatus = {
    Draft: 1,
    Published: 2,
    Offline: 3,
} as const;

/** ProductStatus 的取值类型（1 | 2 | 3） */
export type ProductStatusValue = (typeof ProductStatus)[keyof typeof ProductStatus];

/** 列表项：字段名取自官方前端类型定义 product.ts 的 ProductListItem */
export interface ProductListItem {
    id: number;
    title: string;
    cover_url: string;
    status: number; // ProductStatus
    min_price: number;
    max_price: number;
    total_sales: number;
    total_revenue: number;
    variant_count: number;
    exclude_from_membership: boolean;
    show_on_homepage: boolean;
    created_at: string;
}

/**
 * 商品规格（后台文档注释里的字段约定，暂未被页面代码使用）。
 * 来源：products-manager.tsx 顶部注释 ProductVariant。
 */
export interface ProductVariant {
    name: string;
    price: number;
    /** 发货方式 */
    delivery_method: "FIXED_REPLY" | "STOCK_ITEM";
    stock_count: number;
    sold_count: number;
}

/**
 * 卡密库存项（后台文档注释里的字段约定，暂未被页面代码使用）。
 * 来源：products-manager.tsx 顶部注释 StockItem。
 */
export interface StockItem {
    content: string;
    /** Available=1 | Used=2 | Invalid=3 */
    status: number;
    order_id?: number;
    used_at?: string;
}

/** 商品列表响应 data：分页字段是 page_size */
export interface ProductListData {
    list: ProductListItem[];
    total: number;
    page: number;
    page_size: number;
}

/** 商品列表查询参数（对应 products-manager 的搜索框 + 状态筛选） */
export interface AdminProductListParams {
    page?: number;
    page_size?: number;
    /** 标题关键词搜索 */
    keyword?: string;
    /** 状态筛选：1=草稿 2=已上架 3=已下架（未选择时传 undefined） */
    status?: ProductStatusValue;
}
