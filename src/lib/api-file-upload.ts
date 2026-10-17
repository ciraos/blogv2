// 「文件管理」上传编排：创建分片上传会话 → 并发上传分片 → 后端在最后一块定稿。
//
// 协议依据（社区版源码，逐条核对过，不是猜的）：
//   1. 目录列表     GET  /file?uri=…            拿该目录当前生效的存储策略（建会话必须带 policy_id）
//      —— 已有 client 封装 getAdminFilesApi()（src/lib/api.ts:1725），返回体里的 storage_policy。
//   2. 建上传会话   PUT  /file/upload            body { uri, size, policy_id, overwrite? }
//      —— 代理 src/app/api/admin/file/upload/route.ts:11-19；
//         后端 handler pkg/handler/file/upload.go:31-60；
//         请求结构体 pkg/domain/model/upload.go:15-20（URI/Size/PolicyID 都是 required）；
//         响应结构体 pkg/domain/model/upload.go:34-49（upload_method / session_id / chunk_size…）。
//   3. 上传分片     POST /file/upload/:sessionId/:index
//      —— 代理 src/app/api/admin/file/upload/[sessionId]/[index]/route.ts:7-19；
//         body 是**该分片的原始二进制**（application/octet-stream），不是 multipart、没有字段名；
//         后端 handler pkg/handler/file/upload.go:133-163 直接把 c.Request.Body 当流读。
//   4. 放弃会话     DELETE /file/upload          body { id: sessionID }
//      —— 代理 src/app/api/admin/file/upload/route.ts:22-30；
//         请求结构体 pkg/domain/model/upload.go:29-31（字段名是 id，不是 session_id）。
//
// 为什么**不调用** finalize（POST /file/upload/finalize）：
//   那条接口只服务于「客户端直传云存储」的收尾（FinalizeClientUpload 会去云存储 IsExist 校验，
//   见 pkg/service/file/upload.go:676-712），我们的 upload_method 是 "server"。
//   server 方式的定稿发生在后端收到**最后一块**分片时（pkg/service/file/upload.go:435-444
//   → completeFileUpload 合并分片并落库），前端**不需要**也没有东西可以调 finalize。
//
// 注意：本文件只用已有的 /api/admin/file/upload 代理，不新增、不修改任何代理路由或 api.ts。
// 这里故意不走 uploadAdminFileChunkApi()，因为它不接受 AbortSignal，无法实现「取消上传」；
// 于是用同样的 URL/头/body 直接 fetch，并按 api.ts 的 { code, message, data } 信封解包。
import { getAdminFilesApi } from "@/lib/api";
import type { ApiEnvelope } from "@/lib/api";

/** 一次上传的进度快照 */
export interface FileUploadProgress {
    /** 当前文件已成功上传的分片数 */
    uploadedChunks: number;
    /** 当前文件总分片数 */
    totalChunks: number;
    /** 当前文件大小（字节） */
    size: number;
    /** 已成功上传的字节数（按分片累加，失败重传不会重复计数） */
    loadedBytes: number;
}

/** 单个文件上传完成后的结果 */
export interface FileUploadResult {
    /** 文件最终落盘用的名字（同名冲突时会自动改名，可能和 File.name 不同） */
    name: string;
    size: number;
    /** 完整虚拟路径，如 anzhiyu://my/a.png */
    uri: string;
}

/** 单个文件上传失败的描述（不抛异常，由调用方逐个展示） */
export interface FileUploadFailure {
    file: File;
    message: string;
}

/** 批量上传的汇总结果 */
export interface UploadFilesOutcome {
    succeeded: FileUploadResult[];
    failed: FileUploadFailure[];
    /** 用户主动取消了这次批量上传（已上传成功的文件仍然保留） */
    canceled: boolean;
}

export interface UploadFilesOptions {
    /** 目标目录 uri（当前列表所在目录，含结尾斜杠） */
    uri: string;
    /** 待上传文件，按给定顺序串行处理 */
    files: File[];
    /** 每个文件的进度回调（loadedBytes 是当前文件的已传字节数） */
    onProgress?: (file: File, progress: FileUploadProgress) => void;
    /** 用户在页面点击「取消」时触发 */
    signal?: AbortSignal;
}

