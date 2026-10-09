// ===================== 存储策略「写」接口客户端 =====================
// 为什么单独开一份自带 fetch 助手的模块（而不是塞进 src/lib/api.ts）：
//   api.ts 里的 request<T>() 是内部函数且未导出，本轮约定不动 api.ts，
//   所以这里复制一份等价的同源 fetch 助手（同为 /api/ 开头的同源路由，自动带 cookie）。
//
// 远端契约来源（社区版后端 = 本项目线上实际跑的那份，路径与 PRO 版前缀不同）：
//   - scripts/anheyu/anheyu-app-main/internal/infra/router/router.go:526-540
//       policies.Group("/policies")  →  GET ""、POST ""、GET /connect/onedrive/:id、
//       POST /authorize/onedrive、GET|PUT /:id/image-styles、GET /:id、PUT /:id、DELETE /:id
//   - scripts/anheyu/anheyu-app-main/pkg/handler/storage_policy/handler.go:26-48（请求体字段）、
//       :79-129 Create、:143-166 Get、:224-246 Delete、:261-327 Update、:329-390 OneDrive 两个 handler
//   - scripts/anheyu/anheyu-app-main/pkg/domain/model/storage_policy.go:64-102（模型 / 响应 DTO）
//
// ⚠️ 与旧 swagger / 旧注释不同之处（本轮已核实）：
//   1. 线上真实路径是 /api/policies（社区版），不是 /api/storage-policies；PRO 版是 /api/pro/policies。
//      官方前端 scripts/theme/theme-anheyu-next-main/src/lib/api/storage-policy.ts:16 用的是 PRO 前缀，
//      但只有 OneDrive 两个接口（同文件 L48、L54）用的是社区版的 /api/policies/**。
//      本项目列表读取（src/app/api/admin/storage-policies/route.ts:6-8）实测已确定为社区版 /policies，
//      故本轮**全部统一到社区版 /api/policies**，与已跑通的读路径一致。
//   2. 后端没有 is_default 字段（model/storage_policy.go:65-83 与 ent/schema 全库检索无 is_default）。
//      「默认策略」= Settings 之外的 Flag 字段，取值 article_image / comment_image / user_avatar
//      （pkg/constant/storage_policy.go:48-53）；服务端保证同一个 Flag 全局唯一
//      （volume/storage_policy_service.go:442-456 会把旧的持有者 ClearFlag）。
//      所以「设为默认」= PUT /policies/:id 并把 flag 改成目标用途。
//   3. 后端 Update 是**整体覆盖**（service:408-592），且 UpdatePolicyRequest 里 name/type
//      带 binding:"required"（handler.go:26-42）。因此更新时前端必须提交完整字段，
//      否则会被 400。这里的 updateAdminStoragePolicyApi 就是按「完整提交」设计的。
//   4. 列表 / 详情响应里的 access_key、secret_key 是掩码 "********"
//      （handler.go:413-414、constant/storage_policy.go:24）。后端 Update 会调用
//      preserveMaskedStoragePolicySecrets（service:594-604）把空值或掩码还原成原值，
//      所以「用户没改密钥」时提交空串是安全的、也是唯一正确的选择。

/**
 * 本模块自己的错误类型：字段与 src/lib/api.ts 的 ApiError 保持一致
 * （message / status / code），但**不 import api.ts** ——
 * 一是本轮约定不动 api.ts，二是让本模块（及其纯函数）可以被单独加载 / 单测。
 */
export class StoragePolicyApiError extends Error {
    readonly status: number;
    readonly code: number;

    constructor(message: string, status: number, code: number) {
        super(message);
        this.name = "StoragePolicyApiError";
        this.status = status;
        this.code = code;
    }
}

/** 存储类型（与后端 constant.StoragePolicyType 一致；官方前端未含 upyun，本项目类型里列了但表单不渲染） */
export const STORAGE_POLICY_TYPES = [
    "local",
    "onedrive",
    "tencent_cos",
    "aliyun_oss",
    "aws_s3",
    "qiniu_kodo",
    "upyun",
] as const;

export type StoragePolicyTypeValue = (typeof STORAGE_POLICY_TYPES)[number];

/** 策略用途标志（= 后端的「默认策略」） */
export const POLICY_FLAG_VALUES = ["article_image", "comment_image", "user_avatar"] as const;
export type StoragePolicyFlagValue = (typeof POLICY_FLAG_VALUES)[number];

/** 敏感字段被后端掩码替换后的固定占位符（constant.SecretValueMask） */
export const SECRET_MASK = "********";

/** settings 里本轮会用到 / 会回传的键（官方前端 types/storage-policy.ts:37-51） */
export interface StoragePolicySettings {
    chunk_size?: number;
    drive_type?: string;
    drive_id?: string;
    upload_method?: string;
    cdn_domain?: string;
    source_auth?: boolean;
    custom_proxy?: boolean;
    style_separator?: string;
    force_path_style?: boolean;
    endpoint_url?: string;
    /** 后端可能写入的其他键（image_process / image_styles / allowed_extensions 等），原样带回 */
    [key: string]: unknown;
}

