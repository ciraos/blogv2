"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
    AlertTriangle,
    CheckCircle2,
    ChevronDown,
    ExternalLink,
    FileText,
    Globe,
    Info,
    KeyRound,
    Loader2,
    RefreshCw,
    Search,
    Settings,
    ShieldCheck,
    XCircle,
    type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CheckLevel, SeoCheck, SeoCheckResult } from "@/app/admin/seo-push/types";

/* =============================================================================
 * SEO 推送页（配置说明 + 本地体检）
 *
 * 后端现状（已探活确认）：**没有任何「提交 URL / 推送」接口**
 *  - 9 条候选推送路径全部 404；源码侧只有 sitemap / robots / RSS。
 *  - 只有三个配置键 seo.baidu.{enable,site,token}（官方 setting-keys.ts:312-314，isPro），
 *    走站点设置接口保存 —— 本页【不】调用 /api/admin/settings/update，也不调用
 *    POST /settings/get-by-keys（那是 POST 写路径，约定不碰）。
 *  - 实测 /public/site-config 也【不返回】seo.* 节点，所以本页无法读到那三个键的实时值，
 *    这一点如实标注，而不是伪造一个「已读取」的状态。
 *
 * 因此本页做两件真事：
 *  1. 配置区：只读列出三个键 + 跳转系统设置的入口（说明为什么这里读不到值）。
 *  2. 本地体检：调用本站同源路由 /api/admin/seo-check，由服务端抓取本站真实资源
 *     （sitemap.xml / robots.txt / 订阅源 / 首页与文章页 HTML）并解析，给出通过/不通过与证据。
 *  3. 站长平台入口：外链到百度 / 必应 / Google / IndexNow —— 提交动作只能在那些平台完成。
 * ========================================================================== */

/** 百度推送的三个配置键（来源：官方 setting-keys.ts:312-314） */
const SEO_KEYS: { key: string; label: string; desc: string }[] = [
    { key: "seo.baidu.enable", label: "启用百度推送", desc: "布尔开关；官方标记为 Pro 功能" },
    { key: "seo.baidu.site", label: "站点域名", desc: "百度搜索资源平台里验证过的站点，如 https://blog.ciraos.top" },
    { key: "seo.baidu.token", label: "推送 token", desc: "百度「普通收录 → API 提交」里的准入密钥（敏感项）" },
];

/** 站长平台入口：提交/验证都必须在这些平台里做，后端没有代理接口 */
const WEBMASTER_LINKS: { name: string; href: string; desc: string; tone: string }[] = [
    {
        name: "百度搜索资源平台",
        href: "https://ziyuan.baidu.com/",
        desc: "站点验证 → 普通收录 → API 提交（需要这里的 token；本页无法代提交）",
        tone: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    },
    {
        name: "Bing Webmaster Tools",
        href: "https://www.bing.com/webmasters",
        desc: "提交站点地图与 URL；也支持从 Google Search Console 直接导入",
        tone: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
    },
    {
        name: "Google Search Console",
        href: "https://search.google.com/search-console",
        desc: "提交 sitemap、查看收录与抓取异常（IndexNow/Bing 也认这里的验证）",
        tone: "bg-red-500/10 text-red-600 dark:text-red-400",
    },
    {
        name: "IndexNow",
        href: "https://www.indexnow.org/",
        desc: "必应/Yandex 等共用的主动推送协议，需要自行部署 key 文件",
        tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    },
];

