
// ===================== 即刻 / 说说（PRO）相关类型 =====================
// 依据：Apifox 文档（PRO-即刻管理）

// 通用顶层响应
export interface ApiResponse<T> {
    code: number;
    message: string;
    data: T;
}

// 即刻状态：1=发布 2=草稿 3=隐藏
export enum EssayStatus {
    PUBLISHED = 1,
    DRAFT = 2,
    HIDDEN = 3,
}

// 单个即刻 / 说说（实测 /pro/essays：image/from/link/sort_order 为可选字段）
export interface Essay {
    id: number;
    content: string;
    /** 图片列表（可选） */
    image?: string[];
    /** 定位地址（可选） */
    address?: string;
    /** 来源（可选） */
    from?: string;
    /** 关联链接（可选） */
    link?: string;
    /** 音乐播放器配置（可选，结构未文档化） */
    aplayer?: Record<string, unknown>;
    /** 排序（可选） */
    sort_order?: number;
    status: number;
    created_at: string;
    updated_at: string;
}

// 即刻列表分页 data（注意：参数名是 page_size）
export interface EssayListData {
    list: Essay[];
    page: number;
    page_size: number;
    total: number;
}

// 管理后台即刻列表请求参数
export interface AdminEssayListParams {
    page?: number;
    page_size?: number;
    /** 状态筛选：1=发布 2=草稿 3=隐藏 */
    status?: number;
}

export type EssayListResponse = ApiResponse<EssayListData>;
