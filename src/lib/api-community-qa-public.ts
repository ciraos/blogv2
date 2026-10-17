// 社区问答（PRO 模块）的**前台**浏览器端 API 客户端。
//
// 为什么另开一个文件而不是复用 src/lib/api-community-qa.ts：
//   那个文件是**后台**用的（走 /api/admin/community-qa/*，未登录直接 401），
//   前台要的是公开基址 + 可选登录（列表/详情看得到游客内容，mine 与写作才需要登录），
//   两者的代理前缀、错误口径、可见字段都不同；混在一起会让「谁能看什么」变得难判断。
//
// 远端路径与参数名的权威证据（无一条是猜的）：
//   ① 线上前台 https://blog.ciraos.top/questions 实际加载的 chunk
//      /_next/static/chunks/0e2bxbx8-99ke.js 模块 343577（communityQAApi）+ 模块 538679（页面组件）。
//      压缩后原文（逐字）：
//        let t = "/api/pro/community-qa";
//        config:  ()            => GET  `${t}/config`
//        list:    (params)      => GET  `${t}/questions`            params 原样透传
//        detail:  (id, page=1)  => GET  `${t}/questions/{id}`       params { page }
//        create:  (body)        => POST `${t}/questions`
//        answer:  (id, content) => POST `${t}/questions/{id}/answers`  body { content }
//        vote:    (e, s, n)     => PUT  `${t}/{e}/{s}/vote`            body { liked }
//        accept:  (e, s)        => PUT  `${t}/questions/{e}/accept`    body { answer_id }
//      页面组件里列表参数对象逐字为 { page: 1, mine: false, keyword: "", tag: "" }，
//      即「我的提问」= mine=true、搜索 = keyword、标签筛选 = tag；
//      提问 body 为 { title, content, tags: 输入.split(/[,，]/).map(trim).filter(Boolean) }；
//      状态文案表 qaStatus = { PENDING: "待审核", APPROVED: "已公开", REJECTED: "未通过审核" }。
//   ② 只读实测（GET，2026-10-11；下面的字段名都是响应里逐字抄的，不是猜的）：
//      列表命中一条真实数据后拿到的条目字段：
//        { id, title, tags[], status, author_id, is_author, vote_count, liked, created_at }
//        ★ 列表条目**没有** content、**没有** answer_count、**没有** accepted_answer_id
//          → 所以列表里不显示描述摘要与回答数（官方前台同样没显示）。
//      详情（GET /pro/community-qa/questions/{id}?page=1）实测响应：
//        { answers: [], page: 1, page_size: 20, question: {...同上列表条目字段...}, total: 0 }
//        ★ 回答分页字段（page / page_size / total）与 answers 同级，question 单独一层；
//        ★ question 带 content（列表不带）；liked = 当前访问者是否已点赞；
//          is_author = 当前访问者是不是提问者（决定能否采纳回答）。
//   ③ 只读实测（GET，2026-10 早先）：
//      GET /api/pro/community-qa/config     → 200 {"code":200,"data":{"enabled":true},"message":"操作成功"}
//      GET /api/pro/community-qa/questions  → 200 {"code":200,"data":{"list":[],"page":1,"page_size":20,"total":0},...}
//      （page=abc → 400，说明 page 是整数）
//
// 浏览器不直连后端（后端不开放 CORS），统一请求本站同源代理 /api/public/community-qa/*。
// 请求与列表摊平统一复用 src/lib/api.ts 导出的 request / unwrapList（不再各写一份副本）。

import { request, unwrapList as flattenList } from "@/lib/api";

/**
 * 本模块自己的错误类型：只在「响应结构对不上」这类本模块特有的判断里抛出
 * （请求层失败抛的是 api.ts 的 ApiError，字段同为 message / status / code）；
 * 页面用它做 `instanceof` 判断并把 message 直接展示给用户。
 */
export class CommunityQaPublicError extends Error {
    status: number;
    code: number;

    constructor(message: string, status: number, code: number) {
        super(message);
        this.name = "CommunityQaPublicError";
        this.status = status;
        this.code = code;
    }
}

/** 审核状态（线上 chunk 里 qaStatus 的三个键） */
export type CommunityQaStatus = "PENDING" | "APPROVED" | "REJECTED";

/** 点赞对象类型 = 远端路径段 */
export type CommunityQaVoteType = "questions" | "answers";

/**
 * 问题条目字段以**后端返回为准**，全部来自只读实测的真实响应：
 *   id / title / tags / status / author_id / is_author / vote_count / liked / created_at
 * （线上 chunk 的列表 JSX 还读过 accepted_answer_id 与 moderation_reason，但实测响应里没有，
 *   所以它们只是候选字段：有就渲染，没有就不显示。）
 * content / answer_count 同理是候选字段 —— **实测列表不返回 content 与 answer_count**，
 * 因此列表页不会显示描述摘要与回答数，绝不写死一个 0 来"凑齐"版式。
 * 索引签名保证未知字段原样保留，渲染层不做假设，也绝不编造默认值。
 */
