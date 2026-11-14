import { Backpack, ExternalLink } from "lucide-react";

import { resolveAssetUrl } from "@/lib/utils";
import type { EquipmentGroup, EquipmentItem } from "@/types/site-config";

/**
 * 装备清单（后台「页面显示 → 装备页面 → 装备清单」里的 `equipment.list`）。
 *
 * 版式对齐官方前端的装备页：
 *   · 分组标题直接放在页面上（不再套一层卡片），下面是卡片网格；
 *   · 每张卡固定 400px 高：上面 200px 是图区（没有图时显示名称首字母的占位），
 *     中间是名称 / 规格 / 三行描述，底部固定一行「详情」按钮。
 * 这样一组里无论条目有没有配图，卡片高度都一致，栅格不会参差不齐。
 */
export function EquipmentList({ groups }: { groups?: EquipmentGroup[] | null }) {
    // 空分组（或一条装备都没有）直接跳过，避免页面上出现只有标题的空段落
    const visible = (groups ?? []).filter((group) => group && (group.equipment_list?.length ?? 0) > 0);
    if (visible.length === 0) return null;

    return (
        <div className="space-y-8">
            {visible.map((group, groupIndex) => (
                <section key={`${group.title}-${groupIndex}`} className="space-y-3">
                    <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                        <Backpack className="size-5 text-primary" aria-hidden />
                        {group.title || "装备"}
                    </h2>
                    {group.description && (
                        <p className="text-sm leading-relaxed text-muted-foreground">{group.description}</p>
                    )}

                    {/* 列数跟容器宽度走（官方用的是 auto-fill 固定最小宽），侧边栏收起后能多放一列 */}
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
                        {group.equipment_list.map((item, itemIndex) => (
                            <EquipmentCard key={`${item.name}-${itemIndex}`} item={item} />
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
}

function EquipmentCard({ item }: { item: EquipmentItem }) {
    const image = resolveAssetUrl(item.image);
    const initial = (item.name || "?").trim().charAt(0).toUpperCase();

    return (
        <article className="relative flex min-h-[400px] flex-col overflow-hidden soft-surface transition-colors hover:border-primary/40">
            {/* 图区：固定 200px 高；没有配图时用名称首字母占位（比留一块空白更像"装备卡"） */}
            <div className="flex h-[200px] shrink-0 items-center justify-center overflow-hidden border-b bg-muted/40">
                {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt={item.name || ""} loading="lazy" className="size-full object-cover" />
                ) : (
                    <span className="select-none text-6xl font-bold text-muted-foreground/25" aria-hidden>
                        {initial}
                    </span>
                )}
            </div>

            {/* 文字区：名称 / 规格 / 描述（描述固定三行高，卡片高度因此一致） */}
            <div className="mt-3 px-4 pb-16">
                <h3 className="mb-2 truncate text-lg font-bold leading-snug" title={item.name}>
                    {item.name || "未命名装备"}
                </h3>
                {item.specification && (
                    <p className="mb-1.5 truncate text-xs leading-4 text-muted-foreground">{item.specification}</p>
                )}
                {item.description && (
                    <p className="line-clamp-3 whitespace-pre-line text-sm leading-5 text-muted-foreground">
                        {item.description}
                    </p>
                )}
            </div>

            {/* 底部固定一行：有链接才给「详情」，否则显示一行灰字说明 */}
            <div className="absolute bottom-3 left-0 flex w-full items-center gap-2 px-4">
                {item.link ? (
                    <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="inline-flex items-center gap-1 rounded-lg bg-muted px-3 py-1.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-primary/12 hover:text-primary"
                        title="在新标签页打开商品页"
                    >
                        详情
                        <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                ) : (
                    <span className="rounded-lg bg-muted px-3 py-1.5 text-sm text-muted-foreground/70">暂无链接</span>
                )}
            </div>
        </article>
    );
}
