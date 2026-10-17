// 后台「AI 写作」的数据层（PRO 模块，线上已激活）。
//
// 远端真实路由（证据链见交付报告）：
//   1) 官方前端快照 scripts/theme/theme-anheyu-next-main/src/lib/api/ai-writing.ts:3,39 明确写
//      "对接 anheyu-pro 后端 POST /api/pro/admin/ai/writing（SSE 流式输出）"。
//   2) 线上只读探活（未登录 GET）：GET /api/pro/admin/ai/writing/config → **401**
//      （同批 20+ 个其它 AI 候选路径全是 404，含 /api/pro/admin/ai/summary/config、
//       /api/pro/admin/ai/assistant/config、/api/pro/admin/ai/podcast/config）——
//       401 说明「AI 写作」这一组路由确实注册在线上 PRO 后端（v1.8.25），只是要鉴权。
//   3) 后端社区版源码 scripts/anheyu/anheyu-app-main/internal/infra/router/router.go 里
//      完全没有 /ai/ 路由，所以这是闭源 PRO 侧的实现，只能在 PRO 上跑。
//
// 因此本文件把「写作」当完整能力实现；同组的 summary/assistant/podcast 因为没有拿到任何
// 路由证据（全部 404），一律不做伪造调用（详见报告「未实现」一节）。
// 例外：「AI 生成摘要」不新建接口，而是**复用写作通道** —— 把摘要指令塞进 customPrompt
// 发一次写作请求（见文件末尾 buildArticleSummaryParams / generateArticleSummaryApi）。
//
// 本文件只打本站同源代理 /api/admin/ai/*（代理读 httpOnly cookie 带 Bearer 转发，
// 见 src/app/api/admin/ai/**/route.ts），与 src/lib/api-knowledge.ts 同一套写法，
// 留在独立文件里（api.ts 同时被前台和几十个页面依赖，不适合放 PRO 专属能力）。

import type { ApiEnvelope as Envelope } from "@/lib/api";

/** 写作风格（官方 AIWritingRequest.style） */
export type AIWritingStyle = "professional" | "casual" | "academic" | "creative";
/** 目标长度（官方 AIWritingRequest.length） */
export type AIWritingLength = "short" | "medium" | "long";

/** 生成请求体（字段名严格对齐官方 src/lib/api/ai-writing.ts:7-18） */
export interface AIWritingParams {
    /** 写作主题或大纲 */
    topic: string;
    style?: AIWritingStyle;
    length?: AIWritingLength;
    /** 是否使用标签插件 */
    useTags?: boolean;
    /** 自定义提示词 */
    customPrompt?: string;
}

/** 流式回调（官方 AIWritingCallbacks） */
export interface AIWritingCallbacks {
    onChunk: (chunk: string) => void;
    onDone: (fullContent: string) => void;
    onError: (error: AIWritingApiError) => void;
}

/**
 * 写作配置（**实测真实结构**，不是猜的）。
 *
 * 证据：登录态下只读 GET /api/admin/ai/writing/config（同源代理 → 远端
 * GET /api/pro/admin/ai/writing/config）返回：
 *   {"code":200,"data":{"enabled":true,
 *     "lengths":[{"label":"短篇 (~500字)","value":"short"},…],
 *     "styles":[{"description":"适合技术文章","label":"专业技术","value":"professional"},…],
 *     "supported_providers":["glm","openai","claude","qwen","deepseek","doubao"],
 *     "supported_tags":["tip","folding","tabs","gallery","linkcard","btn"]},
 *    "message":"获取AI写作配置成功"}
 *
 * 所以「是否可用」以后端的 enabled 为准 —— 后端**不返回** provider/model/api_key
 * （那些是后台设置项里的值），因此不能拿它们判断。
 */
export interface AIWritingConfigOption {
    label: string;
    value: string;
    description?: string;
}

export interface AIWritingConfig {
    /** 后端是否已启用 AI 写作（true 才允许发起生成） */
    enabled?: boolean;
    /** 后端支持的风格档位（带说明文案） */
    styles?: AIWritingConfigOption[];
    /** 后端支持的长度档位 */
    lengths?: AIWritingConfigOption[];
    /** 后端支持的服务商（glm/openai/…，仅作展示） */
    supported_providers?: string[];
    /** 后端支持的标签插件（tip/folding/tabs/…，对应请求体的 useTags） */
    supported_tags?: string[];
}

