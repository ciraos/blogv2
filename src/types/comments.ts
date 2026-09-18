/**
 * 管理端评论相关类型（对应后端管理接口 /comments，见官方 swagger 的「评论管理」标签）。
 * 与公开接口（/public/comments）不同：管理端会额外返回 email / ip_address / status / pinned_at 等字段。
 */

/** 评论状态：1=已发布，2=待审核 */
export type CommentStatus = 1 | 2;

/** 管理端评论项（swagger: dto.Response） */
export interface AdminComment {
    id: string;
    created_at: string;
    /** 评论者昵称 */
    nickname: string;
    /** 邮箱（仅管理端返回） */
    email?: string;
    /** 邮箱 MD5（拼 Gravatar 用） */
    email_md5?: string;
    /** 用户自定义头像 URL */
    avatar_url?: string;
    /** 评论者网站 */
    website?: string;
    /** Markdown 原文 */
    content: string;
    /** 渲染后的 HTML */
    content_html: string;
    /** 1=已发布 2=待审核 */
    status?: CommentStatus;
    is_admin_comment?: boolean;
    is_anonymous?: boolean;
    /** 评论所属目标路径，如 /post/xxx */
    target_path: string;
    /** 目标页面标题 */
    target_title?: string;
    /** 父评论 ID（子评论有值） */
    parent_id?: string;
    /** 被回复的评论 ID */
    reply_to_id?: string;
    /** 被回复者昵称 */
    reply_to_nick?: string;
    like_count?: number;
    /** 子评论数 */
    total_children?: number;
    ip_address?: string;
    ip_location?: string;
    user_agent?: string;
    qq_number?: string;
    /** 置顶时间；空/null 表示未置顶 */
    pinned_at?: string | null;
    /** 子评论（管理端列表按根评论分页时嵌套返回） */
    children?: AdminComment[];
}

/** GET /comments 返回的 data（swagger: dto.ListResponse） */
export interface AdminCommentListData {
    list: AdminComment[];
    page?: number;
    pageSize?: number;
    /** 根评论总数（用于分页） */
    total?: number;
    /** 含子评论的总数 */
    total_with_children?: number;
}

/** GET /comments 查询参数 */
export interface AdminCommentListParams {
    page?: number;
    pageSize?: number;
    /** 昵称模糊搜索 */
    nickname?: string;
    /** 邮箱模糊搜索 */
    email?: string;
    /** 内容模糊搜索 */
    content?: string;
    /** 目标路径模糊搜索 */
    target_path?: string;
    /** IP 模糊搜索 */
    ip_address?: string;
    /** 状态筛选 */
    status?: CommentStatus;
}

/** PUT /comments/{id}/info 请求体（四个字段均可选，传了就更新） */
export interface AdminUpdateCommentRequest {
    content?: string;
    nickname?: string;
    email?: string;
    website?: string;
}
