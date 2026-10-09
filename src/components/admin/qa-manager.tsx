"use client";

import Link from "next/link";
import {
    AlertTriangle,
    ArrowRight,
    CheckCircle2,
    FileQuestion,
    Globe,
    Info,
    Lightbulb,
    MessageCircle,
    MessagesSquare,
    Route,
    ThumbsUp,
    type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/* =============================================================================
 * 社区问答页（只读配置展示 + 可行实现路径说明）
 *
 * 后端现状（已探活确认）：
 *  - 公开配置里有 community_qa.enable，但**找不到任何问答管理接口**（8 条候选路径全 404），
 *    官方前端也没有这个模块 —— 所以本页不提供任何问答列表，也不编造问答数据。
 *  - 本组件是纯静态说明 + 一个只读开关值（值由服务端页面读 /public/site-config 后传入，
 *    读不到时如实显示「读取失败」，不猜真假）。
 *
 * 因此这里没有任何网络请求，也不假造列表。
 * ========================================================================== */

/** 前台最新评论页（本仓库固定路由，见 src/app/(blog)/recentcomments） */
const RECENT_COMMENTS_PATH = "/recentcomments";

/** 评论系统里可复用的真实机制（每条都已在本仓库源码中确认，不是设想） */
const MECHANISMS: { icon: LucideIcon; title: string; detail: string; source: string }[] = [
    {
        icon: Route,
        title: "任意 target_path",
        detail: "评论按 target_path 挂载，值可以是任意路径字符串 —— 挂 /qa 就等于开了一个问答板，与文章页共用同一套评论数据。",
        source: "src/lib/api.ts · getCommentsByPathApi({ target_path })",
    },
    {
        icon: MessagesSquare,
        title: "子评论 / 楼中楼",
        detail: "提交时可带 parent_id（顶层父评论）与 reply_to_id（被回复的那条），并可用 GET /public/comments/{id}/children 拉取子评论，天然支持「回答」与追问。",
        source: "src/components/(blog)/post-comments.tsx · 发表与回复统一走 POST /public/comments",
    },
    {
        icon: ThumbsUp,
        title: "点赞计数字段",
        detail: "评论数据结构里有 like_count（后端返回），但本站前端的点赞按钮仍是「待接入」占位、没有调用任何点赞接口，所以不能拿它当已实现的「答案投票」。",
        source: "src/lib/api.ts · RecentComment.like_count ／ post-comments.tsx 点赞按钮为占位",
    },
    {
        icon: MessageCircle,
        title: "跨页聚合与筛选",
        detail: "全站最新评论接口可聚合展示，后台评论管理也能按目标路径筛选，等于现成的「问答内容审计」视角。",
        source: "GET /public/comments/latest ／ 后台 /admin/comments 的 target_path 筛选",
    },
];

/** 若要把问答真正做出来，需要动的几处（明确区分现状） */
const STEPS: { step: string; detail: string; done: boolean }[] = [
    {
        step: "开通开关",
        detail: "community_qa.enable = true（配置键存在，可在后端管理端设置；本站前端未读取该键）",
        done: false,
    },
    {
        step: "前台问答页",
        detail: "新建 (blog)/qa 路由，用 PostComments 挂 target_path=\"/qa\" —— 前台问答页尚未实现",
        done: false,
    },
    {
        step: "导航入口",
        detail: "在站点配置的导航菜单里加入 /qa 条目，否则访客找不到入口",
        done: false,
    },
    {
        step: "内容运营",
        detail: "用后台评论管理（不是本页）审核、置顶、隐藏问答内容 —— 这条机制现在就可用",
        done: true,
    },
];

export function QaManager({
    qaEnable,
    configOk,
    configMessage,
    siteUrl,
    messagePath,
}: {
    /** community_qa.enable 的当前值；configOk 为 false 时该值无意义 */
    qaEnable: boolean | null;
    /** 是否成功读到站点公开配置 */
    configOk: boolean;
    /** 读取失败时的说明（成功时为空） */
    configMessage?: string;
    /** 站点地址（仅用于文案里的说明） */
    siteUrl: string;
    /** 站点配置导航里的「留言板」路径（若存在），没有则为 null */
    messagePath: string | null;
}) {
    return (
        <div className="flex flex-col gap-4 pb-4">
            {/* ---- 后端能力说明：诚实标注 ---- */}
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3.5 py-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="space-y-1 text-xs leading-relaxed">
                    <p className="font-medium text-amber-700 dark:text-amber-300">
                        社区问答没有独立的管理接口，本站前台也尚未实现问答页。
                    </p>
                    <p className="text-muted-foreground">
                        已探活确认：8 条候选问答接口路径全部 404，官方前端也没有该模块；可用的只有一个配置开关
                        <code className="mx-1 font-mono">community_qa.enable</code>
                        与一套成熟的评论系统。因此本页不展示任何问答列表 —— 没有数据源就不摆空壳列表。
                    </p>
                </div>
            </div>

            {/* ---- 配置开关（只读） ---- */}
            <section className="rounded-xl border bg-card">
                <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
                    <Info className="size-4 text-muted-foreground" />
                    <h3 className="text-sm font-medium">配置状态（只读）</h3>
                    <span className="text-xs text-muted-foreground">
                        来源：服务端读取 <code className="font-mono">GET /api/public/site-config</code>
                    </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">community_qa.enable</code>
                    {!configOk ? (
                        <Badge variant="destructive" className="text-[11px]">
                            读取失败
                        </Badge>
                    ) : qaEnable ? (
                        <Badge className="bg-emerald-500/15 text-[11px] text-emerald-600 dark:text-emerald-400">true · 已开启</Badge>
                    ) : (
                        <Badge variant="secondary" className="text-[11px]">
                            false · 未开启
                        </Badge>
                    )}
                    <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                        {configOk
                            ? qaEnable
                                ? "后端配置已打开，但本仓库前台代码里没有任何地方读取这个键 —— 打开它目前不会让任何页面出现问答功能。"
                                : "后端配置为关闭，且前台代码也未读取该键。"
                            : (configMessage ?? "站点公开配置暂时不可用，无法确认当前值。")}
                    </span>
                </div>
                <div className="space-y-1 border-t bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
                    <p>
                        这个键在站点配置里真实存在（公开配置会返回该节点），但既没有配套的管理接口，也没有前台页面消费它 ——
                        它当前只是一个「备而不用」的开关。
                    </p>
                    <div className="pt-1">
                        <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                            <Link href="/admin/settings">
                                系统设置
                                <ArrowRight className="size-3.5" />
                            </Link>
                        </Button>
                    </div>
                </div>
            </section>

            {/* ---- 可行的实现路径（复用评论系统） ---- */}
            <section className="rounded-xl border bg-card">
                <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
                    <Lightbulb className="size-4 text-muted-foreground" />
                    <h3 className="text-sm font-medium">可行实现路径：复用评论系统</h3>
                    <span className="text-xs text-muted-foreground">下面每条机制都是本仓库已在用的真实能力</span>
                </div>
                <div className="divide-y">
                    {MECHANISMS.map((item) => (
                        <div key={item.title} className="flex items-start gap-2.5 px-4 py-3">
                            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <item.icon className="size-3.5" />
                            </span>
                            <div className="min-w-0">
                                <p className="text-sm font-medium">{item.title}</p>
                                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
                                <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground/80">{item.source}</p>
                            </div>
                        </div>
                    ))}
                </div>
                <p className="border-t px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
                    结论：问答不需要新后端 —— 用一个约定的 <code className="font-mono">target_path</code>
                    （例如 <code className="font-mono">/qa</code>）就能让「提问（顶层评论）+ 回答（子评论）」跑在同一套评论数据上，
                    审核与置顶直接用后台评论管理。真正缺的只有前台那一页 UI。
                </p>
            </section>

            {/* ---- 落地步骤清单（明确区分已做 / 未做） ---- */}
            <section className="rounded-xl border bg-card">
                <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
                    <FileQuestion className="size-4 text-muted-foreground" />
                    <h3 className="text-sm font-medium">如果要真正开通问答，还差什么</h3>
                </div>
                <ul className="divide-y">
                    {STEPS.map((item) => (
                        <li key={item.step} className="flex items-start gap-2.5 px-4 py-3">
                            {item.done ? (
                                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                            ) : (
                                <span className="mt-1.5 size-3 shrink-0 rounded-full border-2 border-muted-foreground/40" aria-hidden="true" />
                            )}
                            <div className="min-w-0">
                                <p className="text-sm font-medium">
                                    {item.step}
                                    <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                                        {item.done ? "现成可用" : "尚未实现"}
                                    </span>
                                </p>
                                <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>
                            </div>
                        </li>
                    ))}
                </ul>
            </section>

            {/* ---- 相关入口（真实存在的路由，点得进去） ---- */}
            <section className="rounded-xl border bg-card">
                <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
                    <Route className="size-4 text-muted-foreground" />
                    <h3 className="text-sm font-medium">相关入口</h3>
                </div>
                <div className="grid gap-2 p-3 sm:grid-cols-2">
                    <Link
                        href="/admin/comments"
                        className="group flex items-start gap-2.5 rounded-lg border bg-muted/30 px-3 py-2.5 transition-colors hover:bg-muted"
                    >
                        <MessagesSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0">
                            <span className="block text-sm font-medium group-hover:underline">后台评论管理</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                                问答内容将来就落在评论表里，可按 <code className="font-mono">target_path</code> 筛选、置顶、隐藏
                            </span>
                        </span>
                    </Link>
                    <Link
                        href={RECENT_COMMENTS_PATH}
                        className="group flex items-start gap-2.5 rounded-lg border bg-muted/30 px-3 py-2.5 transition-colors hover:bg-muted"
                    >
                        <MessageCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0">
                            <span className="block text-sm font-medium group-hover:underline">前台最新评论</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                                评论系统的真实效果参考（{RECENT_COMMENTS_PATH}），问答会复用同一套组件
                            </span>
                        </span>
                    </Link>
                    {messagePath && (
                        <Link
                            href={messagePath}
                            className="group flex items-start gap-2.5 rounded-lg border bg-muted/30 px-3 py-2.5 transition-colors hover:bg-muted"
                        >
                            <Globe className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0">
                                <span className="block text-sm font-medium group-hover:underline">前台留言板</span>
                                <span className="mt-0.5 block text-xs text-muted-foreground">
                                    已存在的自定义页面（{messagePath}），问答页可以照它的方式挂载
                                </span>
                            </span>
                        </Link>
                    )}
                </div>
                <p className="border-t px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
                    前台问答路由（<code className="font-mono">/qa</code>）尚不存在，这里就不给出站链接了 ——
                    放一个点进去是 404 的「问答入口」比不放更糟。
                    {siteUrl ? `收录相关的检查请见 SEO 推送页（本站：${siteUrl}）。` : ""}
                </p>
            </section>
        </div>
    );
}
