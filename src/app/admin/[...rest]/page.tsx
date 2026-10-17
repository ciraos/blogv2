import { AdminNotFoundView } from "@/components/admin/admin-not-found-view";

/**
 * 后台「兜底路由」：/admin/ 下任何**没有对应页面**的路径都落到这里，并在**后台外壳内**渲染 404。
 *
 * ── 现在的主路径在中间件 ──
 * 绝大多数 `/admin/<乱写>` 不会走到这里：`src/proxy.ts` 会用构建期生成的「后台路由表」
 * （next.config.ts 的 env.APP_ADMIN_ROUTE_REGEXPS）判定路径是否存在，不存在就
 * `rewrite("/admin/not-found-view", { status: 404 })` —— 那条路能同时拿到**真 404 状态码**
 * 和后台外壳，是本文件做不到的（页面组件设不了状态码）。
 *
 * ── 本文件还留着做什么 ──
 * ① 路由表为空/失配时的安全网（proxy 的 isKnownAdminRoute 在表为空时一律放行）；
 * ② 保证 `/admin/*` 永远能匹配到一个真路由，不落进 Next 的「多个根布局时随机挑一个」
 *    那条全局 404 路径（本项目有 4 个根布局：(blog)/(auth)/admin/music）。
 *
 * ⚠️ 仍然**不要**在这里调用 notFound()：一调就等于放弃本文件，回到那套不确定的全局边界。
 * 原始踩坑记录见 docs/api-known-issues.md 第七节。
 */
export default function AdminCatchAll() {
    return <AdminNotFoundView />;
}
