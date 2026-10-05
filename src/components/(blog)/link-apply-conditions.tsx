"use client";

import { useMemo, useState } from "react";
import { Check, ClipboardList } from "lucide-react";

import { LinkApplyForm } from "@/components/(blog)/link-apply-form";

interface LinkApplyConditionsProps {
    /** 申请条件文案（site-config FRIEND_LINK_APPLY_CONDITION，含 HTML 标签） */
    conditions: string[];
}

/** 友链申请条件：勾选全部后自动在下方弹出「友链申请」块（条件文案来自站点配置，支持 <b> 等 HTML） */
export function LinkApplyConditions({ conditions }: LinkApplyConditionsProps) {
    const [checked, setChecked] = useState<boolean[]>(() => conditions.map(() => false));
    const allChecked = useMemo(() => checked.length > 0 && checked.every(Boolean), [checked]);

    function toggle(index: number) {
        const next = [...checked];
        next[index] = !next[index];
        setChecked(next);
    }

    if (conditions.length === 0) return null;

    return (
        <>
            <section id="apply" className="rounded-xl bg-card p-5 shadow-sm">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <ClipboardList className="size-4.5 text-primary" />
                    申请条件
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">请先确认以下条件：</p>

                <ul className="mt-2 -space-y-3.5">
                    {conditions.map((condition, index) => (
                        <li key={index}>
                            <label className="w-max flex cursor-pointer items-center gap-3 rounded-lg p-3 transition-colors hover:bg-muted/50">
                                <span
                                    className={`flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors ${checked[index]
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "border-foreground/30 bg-background"
                                        }`}
                                >
                                    {checked[index] && <Check className="size-3.5" />}
                                </span>
                                <input
                                    type="checkbox"
                                    checked={checked[index]}
                                    onChange={() => toggle(index)}
                                    className="sr-only"
                                />
                                {/* 条件文案来自后端，可能含 <b> / <strong> 等标签，加重的词用「主题主色 + 粗体」突出。
                                    粗体为什么写 font-bold(700) 而不是 font-semibold(600)：
                                    这里没有自带字体，中文由浏览器回退到系统字体（微软雅黑 / Noto Sans SC / 苹方…），
                                    这类字体通常只随 400 与 700 两个字重；请求 600 时部分浏览器/字体会就近匹配到
                                    「中等/半粗」甚至回落到 400，看起来就像没变粗。700 是这些回退字体都有的真实字重，
                                    必定命中粗体字面；若某个回退字体只有 400，浏览器默认 font-synthesis-weight:auto
                                    会合成粗体（全站没有 font-synthesis:none），所以任何浏览器上都会变粗。
                                    颜色用 --link-accent（浅色下是加深的主色，保证白底对比度；深色下就是 --primary），
                                    不写死 hex；<b> 与 <strong> 都覆盖，后端两种写法都不会丢主色。 */}
                                <span
                                    className="text-sm leading-relaxed [&_b]:font-bold [&_b]:text-(--link-accent) [&_strong]:font-bold [&_strong]:text-(--link-accent)"
                                    dangerouslySetInnerHTML={{ __html: condition }}
                                />
                            </label>
                        </li>
                    ))}
                </ul>

                {/* 警告：只要有一个条件未勾选就显示，全部勾选后消失 */}
                {!allChecked && (
                    <div className="mt-2 text-xs text-amber-600">⚠ 请先勾选所有条件后再填写申请表单</div>
                )}
            </section>

            {/* 全部勾选后，自动在下方弹出友链申请块 */}
            {allChecked && (
                <div className="pt-5 m-0">
                    <LinkApplyForm />
                </div>
            )}
        </>
    );
}