/**
 * 单个存储策略（= 后端 StoragePolicyResponse，model/storage_policy.go:86-102）。
 * id 是**公共 ID 字符串**（idgen 编码过，不是自增数字），列表与详情都用它。
 */
export interface AdminStoragePolicy {
    id: string;
    created_at?: string;
    updated_at?: string;
    name: string;
    type: StoragePolicyTypeValue | string;
    server?: string;
    bucket_name?: string;
    is_private?: boolean;
    /** 后端返回的是掩码 "********"（已配置）或空串（未配置） */
    access_key?: string;
    secret_key?: string;
    max_size?: number;
    base_path?: string;
    virtual_path?: string;
    flag?: string;
    settings?: StoragePolicySettings;
}

/** GET /policies 的 data 形状（handler.go:50-54 PolicyListResponse） */
export interface AdminStoragePolicyListData {
    list: AdminStoragePolicy[];
    total: number;
}

/**
 * 提交给后端的策略请求体（社区版 CreatePolicyRequest / UpdatePolicyRequest，handler.go:26-42）。
 * 注意：这是**整体覆盖**语义的请求体，字段名与后端 json tag 一一对应。
 */
export interface StoragePolicyWritePayload {
    name: string;
    type: string;
    flag: string;
    server: string;
    bucket_name: string;
    is_private: boolean;
    access_key: string;
    secret_key: string;
    max_size: number;
    base_path: string;
    virtual_path: string;
    settings: Record<string, unknown>;
}

/** OneDrive 授权链接响应：{ data: { url } }（handler.go:356） */
export interface OneDriveAuthUrlData {
    url: string;
}

/** POST /policies/authorize/onedrive 的请求体（handler.go:359-363 AuthorizeRequest） */
export interface OneDriveAuthorizePayload {
    code: string;
    state: string;
}

// ===================================
//          同源请求助手
// ===================================

interface ApiEnvelope<T> {
    code: number;
    message: string;
    data: T;
}

/**
 * 请求本站同源代理路由（/api/admin/storage-policies/**）。
 * 与 src/lib/api.ts 的 request<T>() 同语义：HTTP 2xx 且业务 code 为 200/0 才算成功，
 * 失败抛 ApiError（携带 HTTP 状态与业务 code，调用方可直接取 message 展示）。
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
        throw new StoragePolicyApiError("网络请求失败，请检查网络连接", 0, 0);
    }

    let json: ApiEnvelope<T> | null = null;
    try {
        json = (await res.json()) as ApiEnvelope<T>;
    } catch {
        // 非 JSON 响应（例如网关直接返回 HTML）
    }

    if (res.ok && json && (json.code === 200 || json.code === 0)) {
        return json.data;
    }

    throw new StoragePolicyApiError(
        json?.message || `请求失败（HTTP ${res.status}）`,
        res.status,
        json?.code ?? res.status
    );
}

// ===================================
//          代理层参数校验
// ===================================

/** 代理层校验通过后的「已净化」结果；只含后端认识的字段，杜绝把任意 JSON 直接透传 */
export interface SanitizedPolicyInput {
    name: string;
    type: string;
    flag?: string;
    server?: string;
    bucket_name?: string;
    is_private?: boolean;
    access_key?: string;
    secret_key?: string;
    max_size?: number;
    base_path?: string;
    virtual_path?: string;
    settings?: Record<string, unknown>;
}

/** 代理层校验结果：ok=true 时携带净化后的对象，ok=false 时携带给用户看的中文原因 */
export type SanitizeResult =
    | { ok: true; value: SanitizedPolicyInput }
    | { ok: false; error: string };

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);

/** 取可选字符串字段：缺省 → undefined；给了但不是字符串 → 报错 */
function optionalString(raw: Record<string, unknown>, key: string): string | undefined | null {
    const v = raw[key];
    if (v === undefined || v === null) return undefined;
    if (typeof v !== "string") return null;
    return v;
}

/** 取可选布尔字段：缺省 → undefined；给了但不是布尔 → 报错 */
function optionalBoolean(raw: Record<string, unknown>, key: string): boolean | undefined | null {
    const v = raw[key];
    if (v === undefined || v === null) return undefined;
    if (typeof v !== "boolean") return null;
    return v;
}

/** 取可选数字字段：缺省 / 空串 → undefined；给了但不是有限数 → 报错 */
function optionalNumber(raw: Record<string, unknown>, key: string): number | undefined | null {
    const v = raw[key];
    if (v === undefined || v === null || v === "") return undefined;
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    return v;
}

/**
 * 校验并净化请求体（创建 / 更新共用；更新时也要求 name + type，
 * 因为后端 UpdatePolicyRequest 的 name/type 是 binding:"required"，漏了会 400）。
 *
 * settings 只允许「字符串 / 数字 / 布尔 / 字符串数组」这类原始值，
 * 避免把任意深层 JSON 塞进后端 settings（会被原样写库并参与策略校验）。
 */
