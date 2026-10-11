// 社区问答（PRO 模块）的**浏览器端** API 客户端：后台 /admin/community-qa 页面用。
//
// ==== 数据来源（权威证据，全部来自真实接口，没有一条是猜测的路径） ====
//
// 证据 ①（最强）：线上前台 https://blog.ciraos.top/questions **实际加载的 JS chunk**
//   文件名 /_next/static/chunks/0e2bxbx8-99ke.js，其中模块 343577 就是官方 api 模块，
//   压缩后原文可读：
//     let t = "/api/pro/community-qa", s = "/api/pro/admin/community-qa";
//     communityQAApi = {
//       config:            ()           => GET  `${t}/config`,
//       setEnabled:        (enabled)    => PUT  `${s}/config`,                         body { enabled },
//       list:              (params, adm)=> GET  `${adm ? s : t}/questions`,             params 原样透传,
//       detail:            (id, page=1) => GET  `${...}/questions/${id}`,              params { page },
//       create:            (body)       => POST `${t}/questions`,
//       answer:            (id, content)=> POST `${t}/questions/${id}/answers`,        body { content },
//       vote:              (id, x, liked)=>PUT  `${t}/${id}/${x}/vote`,                body { liked },
//       accept:            (id, answerId)=>PUT  `${t}/questions/${id}/accept`,         body { answer_id },
//       moderationAnswers: (status,page=1)=>GET `${s}/answers`,                        params { status, page },
//       moderate:          (type, id, status, reason="")
//                                       => PUT  `${s}/${type}/${id}/moderation`,       body { status, reason },
//     }
//   同 chunk 里还有 qaStatus = { PENDING:"待审核", APPROVED:"已公开", REJECTED:"未通过审核" }。
//
// 证据 ②（只读探活，仅 GET，2026-10）：
//     GET /api/pro/community-qa/config        → 200 {"code":200,"data":{"enabled":true},"message":"操作成功"}
//     GET /api/pro/community-qa/questions     → 200 {"list":[],"page":1,"page_size":20,"total":0}
//     GET /api/pro/admin/community-qa/config    → 401（存在、仅缺鉴权）
//     GET /api/pro/admin/community-qa/questions → 401
//     GET /api/pro/admin/community-qa/answers   → 401
//   公开列表这次的 200 响应同时给出了信封与分页字段名：{ code, message, data:{ list, page, page_size, total } }。
//
// 证据 ③（社区版后端快照 scripts/anheyu/anheyu-app-main）：搜 question / answer / community_qa
//   只有 Markdown 教程里的「question 提示块」等无关命中 ⇒ 社区版**没有**这些路由，属 PRO 闭源侧。
//   官方主题快照 scripts/theme/theme-anheyu-next-main（public main 分支）里也没有 qa/question 文件，
//   说明线上 /questions 来自比公开快照更新的版本。
//
// ==== 为什么另开文件而不动 src/lib/api.ts ====
// 与 src/lib/api-membership.ts 同样的理由：api.ts 里的 request() 没有导出，且本模块全部走
// 「PRO 闭源接口 + 同源代理」；这里自带一份等价 request（错误类型字段与 api.ts 的 ApiError 对齐）。
//
// 浏览器端不直连后端（后端不开放 CORS 且需鉴权），统一请求本站同源代理 /api/admin/community-qa/*，
// 由代理读 httpOnly cookie 里的 token 转发到远端（见 src/app/api/admin/community-qa/）。

/** 与 api.ts / api-membership.ts 同名的错误类型（等价实现，避免跨文件耦合实现细节） */
export class CommunityQaApiError extends Error {
    status: number;
    code: number;

    constructor(message: string, status: number, code: number) {
        super(message);
        this.name = "CommunityQaApiError";
        this.status = status;
        this.code = code;
    }
}

/** 审核状态（qaStatus 的三个键） */
export type CommunityQaStatus = "PENDING" | "APPROVED" | "REJECTED";