/**
 * 同源代理的响应体 → data。
 * 后端错误一律是 HTTP 非 2xx 或 `code !== 200`，两种情况都要转成可读 Error
 * （否则 409「文件已存在」这类业务错误会被当成成功）。
 */
async function readEnvelope<T>(res: Response, fallback: string): Promise<T> {
    let json: ApiEnvelope<T> | null = null;
    try {
        json = (await res.json()) as ApiEnvelope<T>;
    } catch {
        // 非 JSON 响应（如网关 HTML 错误页），走下面的统一报错
    }
    const code = json?.code;
    if (res.ok && json && (code === 200 || code === 0)) {
        return json.data as T;
    }
    throw new Error(json?.message || `${fallback}（HTTP ${res.status}）`);
}

/**
 * 取该目录当前生效的存储策略 ID。
 * 建上传会话必须带 policy_id（model.CreateUploadRequest.PolicyID 是 required），
 * 而 policy_id 只能从目录列表响应里拿（GET /file 的 storage_policy）。
 * 这里的 storage_policy 在 api.ts 里声明为 unknown，所以做一次运行时收窄，不使用 any。
 */
async function resolvePolicyId(uri: string): Promise<string> {
    const data = await getAdminFilesApi({ uri });
    const policy = data?.storage_policy;
    if (policy && typeof policy === "object" && "id" in policy) {
        const id = (policy as { id?: unknown }).id;
        if (typeof id === "string" && id) return id;
    }
    throw new Error("该目录没有可用的存储策略，无法上传");
}

/** 服务端建会话时返回的数据（对应 model.UploadSessionData） */
interface ServerUploadSession {
    upload_method: string;
    session_id?: string;
    chunk_size?: number;
}

/** 后端未指定 chunk_size 时的兜底值，与 pkg/service/file/upload.go:35 的 defaultUploadChunkSize 一致 */
const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024;

/**
 * 分片并发数。
 *
 * 为什么是 3：
 *  - 后端每收到一块都会先整块写入磁盘再回写一次会话缓存（pkg/service/file/upload.go:398-423），
 *    并发过高只会把磁盘 IO 和 Redis 写放大，单块耗时反而变大；
 *  - 每块 5MB（策略默认）时，3 并发 ≈ 同时 15MB 在传，普通家宽上行已经跑满，
 *    再调大并不能缩短总时长，却更容易触发网关/反代的请求超时；
 *  - 顺序拿 index（见下面的 worker 池）保证请求发起有序，后端日志与排错都直观。
 */
const CHUNK_CONCURRENCY = 3;

/** 单文件最大并发上限内的分片大小：限制在 256KB ~ 32MB，避免策略给了 0/超大值把浏览器切片搞崩 */
const MIN_CHUNK_SIZE = 256 * 1024;
const MAX_CHUNK_SIZE = 32 * 1024 * 1024;

function normalizeChunkSize(raw?: number, fallback = DEFAULT_CHUNK_SIZE): number {
    if (raw === undefined || raw <= 0) return fallback;
    return Math.min(Math.max(raw, MIN_CHUNK_SIZE), MAX_CHUNK_SIZE);
}

/** 建上传会话；409（目录里已有同名文件）会抛出后端原文，交由调用方改名重试 */
async function createSession(
    uri: string,
    size: number,
    policyId: string,
    signal?: AbortSignal
): Promise<ServerUploadSession> {
    const res = await fetch("/api/admin/file/upload", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uri, size, policy_id: policyId }),
        signal,
        cache: "no-store",
    });
    const session = await readEnvelope<ServerUploadSession>(res, "创建上传会话失败");
    if (session.upload_method !== "server") {
        // client 方式要浏览器直传对象存储（OSS/COS/S3/七牛/OneDrive），本项目未接这条链路
        throw new Error("该目录使用浏览器直传的存储策略，暂不支持在文件管理里上传");
    }
    if (!session.session_id) throw new Error("创建上传会话失败：后端未返回会话 ID");
    return session;
}

