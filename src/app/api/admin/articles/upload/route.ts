import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { cookies } from "next/headers"

import { API_URL } from "@/lib/api"
import { ACCESS_TOKEN_KEY } from "@/lib/auth";

// 后台图片上传：本应用同源路由，服务端转发 multipart 到远端 POST /articles/upload（需登录 + 管理员）。
// 后端返回 { code, message, data: { url, file_id } }，url 是本站托管的图片地址
// （可能是绝对地址，前端会转成同源相对路径，见 lib/utils.ts 的 toSameOriginMediaUrl）。
//
// 说明：官方后台的「站点信息 / Logo / 页脚」等所有图片字段都用这一个上传接口（/api/articles/upload），
// 所以这里也放在 /api/admin/articles/upload 下，与远端 /articles/upload 对应。
export async function POST(request: NextRequest) {
    let formData: FormData
    try {
        formData = await request.formData()
    } catch {
        return NextResponse.json({ code: 400, message: "请求体格式错误（需 multipart/form-data）", data: null }, { status: 400 })
    }

    if (!formData.get("file")) {
        return NextResponse.json({ code: 400, message: "缺少 file 字段", data: null }, { status: 400 })
    }

    const token = (await cookies()).get(ACCESS_TOKEN_KEY)?.value
    if (!token) {
        return NextResponse.json({ code: 401, message: "未登录", data: null }, { status: 401 })
    }

    let res: Response
    try {
        // 直接透传 FormData（fetch 自动带 multipart boundary），不手动设 Content-Type
        res = await fetch(`${API_URL}/articles/upload`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
            cache: "no-store",
        })
    } catch {
        return NextResponse.json({ code: 502, message: "无法连接后端服务", data: null }, { status: 502 })
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
