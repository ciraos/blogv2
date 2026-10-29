import { NextResponse } from "next/server";

import { API_URL } from "@/lib/api";

/**
 * 音乐播放列表代理：GET /api/public/music/playlist → 远端 /public/music/playlist。
 *
 * 用途：文章里的 `{music id=…}{/music}` 短代码由前台运行时补成播放器卡片，
 * 需要按 neteaseId 查歌名/歌手/封面（后端不开 CORS，浏览器只能走这条同源路由）。
 * 注意 API_URL 已含 /api 前缀，这里不能再拼 /api。
 */
export async function GET() {
    let res: Response;
    try {
        res = await fetch(`${API_URL}/public/music/playlist`, { cache: "no-store" });
    } catch {
        return NextResponse.json({ code: 502, message: "无法连接后端服务", data: null }, { status: 502 });
    }

    const json = await res.json().catch(() => null);
    if (!res.ok) {
        return NextResponse.json(
            { code: json?.code ?? res.status, message: json?.message || `请求失败（HTTP ${res.status}）`, data: null },
            { status: res.status }
        );
    }
    return NextResponse.json({ code: 200, message: json?.message || "ok", data: json?.data ?? null });
}
