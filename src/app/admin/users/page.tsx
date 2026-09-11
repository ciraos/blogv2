import type { Metadata } from "next";

import { UserManagement } from "@/components/admin/user-management";
import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("用户管理");
}

export default function Users() {
    return (
        <div className="space-y-4">
            <div className="space-y-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">用户管理</h2>
                    <p className="text-slate-400 text-xs"></p>
                </div>
            </div>
            <UserManagement />
        </div>
    );
}