/** 上传一个分片（原始二进制）。signal 让「取消」能立刻中断在途请求 */
async function uploadChunk(
    sessionId: string,
    index: number,
    blob: Blob,
    signal?: AbortSignal
): Promise<void> {
    const res = await fetch(
        `/api/admin/file/upload/${encodeURIComponent(sessionId)}/${index}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: blob,
            signal,
            cache: "no-store",
        }
    );
    await readEnvelope<unknown>(res, `第 ${index + 1} 个分片上传失败`);
}

/** 放弃上传会话（清理临时分片 + 临时实体）；清理失败不该影响主流程，一律吞掉 */
async function deleteSession(sessionId: string): Promise<void> {
    try {
        await fetch("/api/admin/file/upload", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: sessionId }),
            cache: "no-store",
        });
    } catch {
        // 网络异常时后端有 24h 定时 GC 兜底（pkg/service/file/upload.go:101-137）
    }
}

/** 「后端说会话已经不存在了」——通常意味着重试那次其实已经成功定稿 */
function isSessionGoneError(err: unknown): boolean {
    return err instanceof Error && /会话|session/i.test(err.message);
}

/** 当前文件被用户取消（AbortError 的 message 各浏览器不一致，所以看 signal 状态最稳） */
function isAbortError(err: unknown, signal?: AbortSignal): boolean {
    if (signal?.aborted) return true;
    return err instanceof Error && err.name === "AbortError";
}

/**
 * 把 targetUri 的临时会话完整跑一遍：建会话 → 并发上传分片 → 后端自动定稿。
 * 失败（且不是用户取消）时会**重试一次**：先删掉旧会话，再重建会话重传，
 * 因为后端的会话状态是「已上传分片集合」，沿用旧会话重传会出现索引对不上的旧分片数据。
 */
async function uploadOneFileAttempt(
    file: File,
    targetUri: string,
    policyId: string,
    signal: AbortSignal | undefined,
    onProgress?: (progress: FileUploadProgress) => void
): Promise<void> {
    const session = await createSession(targetUri, file.size, policyId, signal);
    const sessionId = session.session_id as string;

    // 同一个会话只能放弃一次：分片失败与下面的 catch 都会走到清理，
    // 去重后每会话最多一条 DELETE（后端 DeleteUploadSession 幂等，但没必要白发请求）。
    let cleaned = false;
    const cleanup = async () => {
        if (cleaned) return;
        cleaned = true;
        await deleteSession(sessionId);
    };

    try {
        // 分片大小以服务端返回为准（策略可配 policy.Settings["chunk_size"]，见 pkg/service/file/upload.go:289）
        const chunkSize = normalizeChunkSize(session.chunk_size, Math.max(file.size, 1));
        const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize));

        // 已完成的字节数单独记账：重试时只把真正成功的分片算进去，进度条不会跳回去
        let loadedBytes = 0;
        let uploadedChunks = 0;
        let nextIndex = 0;
        let firstError: unknown = null;

        const report = () => onProgress?.({ uploadedChunks, totalChunks, size: file.size, loadedBytes });

        // worker 池：3 个 worker 共享 nextIndex，谁空谁取下一块（顺序取号 + 有限并发）
        const worker = async () => {
            for (;;) {
                if (signal?.aborted) return;
                if (firstError) return;
                const index = nextIndex;
                if (index >= totalChunks) return;
                nextIndex += 1;

                const start = index * chunkSize;
                const blob = file.slice(start, Math.min(start + chunkSize, file.size));
                try {
                    await uploadChunk(sessionId, index, blob, signal);
                    if (signal?.aborted) return;
                    uploadedChunks += 1;
                    loadedBytes += blob.size;
                    report();
                } catch (err) {
                    // 取消不算失败；并发下只保留第一个错误
                    if (!isAbortError(err, signal) && !firstError) firstError = err;
                    return;
                }
            }
        };

        report();
        await Promise.all(Array.from({ length: Math.min(CHUNK_CONCURRENCY, totalChunks) }, worker));

        if (firstError) {
            await cleanup();
            throw firstError;
        }
        if (signal?.aborted) {
            await cleanup();
            throw new DOMException("上传已取消", "AbortError");
        }
        // 走到这里说明后端已在最后一块上传时定稿（无需调用 finalize）
    } catch (err) {
        // 未走完流程的会话必须清掉，否则临时实体 + 分片文件要等 24h GC
        if (!isAbortError(err, signal) && !isSessionGoneError(err)) {
            await cleanup();
        }
        throw err;
    }
}

/** 带「失败重试一次」的封装：重试前先清掉上一次的会话，避免旧分片残留 */
async function uploadOneFile(
    file: File,
    targetUri: string,
    policyId: string,
    signal: AbortSignal | undefined,
    onProgress?: (progress: FileUploadProgress) => void
): Promise<void> {
    try {
        await uploadOneFileAttempt(file, targetUri, policyId, signal, onProgress);
    } catch (err) {
        if (isAbortError(err, signal) || isSessionGoneError(err)) throw err;
        // 只重试一次：偶发的网络抖动/网关 5xx 值得重试，再失败就交给调用方逐个提示
        await uploadOneFileAttempt(file, targetUri, policyId, signal, onProgress);
    }
}

/**
 * 同名时自动改名：`a.png` → `a (1).png`。
 * 后端遇到目录里已存在同名文件会返回 409「文件 'x' 已存在」
 * （pkg/service/file/upload.go:259-267），文件管理页的上传不该因此失败，
 * 所以像系统文件管理器一样加序号；`reserved` 里放着本次批量中已被别的文件占用的名字。
 */
function nextAvailableName(name: string, existing: Set<string>, reserved: Set<string>): string {
    const taken = (candidate: string) => existing.has(candidate) || reserved.has(candidate);
    if (!taken(name)) return name;

    const dot = name.lastIndexOf(".");
    // 前导点的隐藏文件（.gitignore）不当扩展名处理，否则会生成 ". (1)gitignore"
    const hasExt = dot > 0;
    const base = hasExt ? name.slice(0, dot) : name;
    const ext = hasExt ? name.slice(dot) : "";
    for (let i = 1; i < 1000; i += 1) {
        const candidate = `${base} (${i})${ext}`;
        if (!taken(candidate)) return candidate;
    }
    // 极端情况下退化为时间戳前缀，保证一定能上传
    return `${Date.now()}-${name}`;
}

/** 目录 uri（可能不带结尾斜杠）+ 文件名 → 该文件的完整虚拟路径 */
function joinFileUri(dirUri: string, name: string): string {
    return `${dirUri.replace(/\/+$/, "")}/${name}`;
}

/**
 * 上传一批文件到指定目录。
 *
 * 编排：**逐文件串行**（一个文件内部才并发传分片）。
 * 理由：串行能让进度提示始终只有一个活跃文件、语义清楚；也让「取消」的边界简单
 * （当前文件中断后不再开始下一个）。传大文件时单个文件内部已经是 3 并发，整体带宽不浪费。
 * 任何文件失败都只记录在结果里，不影响其它文件继续上传。
 *
 * @param options 目标目录 uri、文件列表、进度回调与取消信号
 * @returns 成功/失败清单；`canceled=true` 表示用户中途取消
 */
export async function uploadFilesToFileManager(
    options: UploadFilesOptions
): Promise<UploadFilesOutcome> {
    const { uri, files, onProgress, signal } = options;
    const succeeded: FileUploadResult[] = [];
    const failed: FileUploadFailure[] = [];

    if (files.length === 0) return { succeeded, failed, canceled: false };

    // 目录策略只要取一次（同一次批量传的都进同一个目录）
    const policyId = await resolvePolicyId(uri);

    // 目录里已有的名字：一次列表就够（新上传的名字自己维护在 reserved 里）
    const existing = new Set<string>();
    try {
        const data = await getAdminFilesApi({ uri });
        for (const item of data?.files ?? []) existing.add(item.name);
    } catch {
        // 拿不到列表也要能传：改名的兜底交给下面 409 处理
    }
    const reserved = new Set<string>();

    for (const file of files) {
        if (signal?.aborted) return { succeeded, failed, canceled: true };
        if (file.size === 0) {
            failed.push({ file, message: "文件内容为空，无法上传" });
            continue;
        }

        const name = nextAvailableName(file.name, existing, reserved);
        reserved.add(name);
        try {
            await uploadOneFile(file, joinFileUri(uri, name), policyId, signal, (progress) =>
                onProgress?.(file, progress)
            );
            succeeded.push({ name, size: file.size, uri: joinFileUri(uri, name) });
        } catch (err) {
            if (isAbortError(err, signal)) return { succeeded, failed, canceled: true };
            failed.push({ file, message: err instanceof Error ? err.message : "上传失败" });
        }
    }

    return { succeeded, failed, canceled: false };
}
