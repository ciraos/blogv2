"use client";

import { useState } from "react";

export interface ChangelogTab {
    id: string;
    /** 标签文字，如「后端 anheyu-app」 */
    label: string;
    /** 标签右侧的小字（条数），可省略 */
    count?: number;
    /** 面板内容（服务端渲染好的节点，原样传进来） */
    content: React.ReactNode;
}

/**
 * 更新日志的两个 tab（后端 / 前端）。
 *
 * 只负责「切换」这一件事：面板内容是服务端组件渲染好的节点，直接作为 children 传进来，
 * 这样前端时间线不必整棵树搬到客户端（只有当前面板会展示，另一面板也已经在 HTML 里，
 * 不额外发请求）。
 */
export function ChangelogTabs({ tabs }: { tabs: ChangelogTab[] }) {
    const [active, setActive] = useState(tabs[0]?.id ?? "");
    const activeTab = tabs.find((tab) => tab.id === active) ?? tabs[0];

    return (
        <div className="space-y-4">
            <div role="tablist" aria-label="更新日志来源" className="flex flex-wrap items-center gap-2">
                {tabs.map((tab) => {
                    const selected = tab.id === activeTab?.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={selected}
                            aria-controls={`panel-${tab.id}`}
                            id={`tab-${tab.id}`}
                            onClick={() => setActive(tab.id)}
                            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${selected
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                                }`}
                        >
                            {tab.label}
                            {typeof tab.count === "number" && (
                                <span
                                    className={`rounded-full px-1.5 text-[11px] tabular-nums ${selected ? "bg-primary-foreground/20" : "bg-background/70"}`}
                                >
                                    {tab.count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {tabs.map((tab) => (
                <div
                    key={tab.id}
                    role="tabpanel"
                    id={`panel-${tab.id}`}
                    aria-labelledby={`tab-${tab.id}`}
                    hidden={tab.id !== activeTab?.id}
                >
                    {tab.content}
                </div>
            ))}
        </div>
    );
}