/** 同源代理出错时抛出的错误（与 api.ts / api-knowledge.ts 的 ApiError 同名同形） */
export class AIWritingApiError extends Error {
    status: number;
    code: number;

    constructor(message: string, status: number, code: number) {
        super(message);
        this.name = "AIWritingApiError";
        this.status = status;
        this.code = code;
    }
}

/** GET /api/admin/ai/writing/config —— 读写作配置（用于判断「未配置」状态） */
export async function getAIWritingConfigApi(): Promise<AIWritingConfig> {
    let res: Response;
    try {
        res = await fetch("/api/admin/ai/writing/config", { method: "GET", cache: "no-store" });
    } catch {
        throw new AIWritingApiError("网络请求失败，请检查网络连接", 0, 0);
    }

    let json: Envelope<AIWritingConfig> | null = null;
    try {
        json = (await res.json()) as Envelope<AIWritingConfig>;
    } catch {
        // 非 JSON 响应 → 下面按 HTTP 状态报错
    }

    if (res.ok && json && (json.code === 200 || json.code === 0)) {
        return json.data ?? {};
    }
    throw new AIWritingApiError(
        json?.message || `请求失败（HTTP ${res.status}）`,
        res.status,
        json?.code ?? res.status
    );
}

/**
 * 后端是否已经启用 AI 写作。
 * 判据是后端返回的 enabled —— 实测 /ai/writing/config 不回 provider/model（那是后台设置项），
 * 所以只能信这个字段；拿不到配置时（undefined）按「未知」处理，由调用方决定是否仍然放行。
 */
export function isAIWritingConfigured(config: AIWritingConfig): boolean {
    return config.enabled === true;
}

/** SSE data 行的解析结果：text 是抽出来的正文；unrecognized 表示「是 JSON 但没认出正文字段」 */
interface ParsedSSEData {
    text: string;
    unrecognized: boolean;
}

/**
 * 把 SSE 的 data 行解析成文本片段。
 *
 * 官方实现只认 parsed.content || parsed.text || data（认不出来就把整段 JSON 当正文塞进去）。
 * 这里多认几种常见流式封装（OpenAI 风格 choices[0].delta.content、delta、data.content），
 * 但**认不出来时不再回退成原始 JSON**（那会把 {"delta":...} 直接写进文章），
 * 而是标记成 unrecognized 交给调用方计数 —— 至少错误信息里能看出「后端换了流格式」。
 */
function parseSSEData(data: string): ParsedSSEData {
    const trimmed = data.trim();
    if (!trimmed) return { text: "", unrecognized: false };
    if (!trimmed.startsWith("{")) return { text: data, unrecognized: false };

    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed) as unknown;
    } catch {
        // 不是合法 JSON → 当纯文本处理（与官方一致）
        return { text: data, unrecognized: false };
    }
    if (typeof parsed === "string") return { text: parsed, unrecognized: false };
    if (!parsed || typeof parsed !== "object") return { text: "", unrecognized: true };

    const frame = parsed as {
        content?: unknown;
        text?: unknown;
        delta?: unknown;
        message?: unknown;
        data?: unknown;
        choices?: Array<{ delta?: { content?: unknown }; message?: { content?: unknown }; text?: unknown }>;
    };
    const asText = (v: unknown): string => (typeof v === "string" ? v : "");
    const fromDelta = (v: unknown): string => {
        if (typeof v === "string") return v;
        if (v && typeof v === "object") return asText((v as { content?: unknown }).content);
        return "";
    };

    const candidates = [
        asText(frame.content),
        asText(frame.text),
        fromDelta(frame.delta),
        asText(frame.message),
        asText(frame.data),
        asText(frame.choices?.[0]?.delta?.content),
        asText(frame.choices?.[0]?.message?.content),
        asText(frame.choices?.[0]?.text),
    ];
    const text = candidates.find((c) => c.length > 0) ?? "";
    return { text, unrecognized: text.length === 0 };
}

/**
 * 从「非流式」响应里抠出正文：有的部署/网关会把 SSE 攒成一个 JSON 信封再返回。
 * 依次尝试 data.content / data.text / data.result / data，全是空就返回 ""。
 */
