import type { Metadata } from "next";

import { generateBlogMetadata } from "@/lib/seo";
import { getCommentsWithChildrenApi } from "@/lib/api";
import { PostComments } from "@/components/(blog)/post-comments";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("我的装备");
}

/** 我的装备页：评论区挂在本页路径 /equipment（后端字面匹配） */
export default async function Equipment() {
    const targetPath = "/equipment";
    const comments = await getCommentsWithChildrenApi(targetPath);

    return (
        <div className="w-full">
            <h1 className="text-2xl font-bold tracking-tight">我的装备</h1>
            <PostComments targetPath={targetPath} comments={comments} />
        </div>
    )
}
