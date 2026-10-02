import type { Metadata } from "next";

import { UserManagement } from "@/components/admin/user-management";
import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("用户管理");
}

export default function Users() {
    return (
        <div className="admin-page">
            <div className="admin-page-head">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight">用户管理</h2>
                    {/* 原页面说明为空，保持为空（只统一了字号与配色） */}
                    <p className="mt-1 text-xs text-muted-foreground"></p>
                </div>
            </div>
            <UserManagement />
        </div>
    );
}