export interface CommunityQaQuestionItem {
    id?: string | number;
    title?: string;
    content?: string;
    status?: string;
    tags?: string[];
    /** 提问者的对外 id（实测字段，短字符串，如 "FniL"） */
    author_id?: string;
    /** 当前访问者是不是提问者（实测字段，决定能否采纳回答） */
    is_author?: boolean;
    vote_count?: number;
    /** 当前访问者是否已点赞（实测字段；点赞接口 body 就是 { liked }，据此做点赞/取消点赞） */
    liked?: boolean;
    answer_count?: number;
    accepted_answer_id?: string | number | null;
    moderation_reason?: string;
    created_at?: string;
    [key: string]: unknown;
}

/** 回答条目：实测样本里回答列表为空，字段名未取到确证样本 —— 按与问题同源的候选字段容错读取 */
export interface CommunityQaAnswerItem {
    id?: string | number;
    answer_id?: string | number;
    question_id?: string | number;
    content?: string;
    status?: string;
    author_id?: string;
    is_author?: boolean;
    vote_count?: number;
    liked?: boolean;
    created_at?: string;
    [key: string]: unknown;
}

/** 列表结果（字段名来自公开列表实测 200 响应：{ list, page, page_size, total }） */
export interface CommunityQaListData<T> {
    list: T[];
    page: number;
    /** 后端返回的每页条数；响应里没有时为 undefined（调用方据此决定是否显示页码） */
    page_size?: number;
    total: number;
}

/** 开关（公开接口实测 { enabled: true }） */
export interface CommunityQaConfig {
    enabled: boolean;
}

/** 详情页里已归一化的回答条目（只保留渲染真正需要的字段） */
export interface CommunityQaAnswerEntry {
    id: string;
    content: string;
    status?: string;
    created_at?: string;
    vote_count?: number;
    /** 当前访问者是否已点赞该回答（后端返回了 liked 才有值） */
    liked?: boolean;
    /** 是否为被采纳的回答（由问题的 accepted_answer_id 与回答 id 比对得出） */
    accepted: boolean;
}

/** 问题详情（已归一化） */
export interface CommunityQaQuestionDetail {
    id: string;
    title: string;
    content: string;
    status?: string;
    tags: string[];
    author_id?: string;
    /** 当前访问者是不是提问者（实测字段；决定「采纳」按钮是否出现） */
    is_author: boolean;
    vote_count?: number;
    /** 当前访问者是否已点赞（实测字段） */
    liked: boolean;
    created_at?: string;
    accepted_answer_id: string | null;
    moderation_reason?: string;
    answers: CommunityQaAnswerEntry[];
    /** 回答总数（实测：与 answers 同级） */
    answersTotal?: number;
    /** 回答每页条数（实测：与 answers 同级） */
    answersPageSize?: number;
    /**
     * 是否为「结构未识别」：
     * 真实响应形状已取证（见文件头 ②），这里保留容错 —— 若后端改版导致
     * 连问题标题/正文都读不出来，页面会如实提示，而不是假装「暂无内容」。
     */
    shapeUnrecognized: boolean;
}

/** 发起提问的入参（tags 由调用方切好，最多 5 个） */
export interface CommunityQaCreatePayload {
    title: string;
    content: string;
    tags: string[];
}

/** 状态文案（与线上 chunk 的 qaStatus 逐字一致） */
export const COMMUNITY_QA_STATUS_LABEL: Record<string, string> = {
    PENDING: "待审核",
    APPROVED: "已公开",
    REJECTED: "未通过审核",
};

/** 标签输入的分隔规则（官方为 /[,，]/：英文逗号与中文逗号都算分隔符） */
export const COMMUNITY_QA_TAG_SEPARATOR = /[,，]/;

/** 标签个数上限（页面文案「最多5个标签」） */
export const COMMUNITY_QA_MAX_TAGS = 5;

/** 分页 + 筛选 → 查询串（undefined / 空串一律不拼，与官方 apiClient 的行为一致） */
function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === "" || value === false) continue;
        qs.set(key, String(value));
    }
    const query = qs.toString();
    return query ? `?${query}` : "";
}

/**
 * 把「可能被包了一层」的列表结果摊平成 CommunityQaListData。
 * 「摊平」这一步统一走 api.ts 的 unwrapList，这里只补本模块关心的 page / page_size
 * （后端给了有效正数才透传，读不到就分别落到 1 / undefined）。
 */