/** 内容类型 = 远端路径段（questions / answers） */
export type CommunityQaContentType = "questions" | "answers";

/**
 * 列表条目：**字段名以后端返回为准**。
 * 已确认存在的只有公开问题列表渲染用到的这几个（见前台 chunk 的列表 JSX）：
 *   id / title / status / tags[] / vote_count / accepted_answer_id / moderation_reason
 * 回答条目的字段**没有拿到任何确凿证据**（公开接口的 list 为空、且任务禁止实测写操作），
 * 所以这里只声明「可能存在的候选字段」并把未知字段原样保留，页面渲染时缺字段就不显示，
 * 绝不编造默认值。
 */
export interface CommunityQaQuestionItem {
    id?: string | number;
    title?: string;
    content?: string;
    status?: string;
    tags?: string[];
    vote_count?: number;
    answer_count?: number;
    accepted_answer_id?: string | number | null;
    moderation_reason?: string;
    created_at?: string;
    updated_at?: string;
    /** 其它字段一律原样带过来（渲染层按需只读，不做假设） */
    [key: string]: unknown;
}

/** 回答条目（同问题条目：只声明候选字段 + 原样保留未知字段） */
export interface CommunityQaAnswerItem {
    id?: string | number;
    answer_id?: string | number;
    question_id?: string | number;
    question_title?: string;
    content?: string;
    status?: string;
    moderation_reason?: string;
    created_at?: string;
    [key: string]: unknown;
}

export type CommunityQaRow = CommunityQaQuestionItem | CommunityQaAnswerItem;

/** 列表结果（分页字段名来自公开列表实测 200 响应） */
export interface CommunityQaListData<T> {
    list: T[];
    total: number;
    /** 后端返回的每页条数（公开接口实测 20）；响应里没有时回落到 list.length */
    page_size?: number;
}

/** 开关（公开接口实测 { enabled: true }；旧版站点配置里同义键写作 enable） */
export interface CommunityQaConfig {
    enabled: boolean;
}

/**
 * 发一个请求到本站同源代理，并解包 { code, message, data } 信封。
 * 判定规则与 api.ts / api-membership.ts 一致：HTTP 2xx 且业务 code 为 200 / 0 才算成功。
 */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers);
    if (options.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    let res: Response;
    try {
        res = await fetch(path, { ...options, headers, cache: "no-store" });
    } catch {
        throw new CommunityQaApiError("网络请求失败，请检查网络连接", 0, 0);
    }

    let json: { code?: number; message?: string; data?: T } | null = null;
    try {
        json = (await res.json()) as { code?: number; message?: string; data?: T };
    } catch {
        // 非 JSON 响应（例如网关返回 HTML）
    }

    if (res.ok && json && (json.code === 200 || json.code === 0)) {
        return json.data as T;
    }

    // 代理层自己的错误信封（未登录 401 / 参数校验 400 / 无法连接后端 502）也走这里
    throw new CommunityQaApiError(
        json?.message || `请求失败（HTTP ${res.status}）`,
        res.status,
        json?.code ?? res.status
    );
}

/** 分页 + 可选筛选 → 查询串（undefined / null / 空串一律不拼） */
function buildQuery(params: Record<string, string | number | undefined>): string {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === "") continue;
        qs.set(key, String(value));
    }
    const query = qs.toString();
    return query ? `?${query}` : "";
}

/**
 * 把「可能被包了一层」的列表结果摊平成 { list, total, page_size }。
 * 公开接口实测的形状是 `{ list, page, page_size, total }`（request() 已剥掉 data 外层），
 * 这里额外兼容「data 直接是数组」等在写操作响应上的常见变体。
 */
function unwrapList<T>(raw: unknown): CommunityQaListData<T> {
    if (Array.isArray(raw)) return { list: raw as T[], total: raw.length };

    const box = (raw ?? {}) as Record<string, unknown>;
    const inner = (box.data ?? box) as Record<string, unknown>;
    if (Array.isArray(inner)) return { list: inner as T[], total: inner.length };

    const list = Array.isArray(inner.list) ? (inner.list as T[]) : [];
    const total = Number(inner.total);
    const pageSize = Number(inner.page_size);
    return {
        list,
        total: Number.isFinite(total) ? total : list.length,
        page_size: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : undefined,
    };
}

