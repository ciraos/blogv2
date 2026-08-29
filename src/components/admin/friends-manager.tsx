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
        <>
            <FriendsFilters value={filters} onChange={setFilters} />
            <FriendsTable filters={filters} />
        </>
    );
}
