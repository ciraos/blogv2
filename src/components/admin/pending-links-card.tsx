"use client";

/* =============================================================================
 * 仪表盘「待审友链」卡：原来的「待审评论」卡位换成「**申请中**的友链申请」。
 *
 * 数据源（纯读，只发 GET）：
 *   GET /api/admin/links?page=..&pageSize=..&status=PENDING
 *   → 同源代理 src/app/api/admin/links/route.ts（已存在，读取 httpOnly cookie 里的
 *     accessToken 转发远端 GET /links）→ 远端 model.LinkDTO 列表 `{ list, total, page, pageSize }`。
 *
 * 为什么用 status=PENDING：后端友链状态枚举只有 PENDING / APPROVED / REJECTED / INVALID
 * （src/types/links.ts 的 AdminCreateLinkRequest.status 注释 + swagger model.ReviewLinkRequest），
 * 前台申请表单 POST /public/links 落库时缺省就是 PENDING（swagger ImportLinkItem.status
 * 「缺省为 PENDING」），所以「有申请的友链」= status 为 PENDING 的那批。
 * 没有专门的 /links/applications 管理端接口（公开的只有 /public/links/applications）。
 *
 * ⚠️ 申请时间：接口**不返回** created_at（swagger model.LinkDTO 没有该字段，实测公开
 *    /public/links/applications 的 JSON 里也没有），所以这里不做「用 id 估算时间」这种编造；
 *    created_at 一旦由后端补上，本卡会自动把它显示出来（字段按可选读取）。
 *    排序仍然等价于「按申请时间倒序」：后端 /links 与 /public/links/applications 都是
 *    ORDER BY id DESC（id 自增 = 申请先后），本地再按 id 降序兜一次，保证翻页拼接后顺序稳定。
 *
 * 条数：用户要求「只要是有申请的友链就在这里显示出来」，所以**不限条数**——
 *    分页拉全（pageSize 50，安全上限 40 页），卡内容区 max-h + overflow-y-auto 卡内滚动，
 *    不再像旧「待审评论」卡那样只取前 3 条。
 *
 * 视觉：外壳 / 卡头 / 徽章 class 与同区块的 comment-feed.tsx（最新评论卡）逐字一致，
 *    圆角 rounded-xl、描边 border、bg-card、p-4、shadow-sm，深浅色由令牌自身跟随主题。
 * ========================================================================== */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Handshake } from "lucide-react";
import { toast } from "sonner";

import { getAdminLinksApi } from "@/lib/api";
import type { FriendLink } from "@/types/links";

/** 申请中（待审核）的友链状态值，后端枚举见文件头注释 */
const PENDING_STATUS = "PENDING";
/** 单页拉取条数：尽量一次拉完，后端若忽略 pageSize 会退化为默认页大小，下面的循环照样能拉全 */
const PAGE_SIZE = 50;
/** 翻页安全上限（50 × 40 = 2000 条），避免后端分页异常时死循环 */
const MAX_PAGES = 40;

/**
 * 申请单的额外字段：model.LinkDTO 里还有 type / update_reason / original_url，
 * 但共享类型 FriendLink 没有声明（友链列表页用不到）——这里按可选字段读取，避免改共享类型。
 * created_at 目前接口不返回，声明成可选是为了后端补上后能直接渲染（见文件头注释）。
 */
type PendingLink = FriendLink & {
    type?: string;
    update_reason?: string;
    original_url?: string;
    created_at?: string;
};

/** 卡片外壳：与「最新评论」卡同一套令牌；min-h 让两卡在 items-stretch 下视觉等高 */
const cardCls = "flex min-h-[248px] flex-col rounded-xl border bg-card p-4 shadow-sm";

/** 卡内容区：撑满剩余高度、封顶 288px（约 4~5 行），超出的在卡内滚动而不是把整块仪表盘拉长 */
const cardBodyCls = "min-h-0 max-h-[288px] flex-1 overflow-y-auto";

/** 卡头图标徽章（与统计卡 GroupTitle 同款：主色 10% 底 + 主色图标） */
const iconBadgeCls = "flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary";

/** 状态 / 类型徽章（配色沿用评论卡与友链管理页的浅底深字，深色模式走 /15 透明底） */
const pendingBadgeCls = "shrink-0 rounded-full bg-yellow-100 px-1.5 py-0.5 text-[11px] font-medium text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400";
const updateBadgeCls = "shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-400";

/** 正文压成一行（列表里预览 + 悬浮看全文用） */
function oneLine(text?: string): string {
    return (text ?? "").replace(/\s+/g, " ").trim();
}

/** 从 URL 取主机名：卡片窄，展示域名就够；解析失败退回去掉协议与路径的原始串 */
function linkHost(url?: string): string {
    const raw = (url ?? "").trim();
    if (!raw) return "";
    const withScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(raw) ? raw : `https://${raw}`;
    try {
        return new URL(withScheme).host;
    } catch {
        return raw.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
    }
}