export function sanitizePolicyInput(body: unknown): SanitizeResult {
    if (!isPlainObject(body)) return { ok: false, error: "请求体必须是 JSON 对象" };

    const name = optionalString(body, "name");
    if (name === null) return { ok: false, error: "name 必须是字符串" };
    if (!name || !name.trim()) return { ok: false, error: "策略名称（name）不能为空" };

    const type = optionalString(body, "type");
    if (type === null) return { ok: false, error: "type 必须是字符串" };
    if (!type || !(STORAGE_POLICY_TYPES as readonly string[]).includes(type)) {
        return { ok: false, error: `type 不合法，仅支持：${STORAGE_POLICY_TYPES.join(" / ")}` };
    }

    const flag = optionalString(body, "flag");
    if (flag === null) return { ok: false, error: "flag 必须是字符串" };
    if (flag && !(POLICY_FLAG_VALUES as readonly string[]).includes(flag)) {
        return { ok: false, error: `flag 不合法，仅支持：${POLICY_FLAG_VALUES.join(" / ")}` };
    }

    const server = optionalString(body, "server");
    if (server === null) return { ok: false, error: "server 必须是字符串" };
    const bucketName = optionalString(body, "bucket_name");
    if (bucketName === null) return { ok: false, error: "bucket_name 必须是字符串" };
    const accessKey = optionalString(body, "access_key");
    if (accessKey === null) return { ok: false, error: "access_key 必须是字符串" };
    const secretKey = optionalString(body, "secret_key");
    if (secretKey === null) return { ok: false, error: "secret_key 必须是字符串" };
    const basePath = optionalString(body, "base_path");
    if (basePath === null) return { ok: false, error: "base_path 必须是字符串" };
    const virtualPath = optionalString(body, "virtual_path");
    if (virtualPath === null) return { ok: false, error: "virtual_path 必须是字符串" };

    const isPrivate = optionalBoolean(body, "is_private");
    if (isPrivate === null) return { ok: false, error: "is_private 必须是布尔值" };
    const maxSize = optionalNumber(body, "max_size");
    if (maxSize === null) return { ok: false, error: "max_size 必须是数字（字节）" };
    if (maxSize !== undefined && maxSize < 0) return { ok: false, error: "max_size 不能为负数" };

    let settings: Record<string, unknown> | undefined;
    if (body.settings !== undefined && body.settings !== null) {
        if (!isPlainObject(body.settings)) return { ok: false, error: "settings 必须是 JSON 对象" };
        settings = {};
        for (const [key, value] of Object.entries(body.settings)) {
            const primitive =
                typeof value === "string" || typeof value === "number" || typeof value === "boolean";
            const stringArray = Array.isArray(value) && value.every((it) => typeof it === "string");
            if (!primitive && !stringArray) {
                return { ok: false, error: `settings.${key} 只支持字符串 / 数字 / 布尔 / 字符串数组` };
            }
            settings[key] = value;
        }
    }

    return {
        ok: true,
        value: {
            name,
            type,
            flag,
            server,
            bucket_name: bucketName,
            is_private: isPrivate,
            access_key: accessKey,
            secret_key: secretKey,
            max_size: maxSize,
            base_path: basePath,
            virtual_path: virtualPath,
            settings,
        },
    };
}

/**
 * 校验通过后的对象 → 社区版 CreatePolicyRequest / UpdatePolicyRequest 的请求体形状。
 * 0 值字段照样带上：后端 handler 的 name/type 是 binding:"required"，
 * 其余字段在后端是**整体覆盖**语义，缺字段等于把该字段清空。
 */
export function toRemotePolicyBody(input: SanitizedPolicyInput): Record<string, unknown> {
    return {
        name: input.name,
        type: input.type,
        flag: input.flag ?? "",
        server: input.server ?? "",
        bucket_name: input.bucket_name ?? "",
        is_private: input.is_private ?? false,
        access_key: input.access_key ?? "",
        secret_key: input.secret_key ?? "",
        max_size: input.max_size ?? 0,
        base_path: input.base_path ?? "",
        virtual_path: input.virtual_path ?? "",
        settings: input.settings ?? {},
    };
}

