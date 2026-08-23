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
            <section className="rounded-xl bg-card p-5 shadow-sm">
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
                                    className={`flex size-5 shrink-0 items-center justify-center rounded-md transition-colors ${checked[index]
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "border-border bg-background"
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
                                {/* 条件文案来自后端，可能含 <b> 等标签 */}
                                <span
                                    className="text-sm leading-relaxed [&_b]:font-semibold [&_b]:text-primary"
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
