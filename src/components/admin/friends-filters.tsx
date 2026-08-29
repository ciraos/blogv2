"use client";
import { RefreshCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type { FriendsFilterState } from "@/components/admin/friends-table";

/** 友链管理筛选工具栏：搜索框 + 状态/分类/标签下拉 + 重置按钮（受控组件） */
export function FriendsFilters({
    value,
    onChange,
}: {
    value: FriendsFilterState;
    onChange: (v: FriendsFilterState) => void;
}) {
    // 重置按钮：仅当三个下拉任一有值时可用（搜索框不计入）
    const hasFilter = value.status !== "" || value.category !== "" || value.tag !== "";

    const reset = () => {
        onChange({ keyword: "", status: "", category: "", tag: "" });
    };

    return (
        <div className="flex flex-wrap items-center justify-between gap-0">
            <div className="flex items-center gap-1">
                {/* 搜索框：网站名称 / 网址 */}
                <div className="min-w-60 relative flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={value.keyword}
                        onChange={(e) => onChange({ ...value, keyword: e.target.value })}
                        placeholder="搜索网站名称 / 网址"
                        className="h-8 pl-8"
                    />
                </div>

                {/* 友链状态 */}
                <Select value={value.status} onValueChange={(v) => onChange({ ...value, status: v })}>
                    <SelectTrigger className="h-8 w-30">
                        <SelectValue placeholder="友链状态" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="approved">已通过</SelectItem>
                        <SelectItem value="pending">待审核</SelectItem>
                        <SelectItem value="rejected">已拒绝</SelectItem>
                        <SelectItem value="expired">已失效</SelectItem>
                    </SelectContent>
                </Select>

                {/* 分类 */}
                <Select value={value.category} onValueChange={(v) => onChange({ ...value, category: v })}>
                    <SelectTrigger className="h-8 w-26">
                        <SelectValue placeholder="分类" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="小伙伴">小伙伴</SelectItem>
                        <SelectItem value="大佬们">大佬们</SelectItem>
                        <SelectItem value="已失联">已失联</SelectItem>
                        <SelectItem value="冰糖红茶">冰糖红茶</SelectItem>
                    </SelectContent>
                </Select>

                {/* 标签 */}
                <Select value={value.tag} onValueChange={(v) => onChange({ ...value, tag: v })}>
                    <SelectTrigger className="h-8 w-26">
                        <SelectValue placeholder="标签" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="证书过期">证书过期</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* 重置：仅三个下拉有值时可用 */}
            <Button
                variant="outline"
                size="icon"
                onClick={reset}
                disabled={!hasFilter}
                title="重置筛选"
                aria-label="重置筛选"
                className="w-max py-1 px-2 bg-slate-200"
            >
                <RefreshCcw className="size-4" />
                重置状态
            </Button>
        </div>
    );
}