// ===================================
//       表单字段定义（与官方前端逐项对齐）
// ===================================
//
// 字段分组 / 名称 / 占位符来源（官方前端 scripts/theme/theme-anheyu-next-main/src/components/admin/storage/）：
//   - LocalForm.tsx          「路径设置」：virtual_path（应用内挂载路径）、base_path（存储目录）
//   - AliyunOssForm.tsx      「阿里云 OSS 配置」「路径设置」「API 密钥」「访问权限」「下载设置」
//   - TencentCosForm.tsx     「腾讯云 COS 配置」「路径设置」「API 密钥」「访问权限」「下载设置」
//   - AwsS3Form.tsx          「AWS S3 配置」「路径设置」「API 密钥」「访问权限」「下载设置」
//   - QiniuKodoForm.tsx      「七牛云配置」「路径设置」「API 密钥」「访问权限」「下载设置」
//   - OneDriveForm.tsx       「OneDrive 配置」「路径设置」（+ 创建后需 OAuth 授权的提示）
//   - app/admin/storage/[id]/page.tsx:210-339  基本信息 / 动态子表单 / 「存储与上传」
//     （「存储与上传」里的 max_size 与 settings.chunk_size 两个数值字段在编辑页单独渲染）
//
// 与官方的差异（刻意为之，已在交付报告里声明）：
//   1. 官方表单只有 Input/Switch，没有 Textarea；本项目也没有 Textarea 组件（不新增依赖），
//      所以「又拍云」这类后端支持但官方前端没有表单的类型，用同一套 text 字段近似覆盖。
//   2. 「策略标志」（= 后端 flag / 默认策略）在新建时统一留空，改由列表的「设为默认」按钮设置，
//      避免新建时就把某个内置用途占掉。

/** 字段取值来源：顶层字段、settings 字段 */
export type StorageFieldKind = "text" | "password" | "url" | "select" | "switch";

export interface StorageFieldSpec {
    /** 顶层用后端字段名；settings 里的字段用 settings 的键名 */
    key: string;
    label: string;
    kind: StorageFieldKind;
    /** 该字段实际落在哪个对象上；缺省跟所属分组的 source */
    source?: "top" | "settings";
    /** kind = "select" 时的选项 */
    options?: { value: string; label: string }[];
    placeholder?: string;
    description?: string;
    /** 单列占满（长 URL / 密钥等） */
    wide?: boolean;
}

/** 一个分组（对应官方表单里的一个带下边框的小标题） */
export interface StorageFieldGroup {
    title: string;
    /** 字段落在哪个对象上 */
    source: "top" | "settings";
    fields: StorageFieldSpec[];
}

/** 路径设置分组：所有类型都有（local 的 base_path 由后端按 virtual_path 归一化，见 service:157-175） */
const PATH_GROUP = (basePathLabel: string, basePathPlaceholder: string, basePathDesc: string): StorageFieldGroup => ({
    title: "路径设置",
    source: "top",
    fields: [
        {
            key: "base_path",
            label: basePathLabel,
            kind: "text",
            placeholder: basePathPlaceholder,
            description: basePathDesc,
        },
        {
            key: "virtual_path",
            label: "应用内挂载路径",
            kind: "text",
            placeholder: "/xxx",
            description: "此策略在应用内部的访问路径，需唯一，且只能是一级目录（如 /cos、/onedrive）",
        },
    ],
});

/** 下载设置分组：云存储通用（官方 AliyunOssForm / TencentCosForm / AwsS3Form:105-131） */
const DOWNLOAD_GROUP = (includeSourceAuth: boolean): StorageFieldGroup => ({
    title: "下载设置",
    source: "settings",
    fields: [
        {
            key: "cdn_domain",
            label: "CDN 加速域名（可选）",
            kind: "url",
            placeholder: "https://cdn.example.com",
            description: "填写完整的 CDN 访问地址，用于替换文件 URL 中的主机名",
        },
        ...(includeSourceAuth
            ? [
                  {
                      key: "source_auth",
                      label: "不为 CDN 签名文件 URL",
                      kind: "switch" as const,
                      description: "如果在域名设置中开启了「回源鉴权」，请开启此项",
                  },
              ]
            : []),
        {
            key: "custom_proxy",
            label: "开启下载中转",
            kind: "switch",
            description: "开启后下载文件时会通过服务端代理",
        },
        {
            key: "style_separator",
            label: "样式分隔符（可选）",
            kind: "text",
            placeholder: "/ArticleImage 或 !webp",
            description: "用于云存储图片处理样式后缀",
        },
    ],
});

