import type { Metadata } from "next";

import { PageWithSidebar } from "@/components/(blog)/page-with-sidebar";
import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("社区问答");
}

/**
 * 社区问答（/questions）。
 *
 * 目前只作为一个占位页面存在：标题固定为「社区问答」，内容留空。
 * 之前那套 PRO 问答模块（列表 / 详情 / 提问 / 审核与同源代理）已整体移除，
 * 等后端重新提供接口时再往这个壳里填内容即可。
 */
export default function QuestionsPage() {
    return <PageWithSidebar>{null}</PageWithSidebar>;
}