/** 外链地址：缺协议时补 https，只用于「新窗口打开原站」这个纯读交互 */
function safeHref(url: string): string {
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/**
 * 申请时间（YYYY-MM-DD HH:mm）。接口当前不返回 created_at → 返回 null，调用方不渲染时间位；
 * 不用 id / 排序位置去「估算」时间，避免给用户看到假数据。
 */
function formatApplyTime(iso?: string): string | null {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * 拉全部待审申请：按页循环直到取够 total / 空页 / 没有新增（防止后端重复返回同一页）。
 * 后端 total 是「按 status 过滤后的总数」，所以 all.length >= total 即可停。
 */
async function fetchAllPendingLinks(): Promise<{ list: PendingLink[]; total: number }> {
    const seen = new Set<number>();
    const all: PendingLink[] = [];
    let total = 0;

    for (let page = 1; page <= MAX_PAGES; page++) {
        const data = await getAdminLinksApi({ page, pageSize: PAGE_SIZE, status: PENDING_STATUS });
        total = data.total ?? 0;
        const list = (data.list ?? []) as PendingLink[];
        const before = all.length;
        for (const link of list) {
            if (!seen.has(link.id)) {
                seen.add(link.id);
                all.push(link);
            }
        }
        // 空页 / 这一页没有任何新条目（后端忽略分页参数时的兜底）/ 已取够
        if (list.length === 0 || all.length === before || all.length >= total) break;
    }

    // 后端本来就是 id 降序（= 申请时间倒序），这里兜一次，保证多页拼接后仍严格倒序
    return { list: all.sort((a, b) => b.id - a.id), total };
}

/** 加载骨架：与卡片同高同宽，避免先塌后撑的跳动 */
function Skeleton() {
    return <div className="h-[248px] animate-pulse rounded-xl border bg-card" aria-busy="true" aria-label="待审友链加载中" />;
}

/** 单条申请：站点名 +（修改申请）标签 + 待审 + 域名 + 一行简介/修改原因 */
function PendingLinkRow({ link }: { link: PendingLink }) {
    const isUpdate = (link.type ?? "").toUpperCase() === "UPDATE";
    const host = linkHost(link.url);
    const name = link.name?.trim() || host || "未命名站点";
    // 修改类申请的重点是「改了什么原因」，没填原因才退回站点简介
    const note = oneLine(isUpdate ? link.update_reason || link.description : link.description);
    const time = formatApplyTime(link.created_at);
    const rawUrl = (link.url ?? "").trim();

    return (
        <li className="py-2.5 first:pt-0 last:pb-0">
            <div className="flex items-center gap-1.5">
                {/* 站点名可截断（min-w-0），徽章与时间不许被挤走 */}
                <span className="min-w-0 truncate text-xs font-medium" title={name}>
                    {name}
                </span>
                {isUpdate && <span className={updateBadgeCls}>修改申请</span>}
                <span className={pendingBadgeCls}>待审</span>
                {time && <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{time}</span>}
            </div>
            {/* 链接域名：卡片窄，只显示 host；完整地址放 title，点开是原站新窗口（纯读，不经过任何写接口） */}
            {rawUrl ? (
                <a
                    href={safeHref(rawUrl)}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    title={rawUrl}
                    className="mt-0.5 block truncate text-[11px] font-medium text-sky-500 transition-colors hover:text-sky-600 hover:underline dark:text-sky-400 dark:hover:text-sky-300"
                >
                    {host || rawUrl}
                </a>
            ) : (
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">未填写链接</span>
            )}
            {note && (
                <p className="mt-0.5 line-clamp-1 text-xs leading-snug break-words text-muted-foreground" title={note}>
                    {note}
                </p>
            )}
        </li>
    );
}

/**
 * 待审友链卡（仪表盘右上卡位）：标题「待审友链」，列出**全部** status=PENDING 的友链申请，
 * 按申请先后倒序，卡内滚动；卡头右侧保留进入「友链管理」页的入口。
 * 只读：这里没有任何通过 / 拒绝按钮（审核仍只在友链管理页做）。
 */
export function PendingLinksCard({ embedded = false }: { embedded?: boolean } = {}) {
    const [links, setLinks] = useState<PendingLink[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setFailed(false);
        try {
            const { list, total: count } = await fetchAllPendingLinks();
            setLinks(list);
            setTotal(count);
        } catch (e) {
            setFailed(true);
            toast.error(e instanceof Error ? e.message : "获取待审友链失败");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // 延后到下一个 tick：effect 内同步 setState 会触发级联渲染（react-hooks/set-state-in-effect）
        const timer = setTimeout(() => void load(), 0);
        return () => clearTimeout(timer);
    }, [load]);

    if (loading) return <Skeleton />;

    return (
        // embedded：并进「动态」那张大卡时，自己不再画外框（由外层统一描边），只保留卡头 + 列表
        <section className={embedded ? "flex min-h-0 flex-col" : cardCls}>
            <div className="mb-3 flex items-center gap-2">
                <span className={iconBadgeCls}>
                    <Handshake className="size-3.5" />
                </span>
                <h3 className="text-sm font-semibold">待审友链</h3>
                {total > 0 && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ${pendingBadgeCls}`}>{total}</span>
                )}
                <Link
                    href="/admin/friends"
                    className="ml-auto inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                    去友链管理
                    <ChevronRight className="size-3.5" />
                </Link>
            </div>

            <div className={cardBodyCls}>
                {failed ? (
                    <p className="py-8 text-center text-xs text-muted-foreground">
                        待审友链加载失败
                        <button
                            type="button"
                            onClick={() => void load()}
                            className="ml-1 font-medium text-primary hover:underline"
                        >
                            重试
                        </button>
                    </p>
                ) : links.length === 0 ? (
                    <p className="py-8 text-center text-xs text-muted-foreground">暂无待审友链</p>
                ) : (
                    // divide-y：相邻申请之间一条横杠，把每条申请区分开
                    <ul className="divide-y divide-border/60">
                        {links.map((link) => (
                            <PendingLinkRow key={link.id} link={link} />
                        ))}
                    </ul>
                )}
            </div>

            {links.length > 0 && (
                <p className="mt-2 shrink-0 border-t border-border/60 pt-2.5 text-[11px] text-muted-foreground">
                    共 {total} 条待审申请 · 最近提交的排在最前
                </p>
            )}
        </section>
    );
}
