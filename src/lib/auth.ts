// 认证 cookie 名称常量（登录路由写入、登出路由清除、proxy 读取）
export const ACCESS_TOKEN_KEY = "token";
export const REFRESH_TOKEN_KEY = "refresh_token";
export const USER_INFO_KEY = "user_info";

export const ACCESS_TOKEN_MAX_AGE = 60 * 60 * 24 * 7; // 7 天
export const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 30; // 30 天

/**
 * 是否管理员：用户组 ID 为 1（与官方后台一致，见 anheyu-app-frontend 的 auth-store.isAdmin）。
 * GET /user/info 会返回 userGroupID（数字）与嵌套的 userGroup，任一为 1 即管理员。
 * 仅用于界面层（后台入口是否显示、/admin 页面是否渲染）；真正的权限边界始终在后端接口。
 */
export function isAdminUser(
    user: { userGroupID?: number | null; userGroup?: { id?: string | number | null } | null } | null | undefined,
): boolean {
    if (!user) return false;
    return user.userGroupID === 1 || Number(user.userGroup?.id) === 1;
}
