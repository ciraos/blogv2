// 认证 cookie 名称常量（登录路由写入、登出路由清除、proxy 读取）
export const ACCESS_TOKEN_KEY = "token";
export const REFRESH_TOKEN_KEY = "refresh_token";
export const USER_INFO_KEY = "user_info";

export const ACCESS_TOKEN_MAX_AGE = 60 * 60 * 24 * 7; // 7 天
export const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 30; // 30 天