function extractInlineContent(json: unknown): string {
    if (typeof json === "string") return json;
    if (!json || typeof json !== "object") return "";
    const envelope = json as { data?: unknown; content?: unknown; text?: unknown; message?: unknown };
    const candidate = envelope.data ?? json;
    if (typeof candidate === "string") return candidate;
    if (candidate && typeof candidate === "object") {
        const inner = candidate as { content?: unknown; text?: unknown; result?: unknown };
        if (typeof inner.content === "string") return inner.content;
        if (typeof inner.text === "string") return inner.text;
        if (typeof inner.result === "string") return inner.result;
    }
    return "";
}

/**
 * 调 AI 写作接口（SSE 流式）。
 *
 * 与官方实现的两点差异（都是有意的）：
 *  1. 官方在每个 chunk 上直接 split("\n") —— 一行被网络切断时 JSON.parse 会失败并退化成
 *     把半截 JSON 当正文吐出来。这里用一个行缓冲把跨 chunk 的半行拼回去。
 *  2. 官方只认 text/event-stream；这里额外兜住「网关攒成 JSON 一次性返回」的情况。
 *
 * @returns AbortController，调用方 abort() 即停止生成
 */
export function streamAIWriting(params: AIWritingParams, callbacks: AIWritingCallbacks): AbortController {
    const controller = new AbortController();

    void (async () => {
        let fullContent = "";
        try {
            const res = await fetch("/api/admin/ai/writing", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(params),
                signal: controller.signal,
                cache: "no-store",
            });

            if (!res.ok) {
                // 代理失败时回的是 JSON 信封，尽量把后端文案透出来（401/403/502 都要能提示）
                let message = `AI 写作请求失败（HTTP ${res.status}）`;
                try {
                    const json = (await res.json()) as { message?: unknown };
                    if (typeof json.message === "string" && json.message) message = json.message;
                } catch {
                    // 忽略：用默认文案
                }
                throw new AIWritingApiError(message, res.status, res.status);
            }

            const contentType = res.headers.get("content-type") ?? "";
            if (!contentType.includes("text/event-stream")) {
                // 非流式兜底：整包 JSON / 纯文本
                const text = await res.text();
                let inline = "";
                try {
                    inline = extractInlineContent(JSON.parse(text) as unknown);
                } catch {
                    inline = text.trim();
                }
                if (!inline) {
                    throw new AIWritingApiError("后端没有返回可用的正文内容", res.status, res.status);
                }
                callbacks.onChunk(inline);
                callbacks.onDone(inline);
                return;
            }

            const reader = res.body?.getReader();
            if (!reader) throw new AIWritingApiError("无法读取响应流", res.status, res.status);

            const decoder = new TextDecoder();
            let buffer = "";
            let finished = false;
            // 认不出来的内容帧计数：流跑完一个字节都没有时，用它把「后端换了流格式」和「后端真没内容」区分开
            let droppedFrames = 0;

            const handleLine = (line: string): boolean => {
                // SSE 只认 "data:" 前缀；event:/id:/retry:/注释行一律跳过
                if (!line.startsWith("data:")) return false;
                const data = line.slice(5).trimStart();
                if (data === "[DONE]") {
                    callbacks.onDone(fullContent);
                    finished = true;
                    return true;
                }
                const parsed = parseSSEData(data);
                if (parsed.text) {
                    fullContent += parsed.text;
                    callbacks.onChunk(parsed.text);
                } else if (parsed.unrecognized) {
                    droppedFrames++;
                }
                return false;
            };

            while (!finished) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                // SSE 事件以空行分隔，行尾可能是 \n 或 \r\n
                const lines = buffer.split("\n");
                // 最后一段可能是半行，留到下一轮
                buffer = lines.pop() ?? "";
                for (const rawLine of lines) {
                    if (handleLine(rawLine.replace(/\r$/, ""))) break;
                }
            }

            // 收尾：把缓冲区里剩下的最后一行也处理掉（流结束但没有换行符的情况）
            if (!finished && buffer) {
                handleLine(buffer.replace(/\r$/, ""));
            }

            if (!finished) {
                // 有的实现不发 [DONE]，直接断流 —— 有内容就算成功
                if (fullContent) {
                    callbacks.onDone(fullContent);
                } else if (droppedFrames > 0) {
                    throw new AIWritingApiError(
                        `收到 ${droppedFrames} 个无法识别的内容帧，后端可能改用了新的流式格式`,
                        res.status,
                        res.status
                    );
                } else {
                    throw new AIWritingApiError("生成结束但没有收到任何内容", res.status, res.status);
                }
            }
        } catch (error) {
            // 用户主动停止：不算错误，也不回调（调用方自己结束了 UI 状态）
            if (error instanceof DOMException && error.name === "AbortError") return;
            if (error instanceof Error && error.name === "AbortError") return;
            callbacks.onError(
                error instanceof AIWritingApiError
                    ? error
                    : new AIWritingApiError(error instanceof Error ? error.message : "生成失败", 0, 0)
            );
        }
    })();

    return controller;
}

