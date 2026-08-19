// 管理员用户管理相关类型（对应后端 /admin/users、/admin/user-groups）

/** 用户组 */
export interface UserGroup {
    id: string;
    name: string;
    description: string;
}

/** 用户（管理端 AdminUserDTO） */
export interface AdminUser {
    avatar: string;
    created_at: string;
    email: string;
    id: string;
    lastLoginAt: string;
    nickname: string;
    /** 1=正常 2=未激活 3=已封禁 */
    status: number;
    updated_at: string;
    userGroup: UserGroup | null;
    userGroupID: string;
    username: string;
    website: string;
}

/** 分页用户列表 */
export interface AdminUserListData {
    page: number;
    size: number;
    total: number;
    users: AdminUser[];
}

/** 用户列表查询参数 */
export interface AdminUserListParams {
    page?: number;
    pageSize?: number;
    /** 搜索关键词（用户名、昵称、邮箱） */
    keyword?: string;
    /** 用户组ID筛选 */
    groupID?: string;
    /** 用户状态筛选（1:正常 2:未激活 3:已封禁） */
    status?: number;
}

/** 创建用户请求体 */
export interface AdminCreateUserRequest {
    email: string;
    password: string;
    userGroupID: string;
    username: string;
    nickname?: string;
}

/** 更新用户请求体 */
export interface AdminUpdateUserRequest {
    email?: string;
    nickname?: string;
    status?: number;
    userGroupID?: string;
    username?: string;
}
