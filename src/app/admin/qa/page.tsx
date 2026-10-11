import { redirect } from "next/navigation";

/**
 * 旧地址兜底：后台「社区问答」管理页已从 /admin/qa 搬到 /admin/community-qa。
 *
 * 这里【只做跳转、不渲染任何内容】，让旧书签 / 站外旧链接不撞 404。
 * 用 redirect()（临时跳转 307）而不是 permanentRedirect()：307 不会被浏览器长期缓存，
 * 万一以后路径还要调整，用户不会被永久重定向粘死在旧地址上。
 */
export default function LegacyAdminQaRedirect() {
    redirect("/admin/community-qa");
}
