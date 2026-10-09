import Link from "next/link";

import { FooterUptimeKuma } from "@/components/(blog)/footer-uptime-kuma";
import type { FooterConfig } from "@/types/site-config";

interface FooterBottomBarProps {
    /** footer.owner（站长名 + 建站年份，用于 ©年份） */
    owner?: FooterConfig["owner"];
    /** footer.bar（作者链接 / CC 协议链接 / 底栏链接列表） */
    bar?: FooterConfig["bar"];
    /** 备案信息在站点配置顶层，不在 footer 段里 */
    icpNumber?: string;
    policeRecordNumber?: string;
    policeRecordIcon?: string;
    /** footer.uptime_kuma（内联在备案行里） */
    kuma?: FooterConfig["uptime_kuma"];
}

/**
 * 页脚底栏（对齐官方主题 Blog Footer 的 Bottom Bar）：
 *   左：`©年份 By 站长` / 第二行 = 公安备案 + ICP 备案 + 运行状态（内联）
 *   右：底栏链接（footer.bar.linkList）+ CC BY-NC-ND 协议图标组
 *
 * 整条是**通栏**（自己铺满屏幕宽度、带自己的底色），内容再居中收进 max-w-300 里，
 * 所以调用方要把它放在 footer 的 max-w 容器**外面**。
 * 配色全部走主题令牌，深浅色自动适配。
 */
export async function FooterBottomBar({ owner, bar, icpNumber, policeRecordNumber, policeRecordIcon, kuma }: FooterBottomBarProps) {
    const nowYear = new Date().getFullYear();
    const since = Number(owner?.since) || 0;
    const yearRange = since && since !== nowYear ? `${since} - ${nowYear}` : String(nowYear);

    const authorName = owner?.name?.trim();
    const authorLink = bar?.authorLink?.trim();

    const hasRecordRow = Boolean(policeRecordNumber || icpNumber || kuma?.enable);
    if (!authorName && !hasRecordRow && !bar?.linkList?.length && !bar?.cc?.link) return null;

    return (
        <div className="mt-4 w-full border-t border-border/60 bg-muted/40">
            <div className="mx-auto flex w-full max-w-300 flex-col gap-3 px-4 py-5 text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-0">
                {/* 左：版权 + 备案/状态 */}
                <div className="flex flex-col items-center gap-1.5 sm:items-start">
                    {authorName && (
                        <p className="text-sm">
                            ©{yearRange} By{" "}
                            {authorLink ? (
                                <Link href={authorLink} className="font-medium transition-colors hover:text-primary">
                                    {authorName}
                                </Link>
                            ) : (
                                <span className="font-medium">{authorName}</span>
                            )}
                        </p>
                    )}

                    {hasRecordRow && (
                        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs">
                            {policeRecordNumber && (
                                <Link
                                    href="http://www.beian.gov.cn/portal/registerSystemInfo"
                                    target="_blank"
                                    rel="noreferrer"
                                    title="前往全国互联网安全管理服务平台的备案信息查询页面"
                                    className="inline-flex items-center gap-1 transition-colors hover:text-primary"
                                >
                                    {policeRecordIcon && (
                                        // 公安备案图标来自站点配置的外链，尺寸固定 14px（官方同款）
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={policeRecordIcon} alt="" className="size-3.5 object-contain" />
                                    )}
                                    {policeRecordNumber}
                                </Link>
                            )}

                            {icpNumber && (
                                <Link
                                    href="https://beian.miit.gov.cn/"
                                    target="_blank"
                                    rel="noreferrer"
                                    title="前往工业和信息化部政务服务平台的备案信息查询页面"
                                    className="transition-colors hover:text-primary"
                                >
                                    {icpNumber}
                                </Link>
                            )}

                            {/* 运行状态：与备案号同一行、紧随其后（官方 recordInfo 的排布） */}
                            <FooterUptimeKuma config={kuma} />
                        </div>
                    )}
                </div>

                {/* 右：链接列表 + CC 协议 */}
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
                    {bar?.linkList?.map((item) => {
                        const isExternal = /^https?:\/\//i.test(item.link);
                        return (
                            <Link
                                key={`${item.text}-${item.link}`}
                                href={item.link}
                                {...(isExternal ? { target: "_blank", rel: "noreferrer" } : {})}
                                className="text-sm font-medium transition-colors hover:text-primary"
                            >
                                {item.text}
                            </Link>
                        );
                    })}

                    {bar?.cc?.link && (
                        <Link
                            href={bar.cc.link}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="CC BY-NC-ND 4.0 协议"
                            title="CC BY-NC-ND 4.0 协议"
                            className="inline-flex items-center gap-0.5 text-muted-foreground transition-colors hover:text-primary"
                        >
                            <CcBadge kind="cc" />
                            <CcBadge kind="by" />
                            <CcBadge kind="nc" />
                            <CcBadge kind="nd" />
                        </Link>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * CC 协议图标组：官方用的是 iconify 的 `ri:creative-commons-*`，本项目没有那套图标源，
 * 这里用内联 SVG 画四个标准徽标（CC / BY / NC / ND）。全部 `currentColor` +
 * `text-*` 控制颜色，所以深浅色与 hover 都会自动跟随，也不需要新增依赖。
 */
function CcBadge({ kind }: { kind: "cc" | "by" | "nc" | "nd" }) {
    return (
        <svg viewBox="0 0 12 12" aria-hidden className="size-4" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
            <circle cx="6" cy="6" r="5.1" />
            {kind === "cc" && <path d="M7.5 4.5a2.1 2.1 0 1 0 0 3" />}
            {kind === "by" && (
                <>
                    <circle cx="6" cy="4.4" r="1.15" fill="currentColor" stroke="none" />
                    <path d="M3.7 9.1c0-1.35 1.05-2.2 2.3-2.2s2.3.85 2.3 2.2" fill="currentColor" stroke="none" />
                </>
            )}
            {kind === "nc" && (
                <>
                    <path d="M7.2 4.4H5.5a1 1 0 0 0 0 2h1a1 1 0 0 1 0 2H4.8M6 3.5v5" />
                    <path d="M2.6 9.4 9.4 2.6" />
                </>
            )}
            {kind === "nd" && <path d="M4 4.9h4M4 7.1h4" />}
        </svg>
    );
}