/** 七大存储类型的字段分组（顺序 = 编辑页渲染顺序） */
export const STORAGE_POLICY_FIELD_GROUPS: Record<string, StorageFieldGroup[]> = {
    local: [PATH_GROUP("存储目录", "data/storage/local", "服务器上的物理存储目录，必须在 data/storage/ 下")],

    aliyun_oss: [
        {
            title: "阿里云 OSS 配置",
            source: "top",
            fields: [
                {
                    key: "bucket_name",
                    label: "存储桶名称",
                    kind: "text",
                    placeholder: "例如 my-bucket",
                    description: "在阿里云 OSS 控制台创建的存储桶名称",
                },
                {
                    key: "server",
                    label: "访问域名",
                    kind: "url",
                    placeholder: "https://bucket.oss-region.aliyuncs.com",
                    description: "OSS 访问域名，包含协议（https://）",
                    wide: true,
                },
            ],
        },
        PATH_GROUP("云端存储根目录", "例如 /images 或留空", "文件在 OSS 存储桶中的根目录，以 / 开头"),
        {
            title: "API 密钥",
            source: "top",
            fields: [
                { key: "access_key", label: "AccessKey ID", kind: "text", wide: true },
                { key: "secret_key", label: "AccessKey Secret", kind: "password", wide: true },
            ],
        },
        {
            title: "访问权限",
            source: "top",
            fields: [
                {
                    key: "is_private",
                    label: "私有读写",
                    kind: "switch",
                    description: "关闭时为公用读私有写，开启后读写都需要授权",
                },
            ],
        },
        DOWNLOAD_GROUP(true),
    ],

    tencent_cos: [
        {
            title: "腾讯云 COS 配置",
            source: "top",
            fields: [
                {
                    key: "bucket_name",
                    label: "存储桶名称",
                    kind: "text",
                    placeholder: "例如 my-bucket-1250000000",
                    description: "在腾讯云 COS 控制台创建的存储桶名称",
                },
                {
                    key: "server",
                    label: "访问域名",
                    kind: "url",
                    placeholder: "https://bucket.cos.ap-region.myqcloud.com",
                    description: "COS 访问域名，包含协议",
                    wide: true,
                },
            ],
        },
        PATH_GROUP("云端存储根目录", "例如 /images 或留空", "文件在 COS 中的根目录，以 / 开头"),
        {
            title: "API 密钥",
            source: "top",
            fields: [
                { key: "access_key", label: "SecretId", kind: "text", wide: true },
                { key: "secret_key", label: "SecretKey", kind: "password", wide: true },
            ],
        },
        {
            title: "访问权限",
            source: "top",
            fields: [
                {
                    key: "is_private",
                    label: "私有读写",
                    kind: "switch",
                    description: "关闭时为公用读私有写，开启后读写都需要授权",
                },
            ],
        },
        DOWNLOAD_GROUP(true),
    ],

    aws_s3: [
        {
            title: "AWS S3 配置",
            source: "top",
            fields: [
                {
                    key: "bucket_name",
                    label: "存储桶名称",
                    kind: "text",
                    placeholder: "例如 my-s3-bucket",
                    description: "在 AWS S3 控制台创建的存储桶名称",
                },
                {
                    key: "server",
                    label: "Endpoint（可选）",
                    kind: "text",
                    placeholder: "留空使用 AWS 默认端点",
                    description: "自定义端点 URL，适用于 S3 兼容服务（MinIO、Backblaze 等）",
                    wide: true,
                },
            ],
        },
        PATH_GROUP("云端存储根目录", "例如 /uploads 或留空", "文件在存储桶中的根目录，以 / 开头"),
        {
            title: "API 密钥",
            source: "top",
            fields: [
                { key: "access_key", label: "Access Key ID", kind: "text", wide: true },
                { key: "secret_key", label: "Secret Access Key", kind: "password", wide: true },
            ],
        },
        {
            title: "访问权限",
            source: "top",
            fields: [
                {
                    key: "is_private",
                    label: "私有读写",
                    kind: "switch",
                    description: "关闭时为公用读私有写，开启后读写都需要授权",
                },
                {
                    key: "force_path_style",
                    label: "强制路径格式（Path Style）",
                    kind: "switch",
                    source: "settings",
                    description: "部分 S3 兼容服务（如 MinIO）需要开启此选项",
                },
            ],
        },
        DOWNLOAD_GROUP(true),
    ],

    qiniu_kodo: [
        {
            title: "七牛云配置",
            source: "top",
            fields: [
                {
                    key: "bucket_name",
                    label: "存储空间",
                    kind: "text",
                    placeholder: "例如 my-kodo-bucket",
                    description: "在七牛云控制台创建的存储空间名称",
                },
                {
                    key: "server",
                    label: "存储区域",
                    kind: "select",
                    description: "七牛云上传域名，对应存储空间所在区域",
                    options: [
                        { value: "https://up-z0.qiniup.com", label: "华东-浙江" },
                        { value: "https://up-cn-east-2.qiniup.com", label: "华东-浙江2" },
                        { value: "https://up-z1.qiniup.com", label: "华北-河北" },
                        { value: "https://up-z2.qiniup.com", label: "华南-广东" },
                        { value: "https://up-na0.qiniup.com", label: "北美-洛杉矶" },
                        { value: "https://up-as0.qiniup.com", label: "亚太-新加坡" },
                    ],
                },
            ],
        },
        PATH_GROUP("存储根目录", "例如 /images 或留空", "文件在存储空间中的根目录，以 / 开头"),
        {
            title: "API 密钥",
            source: "top",
            fields: [
                { key: "access_key", label: "AccessKey", kind: "text", wide: true },
                { key: "secret_key", label: "SecretKey", kind: "password", wide: true },
            ],
        },
        {
            title: "访问权限",
            source: "top",
            fields: [
                {
                    key: "is_private",
                    label: "私有空间",
                    kind: "switch",
                    description: "关闭时为公开空间，开启后访问需要签名",
                },
            ],
        },
        {
            title: "下载设置",
            source: "settings",
            fields: [
                {
                    key: "cdn_domain",
                    label: "访问域名",
                    kind: "url",
                    placeholder: "https://cdn.example.com",
                    description: "七牛云绑定的访问域名（后端必填，官方表单标了 isRequired）",
                    wide: true,
                },
                {
                    key: "custom_proxy",
                    label: "开启下载中转",
                    kind: "switch",
                    description: "开启后下载文件时会通过服务端代理",
                },
                {
                    key: "style_separator",
                    label: "样式分隔符（可选）",
                    kind: "text",
                    placeholder: "例如 - 或 /",
                    description: "用于七牛云图片处理样式",
                },
            ],
        },
    ],

    onedrive: [
        {
            title: "OneDrive 配置",
            source: "top",
            fields: [
                {
                    key: "server",
                    label: "Microsoft Graph 端点",
                    kind: "select",
                    description: "国际版或世纪互联版（后端必填）",
                    options: [
                        { value: "https://graph.microsoft.com", label: "Microsoft Graph（国际版）" },
                        { value: "https://microsoftgraph.chinacloudapi.cn", label: "世纪互联（中国版）" },
                    ],
                },
                {
                    key: "bucket_name",
                    label: "应用（客户端）ID",
                    kind: "text",
                    placeholder: "Azure AD 应用的 Client ID",
                    description: "在 Azure 门户注册的应用程序 ID（后端必填）",
                    wide: true,
                },
                {
                    key: "secret_key",
                    label: "客户端密码",
                    kind: "password",
                    description: "Azure AD 应用的客户端密码（后端必填）",
                    wide: true,
                },
                {
                    key: "drive_type",
                    label: "OneDrive 类型",
                    kind: "select",
                    options: [
                        { value: "default", label: "默认 OneDrive" },
                        { value: "sharepoint", label: "SharePoint 文档库" },
                    ],
                },
                {
                    key: "drive_id",
                    label: "SharePoint Drive ID",
                    kind: "text",
                    placeholder: "SharePoint 文档库 Drive ID",
                    description: "选择 SharePoint 类型时必填",
                    wide: true,
                },
            ],
        },
        PATH_GROUP("云端存储根目录", "例如 /AnHeYu 或留空", "文件在 OneDrive 中的存放根目录"),
    ],

    // 后端支持但官方前端没有表单的类型（constant:21 PolicyTypeUpyun）：
    // 字段取自后端 CreatePolicy 的必填校验（service:121-124），属于**推断项**。
    upyun: [
        {
            title: "又拍云配置",
            source: "top",
            fields: [
                { key: "server", label: "REST API 端点", kind: "url", placeholder: "例如 https://v0.api.upyun.com", wide: true },
                { key: "bucket_name", label: "服务名", kind: "text", placeholder: "在又拍云创建的服务名" },
                { key: "access_key", label: "操作员", kind: "text", wide: true },
                { key: "secret_key", label: "操作员密码", kind: "password", wide: true },
            ],
        },
        PATH_GROUP("存储根目录", "例如 /images 或留空", "文件在云存储中的根目录，以 / 开头"),
        {
            title: "访问权限",
            source: "top",
            fields: [{ key: "is_private", label: "私有读写", kind: "switch" }],
        },
        DOWNLOAD_GROUP(false),
    ],
};