/** 体检结论的图标/配色（pass 绿 / fail 红 / info 中性） */
const LEVEL_STYLE: Record<CheckLevel, { icon: LucideIcon; cls: string; badge: string; text: string }> = {
    pass: { icon: CheckCircle2, cls: "text-emerald-600 dark:text-emerald-400", badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", text: "通过" },
    fail: { icon: XCircle, cls: "text-red-600 dark:text-red-400", badge: "bg-red-500/10 text-red-600 dark:text-red-400", text: "不通过" },
    info: { icon: Info, cls: "text-muted-foreground", badge: "bg-muted text-muted-foreground", text: "无法判定" },
};

/** 单条体检项：图标 + 结论 + 可展开的证据原文 */
function CheckRow({ check }: { check: SeoCheck }) {
    const [open, setOpen] = useState(false);
    const style = LEVEL_STYLE[check.level];
    const Icon = style.icon;
    const hasEvidence = (check.evidence?.length ?? 0) > 0;

    return (
        <div className="border-b last:border-b-0">
            <button
                type="button"
                // 没有证据就没必要展开（避免点开一片空白）
                onClick={() => hasEvidence && setOpen((v) => !v)}
                aria-expanded={hasEvidence ? open : undefined}
                className={`flex w-full items-start gap-2.5 px-4 py-3 text-left transition-colors ${
                    hasEvidence ? "hover:bg-muted/40" : "cursor-default"
                }`}
            >
                <Icon className={`mt-0.5 size-4 shrink-0 ${style.cls}`} />
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{check.label}</span>
                        <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ${style.badge}`}>{style.text}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{check.message}</p>
                </div>
                {hasEvidence && (
                    <ChevronDown className={`mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
                )}
            </button>
            {open && hasEvidence && (
                <ul className="space-y-1 border-t bg-muted/30 px-4 py-2.5">
                    {check.evidence?.map((line, index) => (
                        <li key={`${check.id}-${index}`} className="break-all font-mono text-[11px] leading-relaxed text-muted-foreground">
                            {line}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

/** 小标题：卡片内的分节标题（左侧有强调条） */
function SectionTitle({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint?: string }) {
    return (
        <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
            <Icon className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">{title}</h3>
            {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        </div>
    );
}

export function SeoPushManager() {
    const [data, setData] = useState<SeoCheckResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState<string | null>(null);

    /** 触发一次体检：请求本站同源代理，由服务端抓取真实资源并返回结论 */
    const runCheck = useCallback(async (showToast: boolean) => {
        setLoading(true);
        setFailed(null);
        try {
            const res = await fetch("/api/admin/seo-check", { cache: "no-store" });
            const json = (await res.json().catch(() => null)) as
                | { code: number; message: string; data: SeoCheckResult | null }
                | null;
            if (!res.ok || !json || json.code !== 200 || !json.data) {
                const message = json?.message || `体检请求失败（HTTP ${res.status}）`;
                setFailed(message);
                if (showToast) toast.error(message);
                return;
            }
            setData(json.data);
            if (showToast) {
                toast.success(`体检完成：${json.data.counts.pass} 项通过、${json.data.counts.fail} 项不通过`);
            }
        } catch {
            const message = "无法连接本站检查路由，请确认 dev server 正在运行";
            setFailed(message);
            if (showToast) toast.error(message);
        } finally {
            setLoading(false);
        }
    }, []);

    // 进页面自动跑一次（体检结果全部来自服务端真实抓取，没有任何占位数据）
    // 延后到下一个 tick：effect 内同步 setState 会触发级联渲染（react-hooks/set-state-in-effect）
    useEffect(() => {
        const timer = setTimeout(() => void runCheck(false), 0);
        return () => clearTimeout(timer);
    }, [runCheck]);

    return (
        <div className="flex flex-col gap-4 pb-4">
            {/* ---- 后端能力说明：诚实标注，不含任何伪造的推送记录 ---- */}
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3.5 py-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="space-y-1 text-xs leading-relaxed">
                    <p className="font-medium text-amber-700 dark:text-amber-300">
                        本站后端未提供 SEO 推送接口（社区版），此页提供「配置说明 + 本地体检 + 站长平台入口」。
                    </p>
                    <p className="text-muted-foreground">
                        已探活确认：面向百度的提交 URL / 推送记录等 9 条候选路径全部 404，后端源码侧只有 sitemap、robots 与 RSS。
                        因此这里不做提交、不记录推送历史 —— 页面上任何数字都来自对本站真实资源的抓取结果。
                    </p>
                </div>
            </div>

            {/* ---- 配置区（只读） ---- */}
            <section className="rounded-xl border bg-card">
                <SectionTitle icon={KeyRound} title="百度推送配置（只读）" hint="seo.baidu.* · 官方 setting-keys.ts:312-314，标记为 Pro" />
                <div className="divide-y">
                    {SEO_KEYS.map((item) => {
                        const live = data?.seoKeys.find((entry) => entry.key === item.key);
                        return (
                            <div key={item.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{item.key}</code>
                                <span className="text-sm">{item.label}</span>
                                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={item.desc}>
                                    {item.desc}
                                </span>
                                {live?.present ? (
                                    <Badge variant="outline" className="font-mono text-[11px]">
                                        {live.value}
                                    </Badge>
                                ) : (
                                    <Badge variant="secondary" className="text-[11px]">
                                        公开配置不可读
                                    </Badge>
                                )}
                            </div>
                        );
                    })}
                </div>
                <div className="space-y-1.5 border-t bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
                    <p>
                        为什么这里读不到值：站点公开配置接口 <code className="font-mono">GET /api/public/site-config</code> 实测
                        <span className="text-foreground"> 不返回 seo.* 节点</span>，而本前端「系统设置」的字段清单里也没有收录这三个键。
                        所以本页不去猜、不去调 <code className="font-mono">POST /api/admin/settings/get-by-keys</code>（属写路径，本次约定不触碰）。
                    </p>
                    <p>修改方式：在后端管理端（官方后台）的系统设置里维护这三个键；本站前端后台的配置读写由你自行处理。</p>
                    <div className="pt-1">
                        <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                            <Link href="/admin/settings">
                                <Settings className="size-3.5" />
                                打开系统设置
                            </Link>
                        </Button>
                    </div>
                </div>
            </section>

            {/* ---- 本地体检 ---- */}
            <section className="rounded-xl border bg-card">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2.5">
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="size-4 text-muted-foreground" />
                        <h3 className="text-sm font-medium">本地体检清单</h3>
                        <span className="text-xs text-muted-foreground">服务端抓取本站资源后解析判定</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {data && (
                            <span className="text-xs text-muted-foreground">
                                目标 <span className="font-mono">{data.siteUrl || "（未取到站点地址）"}</span>
                            </span>
                        )}
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={loading}
                            onClick={() => void runCheck(true)}
                        >
                            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                            重新体检
                        </Button>
                    </div>
                </div>

                {loading && !data ? (
                    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        正在抓取 sitemap / robots / 订阅源与页面 meta…
                    </div>
                ) : failed && !data ? (
                    <div className="flex flex-col items-center gap-1 py-10 text-sm text-muted-foreground">
                        <XCircle className="size-5 text-red-500" />
                        {failed}
                    </div>
                ) : data ? (
                    <>
                        {/* 概览：通过 / 不通过 / 无法判定 计数 + 检查时间 */}
                        <div className="grid grid-cols-3 gap-2 border-b p-3">
                            {(
                                [
                                    { label: "通过", value: data.counts.pass, cls: "text-emerald-600 dark:text-emerald-400" },
                                    { label: "不通过", value: data.counts.fail, cls: "text-red-600 dark:text-red-400" },
                                    { label: "无法判定", value: data.counts.info, cls: "text-muted-foreground" },
                                ] as const
                            ).map((tile) => (
                                <div key={tile.label} className="rounded-lg border bg-muted/40 px-3 py-2">
                                    <p className="text-xs text-muted-foreground">{tile.label}</p>
                                    <p className={`text-lg font-semibold tabular-nums ${tile.cls}`}>{tile.value}</p>
                                </div>
                            ))}
                        </div>
                        <div className="border-b px-4 py-2 text-[11px] text-muted-foreground">
                            体检时间 {new Date(data.checkedAt).toLocaleString("zh-CN")}
                            {loading && (
                                <span className="ml-2 inline-flex items-center gap-1">
                                    <Loader2 className="size-3 animate-spin" />
                                    正在刷新…
                                </span>
                            )}
                        </div>

                        {/* 逐项结论 */}
                        <div>
                            {data.checks.map((check) => (
                                <CheckRow key={check.id} check={check} />
                            ))}
                        </div>

                        {/* 抽查到的页面 meta：字段级结果 + 真实取值 */}
                        {data.pages.length > 0 && (
                            <div className="border-t">
                                <SectionTitle
                                    icon={FileText}
                                    title="页面 meta 抽查明细"
                                    hint={`共 ${data.pages.length} 个页面 · 值取自真实 HTML`}
                                />
                                <div className="divide-y">
                                    {data.pages.map((page) => (
                                        <div key={page.url} className="px-4 py-3">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Globe className="size-3.5 text-muted-foreground" />
                                                <a
                                                    href={page.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="break-all font-mono text-xs text-foreground hover:underline"
                                                >
                                                    {page.url}
                                                </a>
                                                <Badge variant="outline" className="text-[11px]">
                                                    {page.error ? page.error : `HTTP ${page.status}`}
                                                </Badge>
                                            </div>
                                            {page.fields.length > 0 ? (
                                                <ul className="mt-2 space-y-1">
                                                    {page.fields.map((field) => (
                                                        <li key={`${page.url}-${field.key}`} className="flex items-start gap-2 text-xs">
                                                            {field.ok ? (
                                                                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                                            ) : (
                                                                <XCircle className="mt-0.5 size-3.5 shrink-0 text-red-600 dark:text-red-400" />
                                                            )}
                                                            <span className="w-32 shrink-0 text-muted-foreground">{field.label}</span>
                                                            <span className="min-w-0 flex-1 break-all font-mono text-[11px] text-foreground/80">
                                                                {field.value}
                                                            </span>
                                                        </li>
                                                    ))}
                                                    <li className="flex items-start gap-2 pt-1 text-xs">
                                                        <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                                                        <span className="w-32 shrink-0 text-muted-foreground">meta robots / og:type</span>
                                                        <span className="min-w-0 flex-1 break-all font-mono text-[11px] text-foreground/80">
                                                            {page.metaRobots || "（未声明 robots）"}
                                                            {page.ogType ? ` · og:type=${page.ogType}` : " · og:type 缺失"}
                                                        </span>
                                                    </li>
                                                </ul>
                                            ) : (
                                                <p className="mt-1 text-xs text-muted-foreground">该页面没有解析到可用的 meta 字段</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* robots.txt 原文：结论的证据摆在明面上 */}
                        {data.robots && (
                            <div className="border-t">
                                <SectionTitle icon={ShieldCheck} title="robots.txt 原文" hint={data.robots.url} />
                                <pre className="admin-scroll max-h-56 overflow-auto bg-muted/30 px-4 py-2.5 font-mono text-[11px] leading-relaxed">
                                    {data.robots.text || "（空）"}
                                </pre>
                                {data.robots.suspiciousDisallows.length > 0 && (
                                    <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
                                        除 /admin 之外的 Disallow（如与预期不符请核对）：
                                        <span className="font-mono"> {data.robots.suspiciousDisallows.join("；")}</span>
                                    </p>
                                )}
                            </div>
                        )}

                        {/* sitemap 条目抽样 */}
                        {data.sitemap && (
                            <div className="border-t">
                                <SectionTitle
                                    icon={Search}
                                    title="sitemap 条目抽样"
                                    hint={
                                        data.sitemap.error
                                            ? data.sitemap.error
                                            : `共解析到 ${data.sitemap.count} 条 <loc>，下面展示前 ${Math.min(data.sitemap.urls.length, 20)} 条`
                                    }
                                />
                                {data.sitemap.urls.length > 0 ? (
                                    <ul className="space-y-1 px-4 py-2.5">
                                        {data.sitemap.urls.map((url) => (
                                            <li key={url} className="break-all font-mono text-[11px] text-muted-foreground">
                                                {url}
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="px-4 py-2.5 text-xs text-muted-foreground">
                                        {data.sitemap.error ?? "没有解析到任何 <loc>"}
                                    </p>
                                )}
                            </div>
                        )}
                    </>
                ) : null}
            </section>

            {/* ---- 站长平台入口 ---- */}
            <section className="rounded-xl border bg-card">
                <SectionTitle
                    icon={ExternalLink}
                    title="站长平台入口"
                    hint="提交 / 验证只能在平台侧完成，后端没有推送接口可代劳"
                />
                <div className="grid gap-2 p-3 sm:grid-cols-2">
                    {WEBMASTER_LINKS.map((link) => (
                        <a
                            key={link.name}
                            href={link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex items-start gap-2.5 rounded-lg border bg-muted/30 px-3 py-2.5 transition-colors hover:bg-muted"
                        >
                            <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${link.tone}`}>
                                <ExternalLink className="size-3.5" />
                            </span>
                            <span className="min-w-0">
                                <span className="flex items-center gap-1 text-sm font-medium group-hover:underline">
                                    {link.name}
                                </span>
                                <span className="mt-0.5 block text-xs text-muted-foreground">{link.desc}</span>
                            </span>
                        </a>
                    ))}
                </div>
                <p className="border-t px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
                    说明：这些平台需要你先完成站点所有权验证（DNS / 文件 / meta 标签），再提交
                    <code className="mx-1 font-mono">{data?.siteUrl || "本站"}/sitemap.xml</code>
                    或逐条提交 URL。本页只提供入口与体检结论，不会替你提交，也不会显示「已提交 N 条」这类无法核实的数字。
                </p>
            </section>
        </div>
    );
}
