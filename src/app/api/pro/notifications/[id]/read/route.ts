import { authedProxyFetch } from "@/lib/admin-api";

type Params = Promise<{ id: string }>;

// 消息通知 · 标记单条已读：POST /api/pro/notifications/[id]/read → 远端 /pro/notifications/{id}/read
export async function POST(_request: Request, { params }: { params: Params }) {
    const { id } = await params;
    return authedProxyFetch(`/pro/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
}
