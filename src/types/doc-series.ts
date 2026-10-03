// ===================== 文档系列相关类型 =====================
// 字段来源：src/components/admin/doc-series-manager.tsx 里的内联类型（未做任何改动），
// 那里注明字段名与官方前端类型定义 doc-series.ts 的 DocSeries 完全对齐。
// 远端路径：/doc-series（swagger 里还有 /doc-series/{id}、/doc-series/{id}/articles）；
// 同源代理 /api/admin/doc-series（本次新增）。
// 列表响应形状（已线上探活确认）：{ list, total, page, pageSize }。

/** 文档系列（官方 doc-series.ts: DocSeries，字段名一一对应） */
export interface DocSeries {
    id: string;
    created_at: string;
    updated_at: string;
    name: string;
    description: string;
    cover_url: string;
    sort: number;
    doc_count: number;
}

/** 文档系列列表响应 data：⚠️ 分页字段是 `pageSize`（请求参数也是 pageSize） */
export interface DocSeriesListData {
    list: DocSeries[];
    total: number;
    page: number;
    pageSize: number;
}

/** 文档系列列表查询参数（对应 doc-series-manager 的关键词筛选） */
export interface AdminDocSeriesListParams {
    page?: number;
    pageSize?: number;
    /** 系列名称 / 简介关键词搜索 */
    keyword?: string;
}
