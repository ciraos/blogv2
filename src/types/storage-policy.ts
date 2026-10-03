// ===================== 存储策略相关类型 =====================
// 字段来源：src/components/admin/storage-manager.tsx 里的内联类型与中文标签常量（未做任何改动），
// 那里注明字段名与官方前端 storage-policy.ts 严格对齐。
// 远端路径：/storage-policies（另有 POST /storage-policies、PUT|DELETE /storage-policies/{id}、
// POST /storage-policies/{id}/onedrive/connect、GET /storage-policies/onedrive/authorize）；
// 同源代理 /api/admin/storage-policies（本次新增，仅 GET）。
// 列表响应形状（已线上探活确认）：{ list, total }（⚠️ 无分页字段）。

/** 官方 StoragePolicy.type → 中文标签 */
export const TYPE_OPTIONS = [
    { value: "local", label: "本机存储" },
    { value: "onedrive", label: "OneDrive" },
    { value: "tencent_cos", label: "腾讯云 COS" },
    { value: "aliyun_oss", label: "阿里云 OSS" },
    { value: "aws_s3", label: "AWS S3" },
    { value: "qiniu_kodo", label: "七牛云存储" },
    { value: "upyun", label: "又拍云存储" },
] as const;

/** 存储类型枚举值（local / onedrive / …） */
export type StorageType = (typeof TYPE_OPTIONS)[number]["value"];

/** 官方 flag → 中文用途 */
export const FLAG_OPTIONS = [
    { value: "article_image", label: "文章图片默认" },
    { value: "comment_image", label: "评论图片默认" },
    { value: "user_avatar", label: "用户头像默认" },
] as const;

/** 官方 flag 的取值类型（article_image / comment_image / user_avatar） */
export type StorageFlag = (typeof FLAG_OPTIONS)[number]["value"];

/** 官方 StoragePolicy.settings 里本轮用到的字段 */
export interface StoragePolicySettings {
    cdn_domain?: string;
}

/** 官方 StoragePolicy（字段名严格对齐） */
export interface StoragePolicy {
    id?: number;
    name?: string;
    type?: StorageType | string;
    is_private?: boolean;
    max_size?: number;
    base_path?: string;
    virtual_path?: string;
    flag?: string;
    settings?: StoragePolicySettings;
    created_at?: string;
}

/** 存储策略列表响应 data：⚠️ 只有 list / total，没有分页字段 */
export interface StoragePolicyListData {
    list: StoragePolicy[];
    total: number;
}