/** 类型 → 读取该字段分组（未知类型回退到通用分组，避免编辑页白屏） */
export function fieldGroupsOf(type: string): StorageFieldGroup[] {
    return STORAGE_POLICY_FIELD_GROUPS[type] ?? STORAGE_POLICY_FIELD_GROUPS.local;
}

/** 同时落在 settings 里的数值键（max_size 在顶层，chunk_size 在 settings） */
export const CHUNK_SIZE_KEY = "chunk_size";

// ===================================
//       大小单位换算（对齐官方 storage/[id]/page.tsx:23-38）
// ===================================

export const SIZE_UNITS = [
    { label: "B", value: 1 },
    { label: "KB", value: 1024 },
    { label: "MB", value: 1024 * 1024 },
    { label: "GB", value: 1024 * 1024 * 1024 },
] as const;

/** 字节 → 尽量整除的单位（官方 bytesToHuman 同逻辑，默认 MB） */
export function bytesToHuman(bytes: number, defaultUnit = 1024 * 1024): { value: number; unit: number } {
    if (!bytes) return { value: 0, unit: defaultUnit };
    for (let i = SIZE_UNITS.length - 1; i >= 0; i--) {
        const unit = SIZE_UNITS[i];
        if (bytes >= unit.value && bytes % unit.value === 0) {
            return { value: bytes / unit.value, unit: unit.value };
        }
    }
    return { value: parseFloat((bytes / defaultUnit).toFixed(2)), unit: defaultUnit };
}

/** 单位值 → 中文标签（找不到时显示原始数字） */
export function unitLabel(unit: number): string {
    return SIZE_UNITS.find((u) => u.value === unit)?.label ?? String(unit);
}

