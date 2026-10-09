import { NextRequest, NextResponse } from "next/server";

import { adminProxyFetch } from "@/lib/admin-api";
// eslint 排序无关紧要；这一行只是 import，真正的字段校验在 lib 里
import { isValidPolicyId, sanitizePolicyInput, toRemotePolicyBody } from "@/lib/api-storage-policies-write";

// 单个存储策略：GET 详情 / PUT 更新 / DELETE 删除，代理到远端社区版 /api/policies/{id}。
//
// 远端契约（社区版 router.go:536-538）：
//   GET    /api/policies/{id}   → { code, message, data: StoragePolicyResponse }（handler.go:143-166）
//   PUT    /api/policies/{id}   → 需登录；body = UpdatePolicyRequest（handler.go:261-327）
//   DELETE /api/policies/{id}   → { code, message, data: null }（handler.go:234-246）
//
// ⚠️ 写操作本轮**只实现不实测**（删除 / 改存储策略会影响上传落盘与已有文件寻址）。
// 代理层只做形状校验（非法 body 本地 400），业务约束交给远端：
//   - 后端禁止删除 id=1、flag 非空（内置默认策略）、virtual_path 为 "/" 的策略
//     （volume/storage_policy_service.go:617-630）；前端也据此禁用删除按钮。
//   - 后端 PUT 是整体覆盖，且 name/type 为 required（handler.go:26-42），
//     所以前端提交的是完整策略对象（见 lib/api-storage-policies-write.ts 注释 3）。

type Params = Promise<{ id: string }>;

/** GET /api/admin/storage-policies/[id] —— 读取单个策略（编辑页用） */
export async function GET(_request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    if (!isValidPolicyId(id)) {
        return NextResponse.json({ code: 400, message: "策略 ID 不合法", data: null }, { status: 400 });
    }
    return adminProxyFetch(`/policies/${encodeURIComponent(id)}`, { method: "GET" });
}

/** PUT /api/admin/storage-policies/[id] —— 整体更新策略（编辑保存 / 设为默认都走它） */
export async function PUT(request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    if (!isValidPolicyId(id)) {
        return NextResponse.json({ code: 400, message: "策略 ID 不合法", data: null }, { status: 400 });
    }

    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        return NextResponse.json({ code: 400, message: "请求体不是合法 JSON", data: null }, { status: 400 });
    }

    const checked = sanitizePolicyInput(raw);
    if (!checked.ok) {
        return NextResponse.json({ code: 400, message: checked.error, data: null }, { status: 400 });
    }

    return adminProxyFetch(`/policies/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(toRemotePolicyBody(checked.value)),
    });
}

/** DELETE /api/admin/storage-policies/[id] —— 删除策略（远端做内置策略保护） */
export async function DELETE(_request: NextRequest, { params }: { params: Params }) {
    const { id } = await params;
    if (!isValidPolicyId(id)) {
        return NextResponse.json({ code: 400, message: "策略 ID 不合法", data: null }, { status: 400 });
    }
    return adminProxyFetch(`/policies/${encodeURIComponent(id)}`, { method: "DELETE" });
}
