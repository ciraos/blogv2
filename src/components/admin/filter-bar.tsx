"use client";
import type { ReactNode } from "react";
import { RotateCcw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SearchProps {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    ariaLabel?: string;
    /** 回车提交（提交式筛选的页面传，即时生效的页面不用管） */
    onSubmit?: (event?: React.FormEvent) => void;
    /** 覆盖默认宽度（默认 w-full sm:w-56） */
    className?: string;
}

interface AdminFilterBarProps {
    search?: SearchProps;
    /** 传了就是提交式工具条：包成 form、回车提交、右侧多一个「查询」按钮 */
    onSubmit?: (event?: React.FormEvent) => void;
    onReset?: () => void;
    resetDisabled?: boolean;
    /** 筛选结果计数，如「共 128 篇」 */
    summary?: ReactNode;
    /** 右侧操作区（新增 / 刷新 / 导出…） */
    actions?: ReactNode;
    /** 中间的下拉、额外输入框，宽度自己用 w-full sm:w-32 这种写法控制 */
    children?: ReactNode;
    className?: string;
}

/**
 * 后台列表页统一的筛选工具栏。
 *
 * 原来每页自己拼一行：高度有的 h-7 有的 h-8，有的带放大镜有的不带，
 * 「重置」有的做成图标按钮有的做成文字按钮，底色有的 bg-muted/40 有的纯白——
 * 十个列表页十种样子。这里只留一种：一条发丝线分隔、控件全部 32px 高、
 * 搜索框统一带放大镜和清空叉、「重置」统一是安静的文字按钮（没有筛选条件时置灰）。
 * 窄屏搜索占一整行、下拉两两一行，右侧操作区自动换到下一行靠右。
 */
export function AdminFilterBar({
    search,
    onSubmit,
    onReset,
    resetDisabled,
    summary,
    actions,
    children,
    className,
}: AdminFilterBarProps) {
    const rowClass = cn(
        "flex shrink-0 flex-col gap-2 border-b p-3 sm:flex-row sm:flex-wrap sm:items-center",
        className
    );

    const body = (
        <>
            {search && (
                <div className={cn("relative w-full min-w-0 shrink-0 sm:w-56", search.className)}>
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={search.value}
                        onChange={(e) => search.onChange(e.target.value)}
                        onKeyDown={(e) => {
                            const submit = onSubmit ?? search.onSubmit;
                            if (e.key === "Enter" && submit) {
                                e.preventDefault();
                                submit();
                            }
                        }}
                        placeholder={search.placeholder}
                        aria-label={search.ariaLabel ?? search.placeholder}
                        className="h-8 pl-8 pr-8 text-sm"
                    />
                    {search.value && (
                        <button
                            type="button"
                            onClick={() => search.onChange("")}
                            aria-label="清空搜索"
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
            )}

            {/* 下拉在窄屏两两一行（≥sm 用 contents 直接并入外层那一行，不再多包一层） */}
            {children && <div className="grid grid-cols-2 gap-2 sm:contents">{children}</div>}

            {onSubmit && (
                <Button type="submit" size="sm" className="h-8 shrink-0 px-3 text-sm">
                    查询
                </Button>
            )}

            {onReset && (
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onReset}
                    disabled={resetDisabled}
                    title="清除筛选条件"
                    className="h-8 w-max shrink-0 self-start px-2 text-sm font-normal text-muted-foreground hover:text-foreground"
                >
                    <RotateCcw className="size-3.5" />
                    重置
                </Button>
            )}

            {summary && (
                <span className="text-xs text-muted-foreground tabular-nums sm:ml-1">{summary}</span>
            )}

            {actions && (
                <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
                    {actions}
                </div>
            )}
        </>
    );

    if (onSubmit) {
        return (
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    onSubmit(e);
                }}
                className={rowClass}
            >
                {body}
            </form>
        );
    }
    return <div className={rowClass}>{body}</div>;
}

/** 工具栏里的下拉触发器：统一 32px 高，窄屏占半格，≥sm 固定宽度 */
export function filterSelectTrigger(className?: string) {
    return cn("h-8 w-full shrink-0 text-sm sm:w-32", className);
}