/* =============================================================================
 * 对外方法（每个方法都对应一条已在上面列明出处的远端接口）
 * ========================================================================== */

/** GET /pro/(admin/)community-qa/config —— 开关当前值 */
export async function getCommunityQaConfigApi(): Promise<CommunityQaConfig> {
    const raw = await request<Record<string, unknown>>("/api/admin/community-qa/config", { method: "GET" });
    const value = raw?.enabled ?? raw?.enable;
    if (typeof value !== "boolean") {
        // 读到结构对不上的响应时如实报错，不猜一个真假值
        throw new CommunityQaApiError("配置响应里没有 enabled 字段，无法确认开关状态", 200, 200);
    }
    return { enabled: value };
}

/** PUT /pro/admin/community-qa/config —— 关闭 / 开启社区问答（body { enabled }） */
export async function setCommunityQaEnabledApi(enabled: boolean): Promise<void> {
    await request<unknown>("/api/admin/community-qa/config", {
        method: "PUT",
        body: JSON.stringify({ enabled }),
    });
}

/**
 * GET /pro/admin/community-qa/questions —— 问题列表（管理端）
 * status 省略 = 全部状态
 */
export function listCommunityQaQuestionsApi(params: {
    page?: number;
    status?: CommunityQaStatus;
}): Promise<CommunityQaListData<CommunityQaQuestionItem>> {
    const query = buildQuery({ page: params.page, status: params.status });
    return request<unknown>(`/api/admin/community-qa/questions${query}`, { method: "GET" }).then((raw) =>
        unwrapList<CommunityQaQuestionItem>(raw)
    );
}

/**
 * GET /pro/admin/community-qa/answers —— 回答列表（管理端）
 * 参数名与官方一致：{ status, page }
 */
export function listCommunityQaAnswersApi(params: {
    page?: number;
    status?: CommunityQaStatus;
}): Promise<CommunityQaListData<CommunityQaAnswerItem>> {
    const query = buildQuery({ page: params.page, status: params.status });
    return request<unknown>(`/api/admin/community-qa/answers${query}`, { method: "GET" }).then((raw) =>
        unwrapList<CommunityQaAnswerItem>(raw)
    );
}

/**
 * PUT /pro/admin/community-qa/{type}/{id}/moderation —— 审核（通过 / 驳回 / 打回待审）
 * type = questions | answers，body { status, reason }
 */
export async function moderateCommunityQaApi(payload: {
    type: CommunityQaContentType;
    id: string;
    status: CommunityQaStatus;
    /** 审核意见；官方默认空串 */
    reason?: string;
}): Promise<void> {
    await request<unknown>(
        `/api/admin/community-qa/${payload.type}/${encodeURIComponent(payload.id)}/moderation`,
        {
            method: "PUT",
            body: JSON.stringify({ status: payload.status, reason: payload.reason ?? "" }),
        }
    );
}

/**
 * POST /pro/community-qa/questions/{id}/answers —— 以当前登录账号回答问题。
 * ⚠️ 这是**公开**接口（远端没有管理员专用回复接口），发布后按后端审核策略处理。
 */
export async function answerCommunityQaQuestionApi(id: string, content: string): Promise<void> {
    await request<unknown>(`/api/admin/community-qa/questions/${encodeURIComponent(id)}/answers`, {
        method: "POST",
        body: JSON.stringify({ content }),
    });
}

/* =============================================================================
 * 渲染层要用的枚举文案（与同 chunk 的 qaStatus 逐字对齐）
 * ========================================================================== */

export const COMMUNITY_QA_STATUS_LABEL: Record<string, string> = {
    PENDING: "待审核",
    APPROVED: "已公开",
    REJECTED: "未通过审核",
};