/** 存储策略公共 ID 只允许 URL 安全字符（后端是 idgen 编码后的字符串） */
export function isValidPolicyId(id: string): boolean {
    return /^[A-Za-z0-9_-]{1,128}$/.test(id);
}

/** OneDrive 回调参数校验（code / state 都必填，见 handler.go:359-363） */
export function sanitizeOneDriveAuthorize(body: unknown):
    | { ok: true; value: OneDriveAuthorizePayload }
    | { ok: false; error: string } {
    if (!isPlainObject(body)) return { ok: false, error: "请求体必须是 JSON 对象" };
    const code = optionalString(body, "code");
    if (code === null) return { ok: false, error: "code 必须是字符串" };
    if (!code) return { ok: false, error: "code 不能为空" };
    const state = optionalString(body, "state");
    if (state === null) return { ok: false, error: "state 必须是字符串" };
    if (!state) return { ok: false, error: "state 不能为空" };
    return { ok: true, value: { code, state } };
}

// ===================================
//          客户端 API
// ===================================

const BASE = "/api/admin/storage-policies";

/** GET /api/admin/storage-policies/[id] —— 读取单个策略详情（远端 GET /policies/:id） */
export function getAdminStoragePolicyApi(id: string): Promise<AdminStoragePolicy> {
    return request<AdminStoragePolicy>(`${BASE}/${encodeURIComponent(id)}`, { method: "GET" });
}

/** POST /api/admin/storage-policies —— 新建策略（远端 POST /policies） */
export function createAdminStoragePolicyApi(payload: StoragePolicyWritePayload): Promise<AdminStoragePolicy> {
    return request<AdminStoragePolicy>(BASE, { method: "POST", body: JSON.stringify(payload) });
}

