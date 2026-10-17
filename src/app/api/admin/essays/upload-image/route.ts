import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { cookies } from "next/headers"

import { API_URL } from "@/lib/api"
import { ACCESS_TOKEN_KEY } from "@/lib/auth";

// 后台「说说」图片上传：本应用同源路由，服务端转发 multipart 到远端说说上传接口（需登录 + 管理员）。
//
// 远端路径（实测依据，2026-02 直连 https://blog.ciraos.top/api）：
//   POST /pro/essays/upload-image        → 401「请求未携带Token」（存在且需鉴权）★ 主路径
//   POST /pro/admin/essays/upload-image  → 404 page not found（没有 POST 处理器，GET 才有 401）
//   POST /pro/admin/essays/upload        → 404
// 官方前端代码（blog.anheyu.com 说说对话框 chunk 反混淆）也是 `post("/api/pro/essays/upload-image")`，
// 即说说上传注册在非 admin 前缀下，所以这里的远端路径与文章上传（/articles/upload）不同。
// 兜底：仅当主路径返回 404 时，再试一次 /pro/admin/essays/upload-image（以防后端版本差异）。
//
// 目录：接口自带目录，前端不传任何目录参数——官方前端那段代码的 FormData 只有 file 一个字段
// （没有 path / folder / directory / prefix / dir，反混淆文件里 "essay_image" 零命中），
// 图片由后端落到 essay_image 目录。
//
// 说明：body 为 FormData，不能走 adminProxyFetch（那里会补 JSON Content-Type，破坏 multipart boundary），
// 这里直接透传（与 /api/admin/articles/upload 同款写法）。
const REMOTE_PRIMARY = "/pro/essays/upload-image"
const REMOTE_FALLBACK = "/pro/admin/essays/upload-image"

export async function POST(request: NextRequest) {
    let formData: FormData
    try {
        formData = await request.formData()
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误（需 multipart/form-data）", data: null }, { status: 400 })
    }

    const file = formData.get("file")
    if (!file) {
        return NextResponse.json({ code: 400, message: "缺少 file 字段", data: null }, { status: 400 })
    }

    const token = (await cookies()).get(ACCESS_TOKEN_KEY)?.value
    if (!token) {
        return NextResponse.json({ code: 401, message: "未登录", data: null }, { status: 401 })
    }

    /** 透传一次 multipart（fetch 自动带 boundary，不手动设 Content-Type） */
    const forward = async (path: string): Promise<Response | null> => {
        try {
            return await fetch(`${API_URL}${path}`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
                cache: "no-store",
            })
        } catch {
            return null
        }
    }

    let res = await forward(REMOTE_PRIMARY)
    if (!res) {
        return NextResponse.json({ code: 502, message: "无法连接后端服务", data: null }, { status: 502 })
    }
    // 主路径不存在（不同后端版本）时才回退，避免掩盖真正的业务错误
    if (res.status === 404) {
        const fallback = await forward(REMOTE_FALLBACK)
        if (fallback) res = fallback
    }

    const json: unknown = await res.json().catch(() => null)

    if (!res.ok || !json) {
        return NextResponse.json(
            {
                code: (json as { code?: number })?.code ?? res.status,
                message: (json as { message?: string })?.message || `图片上传失败（HTTP ${res.status}）`,
                data: null,
            },
            { status: res.status }
        )
    }

    return NextResponse.json(json)
}
