import type { Metadata } from "next";

import { generateBlogMetadata } from "@/lib/seo";
import { StoragePolicyEditPage } from "@/components/admin/storage-policy-edit";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("编辑存储策略");
}

/**
 * /admin/storage/[id] 存储策略编辑页。
 * 与列表页共用同一套后台外壳（.admin-page / .admin-card / .admin-scroll），
 * 表单与字段分组见 src/components/admin/storage-policy-edit.tsx。
 *
 * 注意：Next 16 的动态段 params 是 Promise，必须 await（见 node_modules/next/dist/docs 的 dynamic-routes.md）。
 */
export default async function StoragePolicyEdit({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <StoragePolicyEditPage policyId={id} />;
}