function unwrapList<T>(raw: unknown): CommunityQaListData<T> {
    const { list, total } = flattenList<T>(raw);

    const box = (Array.isArray(raw) ? {} : (raw ?? {})) as Record<string, unknown>;
    const inner = (box.data ?? box) as Record<string, unknown>;
    const pageSize = Number(inner.page_size);
    const page = Number(inner.page);
    return {
        list,
        page: Number.isFinite(page) && page > 0 ? page : 1,
        total,
        page_size: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : undefined,
    };
}

/* =============================================================================
 * 归一化工具（详情用；只读已知候选键，读不到就留空，不编造）
 * ========================================================================== */

function asRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function readText(value: unknown): string | undefined {
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed ? trimmed : undefined;
    }
    return undefined;
}

function readId(value: unknown): string | undefined {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return undefined;
}

function readNumber(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    // 后端有的字段是字符串数字（如 "3"），能安全转就转
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
    return undefined;
}

function readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

/** 布尔字段（liked / is_author 这类实测字段）：不是布尔就当没有，绝不 truthy 强转 */
function readBoolean(value: unknown): boolean | undefined {
    return typeof value === "boolean" ? value : undefined;
}

/** 从候选键里取第一个能转成字符串数组的（tags / tag_list） */
function pickTags(source: Record<string, unknown>): string[] {
    const direct = readStringArray(source.tags);
    if (direct.length) return direct;
    return readStringArray(source.tag_list);
}

/**
 * 回答数组的候选容器：answers / answer_list / list / items。
 * 实测形状里分页字段（page / page_size / total）与 answers **同级**，
 * 所以裸数组分支也从 source 读分页字段（这一点是照着真实响应写的，不是猜的）。
 */
function pickAnswerBox(source: Record<string, unknown>): { list: unknown[]; total?: number; pageSize?: number } | null {
    for (const key of ["answers", "answer_list", "list", "items"]) {
        const value = source[key];
        if (Array.isArray(value)) {
            return {
                list: value,
                total: readNumber(source.total),
                pageSize: readNumber(source.page_size),
            };
        }
        const box = asRecord(value);
        if (box) {
            const inner = Array.isArray(box.list)
                ? (box.list as unknown[])
                : Array.isArray(box.items)
                  ? (box.items as unknown[])
                  : Array.isArray(box.answers)
                    ? (box.answers as unknown[])
                    : null;
            if (inner) {
                return {
                    list: inner,
                    total: readNumber(box.total) ?? readNumber(source.total),
                    pageSize: readNumber(box.page_size) ?? readNumber(source.page_size),
                };
            }
        }
    }
    return null;
}

/**
 * 把详情接口的响应归一化成渲染层要的形状。
 * 实测形状（2026-10-11 只读 GET /pro/community-qa/questions/{id}）：
 *   { answers: [], page: 1, page_size: 20, question: {...问题字段...}, total: 0 }
 * 仍然保留容错：结构对不上时置 shapeUnrecognized 让页面如实说明，
 * 因为「接口结构变了」和「这条问题确实没有回答」是两件事，不能混为一谈。
 */
export function normalizeCommunityQaDetail(raw: unknown): CommunityQaQuestionDetail {
    const box = asRecord(raw) ?? {};
    // 问题本体在 question 里（实测）；detail / 同层是兼容分支
    const question = asRecord(box.question) ?? asRecord(box.detail) ?? box;

    const id = readId(question.id) ?? readId(question.question_id) ?? "";
    const title = readText(question.title) ?? "";
    const content = readText(question.content) ?? readText(question.description) ?? "";
    const acceptedAnswerId = readId(question.accepted_answer_id) ?? null;

    const answerBox = pickAnswerBox(box) ?? pickAnswerBox(question);
    const answers: CommunityQaAnswerEntry[] = (answerBox?.list ?? [])
        .map((item): CommunityQaAnswerEntry | null => {
            const record = asRecord(item);
            if (!record) return null;
            const answerId = readId(record.id) ?? readId(record.answer_id);
            const answerContent = readText(record.content) ?? "";
            if (!answerId && !answerContent) return null;
            return {
                id: answerId ?? "",
                content: answerContent,
                status: readText(record.status),
                created_at: readText(record.created_at),
                vote_count: readNumber(record.vote_count),
                liked: readBoolean(record.liked),
                accepted: Boolean(acceptedAnswerId) && answerId !== undefined && answerId === acceptedAnswerId,
            };
        })
        .filter((item): item is CommunityQaAnswerEntry => item !== null);

    // 问题本体的关键字段（标题或正文）一个都读不到 → 结构没对上
    const shapeUnrecognized = !title && !content && !id;

    const answerCount = readNumber(question.answer_count);

    return {
        id,
        title,
        content,
        status: readText(question.status),
        tags: pickTags(question),
        author_id: readText(question.author_id),
        is_author: readBoolean(question.is_author) ?? false,
        vote_count: readNumber(question.vote_count),
        liked: readBoolean(question.liked) ?? false,
        created_at: readText(question.created_at),
        accepted_answer_id: acceptedAnswerId,
        moderation_reason: readText(question.moderation_reason),
        answers,
        answersTotal: answerBox?.total ?? answerCount,
        answersPageSize: answerBox?.pageSize,
        // 响应里声称有回答，却一个回答容器都没识别出来 → 同样按「结构未识别」处理（不谎报「暂无回答」）
        shapeUnrecognized: shapeUnrecognized || (answerBox === null && (answerCount ?? 0) > 0),
    };
}

