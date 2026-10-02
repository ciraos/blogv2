"use client";

import { useState } from "react";

import { FriendsFilters } from "@/components/admin/friends-filters";
import { FriendsTable, type FriendsFilterState } from "@/components/admin/friends-table";

/** 友链管理页：筛选工具栏 + 表格（筛选状态提升到此处，与表格联动） */
export function FriendsManager() {
    const [filters, setFilters] = useState<FriendsFilterState>({
        keyword: "",
        status: "",
        category: "",
        tag: "",
    });

    return (
        // admin-card：筛选栏固定在顶部、表格区域（admin-scroll）在卡片内部滚动
        <div className="admin-card">
            {/* 筛选工具栏：固定在卡片顶部，不随表格滚动 */}
            <div className="shrink-0 border-b p-3">
                <FriendsFilters value={filters} onChange={setFilters} />
            </div>
            <FriendsTable filters={filters} />
        </div>
    );
}
