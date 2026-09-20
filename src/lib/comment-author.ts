import { cache } from "react";
import { cookies } from "next/headers";

import { getUserInfoApi } from "@/lib/api";
import { ACCESS_TOKEN_KEY } from "@/lib/auth";

/**
 * 评论区「已登录」态的作者信息：昵称 / 邮箱 / 网址都取自账号，
 * 因此登录后评论区不必再让用户填这三项（后端 CreateRequest 的 nickname 是必填，
 * 提交时用这里的值；后端会据此把评论关联到该账号，邮箱与管理员一致时还会标记为博主评论）。
 */
export interface CommentAuthor {
    nickname: string;
    email: string;
    website: string;
}

/**
 * 服务端：当前登录用户的评论区作者信息；未登录（或 token 失效）返回 null（= 游客态，照旧显示三项输入框）。
 *
 * token 是 httpOnly cookie，浏览器端读不到，所以只能在服务端取。
 * 用 React cache 包一层：同一请求内多个评论区只会打一次后端 /user/info。
 */
export const getCommentAuthor = cache(async (): Promise<CommentAuthor | null> => {
    const token = (await cookies()).get(ACCESS_TOKEN_KEY)?.value;
    if (!token) return null;

    try {
        const user = await getUserInfoApi(token);
        return {
            nickname: user.nickname || user.username || "",
            email: user.email || "",
            website: user.website || "",
        };
    } catch {
        // token 失效 / 后端异常：按未登录处理（页面照常渲染，不因评论区报错）
        return null;
    }
});