/* =============================================================================
 * 对外方法（每个方法都对应一条已在上方列明出处的远端接口）
 * ========================================================================== */

/** GET /pro/community-qa/config —— 开关当前值 */
export async function getCommunityQaConfigPublicApi(): Promise<CommunityQaConfig> {
    const raw = await request<Record<string, unknown>>("/api/public/community-qa/config", { method: "GET" });
    const value = raw?.enabled ?? raw?.enable;
    if (typeof value !== "boolean") {
        throw new CommunityQaPublicError("配置响应里没有 enabled 字段，无法确认开关状态", 200, 200);
    }
    return { enabled: value };
}

/**
 * GET /pro/community-qa/questions —— 问题列表（公开；mine=true 时需登录）
 * 参数名逐字对齐官方：page / mine / keyword / tag
 */
export function listCommunityQaQuestionsPublicApi(params: {
    page?: number;
    mine?: boolean;
    keyword?: string;
    tag?: string;
}): Promise<CommunityQaListData<CommunityQaQuestionItem>> {
    const query = buildQuery({
        page: params.page ?? 1,
        mine: params.mine,
        keyword: params.keyword?.trim(),
        tag: params.tag?.trim(),
    });
    return request<unknown>(`/api/public/community-qa/questions${query}`, { method: "GET" }).then((raw) =>
        unwrapList<CommunityQaQuestionItem>(raw)
    );
}

/**
 * GET /pro/community-qa/questions/{id} —— 问题详情（回答分页）
 * 远端响应结构未取证，故返回归一化结果（含 structureUnknown 标记）。
 */
export function getCommunityQaQuestionDetailPublicApi(
    id: string,
    page = 1
): Promise<CommunityQaQuestionDetail> {
    const query = buildQuery({ page });
    return request<unknown>(
        `/api/public/community-qa/questions/${encodeURIComponent(id)}${query}`,
        { method: "GET" }
    ).then((raw) => normalizeCommunityQaDetail(raw));
}

/**
 * POST /pro/community-qa/questions —— 发起提问（需登录）
 * tags 在这里按官方规则切分并限制个数；返回体里能取到 id 时供页面跳转到详情。
 */
export async function createCommunityQaQuestionPublicApi(
    payload: CommunityQaCreatePayload
): Promise<{ id: string | null }> {
    const raw = await request<unknown>("/api/public/community-qa/questions", {
        method: "POST",
        body: JSON.stringify({
            title: payload.title.trim(),
            content: payload.content.trim(),
            tags: payload.tags.slice(0, COMMUNITY_QA_MAX_TAGS),
        }),
    });
    const box = asRecord(raw) ?? {};
    const question = asRecord(box.question) ?? box;
    return { id: readId(question.id) ?? readId(box.id) ?? null };
}

/** POST /pro/community-qa/questions/{id}/answers —— 回答（需登录） */
export async function answerCommunityQaQuestionPublicApi(id: string, content: string): Promise<void> {
    await request<unknown>(`/api/public/community-qa/questions/${encodeURIComponent(id)}/answers`, {
        method: "POST",
        body: JSON.stringify({ content: content.trim() }),
    });
}

/**
 * PUT /pro/community-qa/{type}/{id}/vote —— 点赞 / 取消点赞（需登录）body { liked }
 * liked 的语义由实测字段支撑：列表与详情里的条目都返回 `liked`（当前访问者是否已点赞）与 `vote_count`，
 * 所以「已赞 → 发 liked=false 取消，未赞 → 发 liked=true 点赞」是有据可依的，不是猜的。
 */
export async function voteCommunityQaContentPublicApi(
    type: CommunityQaVoteType,
    id: string,
    liked: boolean
): Promise<void> {
    await request<unknown>(`/api/public/community-qa/${type}/${encodeURIComponent(id)}/vote`, {
        method: "PUT",
        body: JSON.stringify({ liked }),
    });
}

/** PUT /pro/community-qa/questions/{id}/accept —— 采纳回答（需登录）body { answer_id } */
export async function acceptCommunityQaAnswerPublicApi(questionId: string, answerId: string): Promise<void> {
    await request<unknown>(`/api/public/community-qa/questions/${encodeURIComponent(questionId)}/accept`, {
        method: "PUT",
        body: JSON.stringify({ answer_id: answerId }),
    });
}