/** PUT /api/admin/storage-policies/[id] —— 整体更新策略（远端 PUT /policies/:id） */
export function updateAdminStoragePolicyApi(
    id: string,
    payload: StoragePolicyWritePayload
): Promise<AdminStoragePolicy> {
    return request<AdminStoragePolicy>(`${BASE}/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
    });
}

/** DELETE /api/admin/storage-policies/[id] —— 删除策略（远端 DELETE /policies/:id） */
export function deleteAdminStoragePolicyApi(id: string): Promise<unknown> {
    return request<unknown>(`${BASE}/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/**
 * GET /api/admin/storage-policies/onedrive/connect/[id]
 * 远端 GET /policies/connect/onedrive/:id → { url }（handler.go:341-357）
 * 前端拿到 url 后 window.location.href 跳转（官方前端 storage/[id]/page.tsx:89-91 同样做法）。
 */
export function getOneDriveAuthUrlApi(id: string): Promise<OneDriveAuthUrlData> {
    return request<OneDriveAuthUrlData>(`${BASE}/onedrive/connect/${encodeURIComponent(id)}`, { method: "GET" });
}

/**
 * POST /api/admin/storage-policies/onedrive/authorize
 * 远端 POST /policies/authorize/onedrive → 200（handler.go:377-390）
 * ⚠️ 推断项：社区版后端在 OAuth 回调（ConnectOneDrive 生成的 redirect_uri）里通常已经
 * 自己调用了 FinalizeAuth，这个 POST 只在「前端拿到 code/state 再回传」的流程里才需要。
 * 本项目的回调页两条路都会兜住（见 src/app/admin/storage/onedrive/callback/page.tsx）。
 */
export function completeOneDriveAuthApi(payload: OneDriveAuthorizePayload): Promise<unknown> {
    return request<unknown>(`${BASE}/onedrive/authorize`, { method: "POST", body: JSON.stringify(payload) });
}

// ===================================
//       表单 ↔ 请求体 互转
// ===================================

/**
 * 表单可编辑状态。沿用后端字段名（snake_case），避免多一层 camelCase 映射带来的错位；
 * 敏感字段另用 secretDirty 标记「用户是否改过」，没改过就交空串让后端还原原值。
 */
export interface StoragePolicyFormValues {
    name: string;
    type: string;
    flag: string;
    server: string;
    bucket_name: string;
    is_private: boolean;
    access_key: string;
    secret_key: string;
    max_size: number;
    base_path: string;
    virtual_path: string;
    settings: StoragePolicySettings;
    /** 用户是否手动改过 access_key（改过才把值提交上去） */
    access_key_dirty: boolean;
    /** 用户是否手动改过 secret_key */
    secret_key_dirty: boolean;
}

/** 新建时的各类型默认值（对齐官方前端 storage/page.tsx:287-312 的 CREATE_DEFAULTS） */
export const CREATE_POLICY_DEFAULTS: Record<string, Partial<StoragePolicyFormValues>> = {
    local: { type: "local", virtual_path: "/local", max_size: 10485760 },
    onedrive: { type: "onedrive", virtual_path: "/onedrive", max_size: 10485760 },
    tencent_cos: {
        type: "tencent_cos",
        virtual_path: "/cos",
        max_size: 10485760,
        settings: { upload_method: "client" },
    },
    aliyun_oss: {
        type: "aliyun_oss",
        virtual_path: "/oss",
        max_size: 10485760,
        settings: { upload_method: "client" },
    },
    aws_s3: { type: "aws_s3", virtual_path: "/s3", max_size: 10485760, settings: { upload_method: "client" } },
    qiniu_kodo: {
        type: "qiniu_kodo",
        virtual_path: "/qiniu",
        max_size: 10485760,
        settings: { upload_method: "client" },
    },
};

/**
 * 该策略在服务端是否**已存有**密钥（掩码或真实值都算已配置）。
 * 用于编辑时提示「留空 = 保持原值」，以及 OneDrive 的授权状态判断。
 */
export function hasStoredSecret(policy: Partial<AdminStoragePolicy>): boolean {
    const filled = (v?: string) => !!v && v !== "";
    return filled(policy.access_key) || filled(policy.secret_key);
}

/**
 * 详情 / 列表项 → 表单初始值（掩码密钥不当成已填写内容，保持空串 + 未改动）。
 *
 * 同时用该类型的 CREATE_POLICY_DEFAULTS 补齐「后端没返回、但 UI 必须有个可用值」的字段：
 * 例如 OneDrive 的 settings.drive_type（官方表单默认 "default"，不选就提交空串会让后端拿到空 map）。
 * 只补「响应里完全没有这个键」的项，已有键（哪怕值是空串）一律尊重服务端数据。
 * 注意：**不补 type**，策略类型以服务端返回为准，不从默认值猜。
 */
export function policyToFormValues(policy: Partial<AdminStoragePolicy>): StoragePolicyFormValues {
    const type = policy.type ?? "local";
    const defaults = CREATE_POLICY_DEFAULTS[type] ?? {};
    const settings: StoragePolicySettings = {};
    for (const [key, value] of Object.entries(defaults.settings ?? {})) {
        if (value !== undefined) settings[key] = value;
    }
    for (const [key, value] of Object.entries(policy.settings ?? {})) {
        settings[key] = value;
    }

    return {
        name: policy.name ?? "",
        type,
        flag: policy.flag ?? "",
        server: policy.server ?? "",
        bucket_name: policy.bucket_name ?? "",
        is_private: policy.is_private ?? false,
        access_key: policy.access_key === SECRET_MASK ? "" : (policy.access_key ?? ""),
        secret_key: policy.secret_key === SECRET_MASK ? "" : (policy.secret_key ?? ""),
        max_size: policy.max_size ?? 0,
        base_path: policy.base_path ?? "",
        virtual_path: policy.virtual_path ?? "",
        settings,
        access_key_dirty: false,
        secret_key_dirty: false,
    };
}

/** 新建时的空表单（按类型套默认值；显式字段放前面，类型默认值放后面覆盖） */
export function emptyFormValues(type: string): StoragePolicyFormValues {
    const defaults = CREATE_POLICY_DEFAULTS[type] ?? {};
    return {
        name: "",
        flag: "",
        server: "",
        bucket_name: "",
        is_private: false,
        access_key: "",
        secret_key: "",
        max_size: 0,
        base_path: "",
        virtual_path: "",
        access_key_dirty: false,
        secret_key_dirty: false,
        // 类型默认值（含 settings），放最后覆盖上面的空值；
        // 末尾的 type 用入参兜底，避免 Partial 的 undefined 盖掉它
        ...defaults,
        settings: { ...(defaults.settings ?? {}) },
        type,
    };
}

/**
 * 表单 → 后端请求体。
 * - 本地存储：base_path 交给后端按 virtual_path 归一化（service:157-175），这里不做二次推导；
 * - 密钥：未改动 → 空串（后端 preserveMaskedStoragePolicySecrets 会还原原值）；
 * - settings：丢掉空字符串的「未填写」项，避免把空 CDN 域名写进去。
 */
export function formValuesToPayload(values: StoragePolicyFormValues): StoragePolicyWritePayload {
    const settings: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values.settings ?? {})) {
        if (value === "" || value === undefined || value === null) continue;
        settings[key] = value;
    }

    return {
        name: values.name.trim(),
        type: values.type,
        flag: values.flag,
        server: values.server.trim(),
        bucket_name: values.bucket_name.trim(),
        is_private: values.is_private,
        access_key: values.access_key_dirty ? values.access_key.trim() : "",
        secret_key: values.secret_key_dirty ? values.secret_key.trim() : "",
        max_size: Number.isFinite(values.max_size) ? Math.round(values.max_size) : 0,
        base_path: values.base_path.trim(),
        virtual_path: values.virtual_path.trim(),
        settings,
    };
}

/**
 * 「设为默认」请求体：以已有策略为基础，只把 flag 换成目标用途。
 * 必须带上完整字段（name/type 是 required，其余是整体覆盖语义），所以这里做一次合并。
 */
export function formValuesWithFlag(
    values: StoragePolicyFormValues,
    flag: StoragePolicyFlagValue
): StoragePolicyWritePayload {
    return formValuesToPayload({ ...values, flag });
}
