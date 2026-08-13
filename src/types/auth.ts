
// ===================== 认证相关类型 =====================

// 通用顶层响应
export interface ApiResponse<T> {
    code: number;
    message: string;
    data: T;
}

// 登录请求
export interface LoginRequest {
    email: string;
    password: string;
}

// 刷新令牌请求
export interface RefreshRequest {
    refreshToken: string;
}

// 用户组
export interface UserGroup {
    id: string;
    name: string;
    description: string;
}

// 登录返回的用户信息
export interface LoginUserInfo {
    id: string;
    username: string;
    nickname: string;
    email: string;
    avatar: string;
    status: number;
    lastLoginAt: string;
    created_at: string;
    updated_at: string;
    userGroupID: number;
    userGroup: UserGroup;
}

// 登录 / 刷新令牌返回的 data
export interface LoginData {
    accessToken: string;
    expires: string;
    refreshToken: string;
    roles: string[];
    userInfo: LoginUserInfo;
}

export type LoginResponse = ApiResponse<LoginData>;