// ===================== 文章摘要（复用写作通道，不新建接口） =====================
//
// 线上只有 /pro/admin/ai/writing 一个 AI 通道（summary/assistant/podcast 探测全 404，见文件头证据链），
// 所以「AI 生成摘要」= 一次带 customPrompt 的写作请求：参数构造在下面，SSE 解析/错误处理全部复用
// streamAIWriting（**没有**第二份解析器）。

/**
 * 摘要指令。后端只有一个自定义提示词入口（customPrompt，没有独立的 system 角色），
 * 所以「单段、100-200 字、不带 Markdown」这些约束只能写进提示词里。
 */
export const ARTICLE_SUMMARY_PROMPT =
    "请为下面的文章正文写一段摘要。" +
    "要求：100-200 字、单段连续文本、不要换行、不要任何 Markdown 标记、不要小标题或列表、" +
    "客观中性地概括文章讲了什么；直接输出摘要正文本身，不要前后缀说明，也不要重复标题。";

/**
 * 送去生成摘要的正文上限（字符）。长文整篇塞进请求体既慢又没必要，
 * 超出时只截前 N 字并在提示里注明「已截断」，避免模型把截断处当结尾。
 */
const SUMMARY_CONTENT_LIMIT = 6000;

/** 摘要生成入参 */
export interface AISummaryParams {
    /** 文章标题（当写作主题用，后端 topic 是必填项） */
    title?: string;
    /** 正文 Markdown 原文 */
    content: string;
}

/**
 * 把「标题 + 正文」拼成写作接口的请求体。
 * **导出是为了单测**：参数构造的正确性用本函数直接断言（线上生成是计费写操作，按铁律不实测）。
 *
 * 几个刻意的取舍：
 *  - topic：写作通道的 topic 相当于「写作主题」，空着可能被后端拒；优先用文章标题，
 *    标题为空时退化成正文首行（去掉 # 与图片语法），仍为空才用兜底词。
 *  - customPrompt：摘要指令 + 正文（只能这么拼，原因见 ARTICLE_SUMMARY_PROMPT）。
 *  - length: "short"：写作通道自己的篇幅档，用 short 兜住「摘要别写成长文」。
 *  - useTags: false：摘要里不该出现 tip/folding 这类标签插件。
 *  - 不传 style：避免后端的风格模板和提示词里的「客观中性」互相打架。
 */
export function buildArticleSummaryParams({ title, content }: AISummaryParams): AIWritingParams {
    const body = content.trim();
    const clipped =
        body.length > SUMMARY_CONTENT_LIMIT
            ? `${body.slice(0, SUMMARY_CONTENT_LIMIT)}\n\n（正文过长，以上只是前 ${SUMMARY_CONTENT_LIMIT} 字）`
            : body;
    const topicFromBody = body
        .replace(/^#{1,6}\s*/gm, "")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return {
        topic: (title ?? "").trim() || topicFromBody.slice(0, 50) || "文章摘要",
        length: "short",
        useTags: false,
        customPrompt: `${ARTICLE_SUMMARY_PROMPT}\n\n文章正文：\n${clipped}`,
    };
}

/** 摘要生成回调（与写作通道同形：chunk 是流式片段，done 是拼好的全文） */
export interface AISummaryCallbacks {
    onChunk: (chunk: string) => void;
    onDone: (fullText: string) => void;
    onError: (error: AIWritingApiError) => void;
}

/**
 * 生成文章摘要（SSE 流式）：参数按 buildArticleSummaryParams 拼，其余直接交给 streamAIWriting。
 * @returns AbortController —— 调用方 abort() 即停止；停止不算失败，onError 不会被调用。
 */
export function generateArticleSummaryApi(params: AISummaryParams, callbacks: AISummaryCallbacks): AbortController {
    return streamAIWriting(buildArticleSummaryParams(params), {
        onChunk: callbacks.onChunk,
        onDone: callbacks.onDone,
        onError: callbacks.onError,
    });
}
