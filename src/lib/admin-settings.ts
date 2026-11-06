// 后台「系统设置」的字段描述与读写工具。
//
// 约定（与官方后台一致）：
//  - 每个字段的 key 就是**后端键**，点号路径形式（如 footer.socialBar.left、LOGO_URL_192x192）；
//  - 读取：首屏值来自公开的 /public/site-config（嵌套对象），按点号路径取值；
//  - 保存：POST /settings/update，只提交改动项；字符串原样提交，
//    布尔提交 "true"/"false"，列表/对象提交 JSON.stringify 后的字符串。
//
// 分区（左侧导航按 SETTINGS_GROUP_ORDER 的分组聚拢）：
//   站点信息：基本信息、Logo 与图标；
//   外观配置：换肤与配色、首页设置、导航与页头、顶栏用户面板、侧边栏、页面大图、页脚；
//   内容管理：文章配置、文件处理；用户通知：评论系统、邮件服务；三方服务：第三方登录；
//   页面显示：关于页面、各页面横幅与前台站长信息；高级功能：注册与外链、AI 功能、人机验证、微信分享、其它开关。

import type { LucideIcon } from "lucide-react";
import {
    Backpack,
    CreditCard,
    FileImage,
    FileText,
    GalleryHorizontalEnd,
    Globe,
    House,
    Image as ImageIcon,
    Images,
    KeyRound,
    LayoutDashboard,
    Link2,
    Mail,
    Menu,
    MessageCircle,
    MessageSquare,
    MessagesSquare,
    Music,
    NotebookPen,
    Paintbrush,
    PanelBottom,
    PanelLeft,
    Share2,
    ShieldCheck,
    SlidersHorizontal,
    Sparkles,
    UserPlus,
    UserRound,
} from "lucide-react";

import { BUILT_IN_SKINS, DEFAULT_SKIN_ID, type AppearanceModeTokens } from "@/lib/appearance";

export type SettingsFieldType =
    | "text"
    | "textarea"
    /** 密码类（SMTP_PASSWORD 等）：密文输入框；配合 sensitive 做掩码回显 */
    | "password"
    | "number"
    | "boolean"
    | "select"
    | "image"
    | "list"
    | "tokens"
    | "stringlist"
    | "color"
    | "json"
    | "skin"
    /** 代码块编辑：等宽 + 行高 + 语法高亮 + 格式化按钮（SettingsCodeField） */
    | "code"
    /**
     * AI 区专用：整块交给 src/components/admin/ai-settings-panel.tsx 渲染（官方 AI 设置面板的
     * 分模块布局：AI 摘要 / AI 写作 / AI 播客 / AI 助手），草稿与保存仍走本文件的
     * buildSettingsBaseline / isFieldDirty / buildSettingsPayload，不另造一套提交逻辑。
     */
    | "ai"
    /**
     * 支付配置区专用：整块交给 src/components/admin/payment-settings-panel.tsx 渲染。
     * 这些配置**不在设置表里**（PRO 侧走 /pro/payment/config/* 独立接口），所以这个字段只是
     * 占位标记（key 用 payment.__panel），不参与草稿与保存。
     */
    | "payment";

/** type="ai" 时的控件细类（面板按它决定渲染成什么输入框；model = 可选可输入的下拉+自由文本） */
export type SettingsAiControl = "text" | "password" | "number" | "textarea" | "select" | "model";

/** 列表项里的字段定义（type=list 时表示嵌套一层列表，如 footer.project.list[].links） */
export interface SettingsListField {
    name: string;
    label: string;
    /** 列表项子字段的控件类型（默认 text）；color 用于 CREATIVITY.creativity_list[].color 这类十六进制色值 */
    type?: "text" | "number" | "color" | "boolean";
    placeholder?: string;
    wide?: boolean;
    nested?: SettingsListField[];
}

export interface SettingsField {
    /** 后端键（点号路径） */
    key: string;
    label: string;
    type: SettingsFieldType;
    hint?: string;
    placeholder?: string;
    options?: { value: string; label: string }[];
    /** type=list：列表项的字段定义 */
    itemFields?: SettingsListField[];
    /** 独占整行 */
    wide?: boolean;
    /** type=textarea 的行数（默认 3；邮件模板这类长文本用 10+）；type=code 时表示编辑器高度 */
    rows?: number;
    /** type=code：highlight.js 的语言名（默认 html） */
    language?: string;
    /**
     * 该键**不随公开的 /public/site-config 下发**（如 SMTP_*、DEFAULT_*_TEMPLATE）：
     * settings-manager 挂载时会额外走 POST /settings/get-by-keys 补读真实值，
     * 否则面板只会显示空态、把「已配置」误判成「没配」。
     */
    remoteOnly?: boolean;
    /** type="ai"：该字段归属的模块（面板按模块分块渲染） */
    aiModule?: "summary" | "writing" | "podcast" | "assistant";
    /** type="ai"：控件细类 */
    aiControl?: SettingsAiControl;
    /**
     * 敏感项（API Key 之类）：回显掩码、未改动不提交。
     * 判据见 isFieldDirty：基线是掩码而草稿为空/未动时不算改动，避免把掩码写回后端。
     */
    sensitive?: boolean;
}

export interface SettingsGroup {
    id: string;
    label: string;
    fields: SettingsField[];
}

export interface SettingsSection {
    id: string;
    label: string;
    /** 左侧导航的归属分组（如「外观配置」）；导航按分组聚拢显示，避免十几个分区平铺 */
    group: string;
    /** 左侧导航图标（对齐官方后台一栏一项带图标） */
    icon: LucideIcon;
    /** 搜索用关键词（分区级；分组/字段名也会参与匹配） */
    keywords?: string[];
    desc?: string;
    /**
     * 分区级「危险/未接通」提示（黄色告警条，渲染在标题下方）。
     * 用于「后端支持、但前台还没接」的开关：让管理员在拨开关之前就看到后果，
     * 而不是拨完发现前台静默失效。目前只有「人机验证」用。
     */
    warning?: string;
    groups: SettingsGroup[];
}

/** Gravatar 默认头像风格（与官方一致） */
const GRAVATAR_TYPES = [
    { value: "mp", label: "mp（神秘人）" },
    { value: "identicon", label: "identicon（几何图形）" },
    { value: "monsterid", label: "monsterid（小怪兽）" },
    { value: "wavatar", label: "wavatar（卡通脸）" },
    { value: "retro", label: "retro（像素 8bit）" },
    { value: "robohash", label: "robohash（机器人）" },
    { value: "blank", label: "blank（透明）" },
];

/** 8 套内置皮肤（id 与后端 APPEARANCE_SKIN 取值一致） */
export const SKIN_OPTIONS = [
    { value: "brand_blue", label: "品牌蓝" },
    { value: "emerald", label: "翡翠绿" },
    { value: "violet", label: "紫罗兰" },
    { value: "rose", label: "玫红" },
    { value: "amber", label: "琥珀" },
    { value: "cyan", label: "青蓝" },
    { value: "slate", label: "板岩灰" },
    { value: "crimson", label: "深红" },
] as const;

/** 皮肤卡片的预览色（浅色模式主色） */
export function skinPreviewColor(id: string, mode: "light" | "dark" = "light"): string {
    return BUILT_IN_SKINS[id]?.[mode]?.primary ?? "#999999";
}

/** 外观相关的配置键（字段定义与令牌编辑器共用，避免各处写错字符串） */
export const APPEARANCE_SKIN_KEY = "APPEARANCE_SKIN";
export const APPEARANCE_TOKENS_KEY = "APPEARANCE_TOKENS";

/**
 * 单个可自定义配色令牌的元数据。
 * 名字必须与后端令牌字段同名，因为键名直接落到 APPEARANCE_TOKENS 里。
 */
export interface AppearanceTokenField {
    /** 令牌键名（= APPEARANCE_TOKENS 的 light/dark 分支字段名） */
    name: keyof AppearanceModeTokens;
    label: string;
    /** 这个令牌管什么（官方快照没有这层说明，是为了让取色时不用去猜加的） */
    desc: string;
}

/**
 * 可自定义的配色令牌清单。
 * 口径以后端为准：scripts/anheyu/anheyu-app-main/internal/configdef/definition.go:53 的注释写明
 * APPEARANCE_TOKENS 默认 "{}"、结构 {"light":{...},"dark":{...}}、字段含
 * primary、primaryForeground、success、warning、danger、info、accent —— 与这里 7 项一一对应。
 * 顺序上把 accent 挨着 primary 放，方便对着主色一起调。
 */
export const APPEARANCE_TOKEN_FIELDS: readonly AppearanceTokenField[] = [
    { name: "primary", label: "主色", desc: "按钮、链接、选中态的主色" },
    { name: "primaryForeground", label: "主色前景", desc: "主色底上的文字/图标色，要和主色拉开对比" },
    { name: "accent", label: "强调色", desc: "焦点环等次级强调（本站映射到 --ring）" },
    { name: "success", label: "成功", desc: "成功状态" },
    { name: "warning", label: "警告", desc: "警告状态" },
    { name: "danger", label: "危险", desc: "错误/删除等危险操作（映射到 --destructive）" },
    { name: "info", label: "信息", desc: "信息提示" },
];

/**
 * 令牌 → 本站 CSS 变量名，仅供后台展示（让用户知道改的是哪个变量）。
 * 取值口径同 src/lib/appearance.ts 的 TOKEN_TO_VAR（那里没导出，所以这里重列一份展示用）。
 */
export const APPEARANCE_TOKEN_CSS_VARS: Record<keyof AppearanceModeTokens, string> = {
    primary: "--primary",
    primaryForeground: "--primary-foreground",
    accent: "--ring",
    danger: "--destructive",
    success: "--success",
    warning: "--warning",
    info: "--info",
};

/**
 * APPEARANCE_TOKENS 的值结构：在皮肤预设之上按明暗两套分支局部覆盖。
 * 这里只是类型描述，不改变序列化：保存时仍由 buildSettingsPayload 序列化成 JSON 字符串提交。
 */
export interface AppearanceTokenBranches {
    light?: Record<string, string>;
    dark?: Record<string, string>;
}

/** 皮肤 id 归一：未知/为空回退默认皮肤（与 appearance.ts 的 resolveAppearance 同一口径） */
export function normalizeSkinId(skinId: string | null | undefined): string {
    const requested = skinId?.trim() ?? "";
    // 用 hasOwn 而不是直接取属性：像 "toString" 这种原型链上的名字不能当成合法皮肤 id
    return Object.hasOwn(BUILT_IN_SKINS, requested) ? requested : DEFAULT_SKIN_ID;
}

/** 皮肤的显示名（未知/为空时按默认皮肤显示） */
export function skinLabel(skinId: string | null | undefined): string {
    const id = normalizeSkinId(skinId);
    return SKIN_OPTIONS.find((skin) => skin.value === id)?.label ?? id;
}

/** 皮肤预设自身的浅/深两套令牌（不含用户覆盖）：也就是「留空 = 跟随皮肤」时页面真正用的颜色 */
export function skinPresetTokens(skinId: string | null | undefined): { light: AppearanceModeTokens; dark: AppearanceModeTokens } {
    return BUILT_IN_SKINS[normalizeSkinId(skinId)];
}

/** 只保留白名单令牌、且值为非空字符串的覆盖项（与 appearance.ts 的 sanitizeBranch 同口径） */
function pickTokenOverrides(branch?: Record<string, string>): Partial<AppearanceModeTokens> {
    const out: Partial<AppearanceModeTokens> = {};
    if (!branch) return out;
    for (const { name } of APPEARANCE_TOKEN_FIELDS) {
        const value = branch[name];
        if (typeof value === "string" && value.trim() !== "") out[name] = value.trim();
    }
    return out;
}

/**
 * 合并「皮肤预设 + 用户覆盖」，得到某模式下真正生效的令牌，供后台取色时实时预览。
 * 合并顺序与 src/lib/appearance.ts 的 resolveAppearance 一致（预设在前、覆盖在后），
 * 这样预览看到的颜色就是保存后前台会用到的颜色。
 */
export function resolveTokenPreview(
    skinId: string | null | undefined,
    tokens: AppearanceTokenBranches
): { light: AppearanceModeTokens; dark: AppearanceModeTokens } {
    const preset = skinPresetTokens(skinId);
    return {
        light: { ...preset.light, ...pickTokenOverrides(tokens?.light) },
        dark: { ...preset.dark, ...pickTokenOverrides(tokens?.dark) },
    };
}

// ---- 页面大图 page.one_image：媒体类型下拉项（与 types 里的 "image" | "video" 一致）----
const ONE_IMAGE_MEDIA_TYPES = [
    { value: "image", label: "图片" },
    { value: "video", label: "视频" },
];

/**
 * page.one_image 单页大图字段（首页 / 归档 / 分类 / 标签四页结构完全一致）。
 * 前台 components/(blog)/one-image-hero.tsx 逐字段读取：enable、mainTitle、subTitle、background、
 * mobileBackground、mediaType、mobileMediaType、videoAutoplay/Loop/Muted、mobileVideoAutoplay/Loop/Muted、
 * hitokoto、typingEffect（另 header.tsx 读 enable 决定页头是否透明悬浮）。
 */
function oneImagePageFields(page: "home" | "archives" | "categories" | "tags"): SettingsField[] {
    const key = (name: string) => `page.one_image.config.${page}.${name}`;
    return [
        { key: key("enable"), label: "启用大图", type: "boolean", hint: "关闭后该页不显示大图" },
        { key: key("mainTitle"), label: "主标题", type: "text", hint: "留空则用站点名称（APP_NAME）" },
        {
            key: key("subTitle"),
            label: "副标题",
            type: "text",
            hint: "留空则不显示；开启「一言」时副标题被一言句子替换（不会回落到站点副标题）",
        },
        { key: key("background"), label: "桌面端背景", type: "image", hint: "支持图片地址或视频地址" },
        {
            key: key("mobileBackground"),
            label: "移动端背景",
            type: "image",
            hint: "支持图片地址或视频地址；留空回落桌面端背景",
        },
        { key: key("mediaType"), label: "桌面端媒体类型", type: "select", options: ONE_IMAGE_MEDIA_TYPES },
        { key: key("mobileMediaType"), label: "移动端媒体类型", type: "select", options: ONE_IMAGE_MEDIA_TYPES },
        { key: key("videoAutoplay"), label: "桌面视频自动播放", type: "boolean" },
        { key: key("videoLoop"), label: "桌面视频循环播放", type: "boolean" },
        { key: key("videoMuted"), label: "桌面视频静音", type: "boolean" },
        { key: key("mobileVideoAutoplay"), label: "移动视频自动播放", type: "boolean" },
        { key: key("mobileVideoLoop"), label: "移动视频循环播放", type: "boolean" },
        { key: key("mobileVideoMuted"), label: "移动视频静音", type: "boolean" },
        { key: key("hitokoto"), label: "使用一言", type: "boolean", hint: "开启后用一言接口返回的句子替换副标题" },
        { key: key("typingEffect"), label: "打字机效果", type: "boolean" },
    ];
}

/** 左侧导航的分组顺序（对齐官方后台「设置」导航的分组） */
export const SETTINGS_GROUP_ORDER = ["站点信息", "外观配置", "内容管理", "用户通知", "三方服务", "页面显示", "高级功能"] as const;

// ===================== AI 相关选项表（对齐官方 AISettingsForm.tsx:63-181） =====================
// 为什么把选项放在这里而不是面板组件里：键名/选项都是「后端认识什么」的事实，
// 与 SETTINGS_SECTIONS 的字段声明放一起才好对照官方 setting-descriptors.ts；面板只管布局与交互。

/** 敏感项掩码（远端同一常量 constant.SecretValueMask；存储策略页也是这个值） */
export const SETTINGS_SECRET_MASK = "********";

/** AI 服务商（官方 6 个；线上 GET /api/pro/admin/ai/writing/config 的 supported_providers 实测完全一致） */
export const AI_PROVIDER_OPTIONS: { value: string; label: string }[] = [
    { value: "glm", label: "智谱 GLM" },
    { value: "openai", label: "OpenAI" },
    { value: "qwen", label: "通义千问" },
    { value: "claude", label: "Claude" },
    { value: "deepseek", label: "DeepSeek" },
    { value: "doubao", label: "豆包" },
];

/** 各服务商常用模型（官方同款；只是候选，输入框允许直接写自定义模型名） */
export const AI_PROVIDER_MODEL_OPTIONS: Record<string, { value: string; label: string }[]> = {
    glm: [
        { value: "glm-4-flash", label: "GLM-4-Flash" },
        { value: "glm-4-air", label: "GLM-4-Air" },
        { value: "glm-4-airx", label: "GLM-4-AirX" },
        { value: "glm-4-long", label: "GLM-4-Long" },
        { value: "glm-4-plus", label: "GLM-4-Plus" },
        { value: "glm-4", label: "GLM-4" },
        { value: "glm-4v", label: "GLM-4V" },
    ],
    openai: [
        { value: "gpt-4o-mini", label: "GPT-4o Mini" },
        { value: "gpt-4o", label: "GPT-4o" },
        { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
        { value: "gpt-4", label: "GPT-4" },
        { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
    ],
    qwen: [
        { value: "qwen-turbo", label: "Qwen Turbo" },
        { value: "qwen-plus", label: "Qwen Plus" },
        { value: "qwen-max", label: "Qwen Max" },
        { value: "qwen-long", label: "Qwen Long" },
    ],
    claude: [
        { value: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku" },
        { value: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet" },
        { value: "claude-3-opus-latest", label: "Claude 3 Opus" },
    ],
    deepseek: [
        { value: "deepseek-chat", label: "DeepSeek Chat" },
        { value: "deepseek-coder", label: "DeepSeek Coder" },
        { value: "deepseek-reasoner", label: "DeepSeek Reasoner" },
    ],
    doubao: [
        { value: "doubao-seed-1-6-251015", label: "Doubao-Seed-1.6 (251015)" },
        { value: "doubao-seed-1-6-lite-251015", label: "Doubao-Seed-1.6-lite" },
        { value: "doubao-seed-1-6-flash-250828", label: "Doubao-Seed-1.6-flash" },
        { value: "doubao-1-5-pro-32k-250115", label: "Doubao-1.5-pro-32k" },
    ],
};

/** 向量化服务商（官方嵌入模型选择） */
export const AI_EMBEDDING_PROVIDER_OPTIONS: { value: string; label: string }[] = [
    { value: "siliconflow", label: "硅基流动（推荐）" },
    { value: "zhipu", label: "智谱 AI" },
    { value: "openai", label: "OpenAI" },
    { value: "qwen", label: "通义千问" },
    { value: "ollama", label: "Ollama（本地）" },
];

export const AI_EMBEDDING_MODEL_OPTIONS: Record<string, { value: string; label: string }[]> = {
    siliconflow: [
        { value: "BAAI/bge-m3", label: "BGE-M3（推荐）" },
        { value: "BAAI/bge-large-zh-v1.5", label: "BGE-Large-zh" },
    ],
    zhipu: [{ value: "embedding-3", label: "Embedding-3" }],
    openai: [
        { value: "text-embedding-3-small", label: "text-embedding-3-small" },
        { value: "text-embedding-3-large", label: "text-embedding-3-large" },
    ],
    qwen: [{ value: "text-embedding-v2", label: "text-embedding-v2" }],
    ollama: [
        { value: "nomic-embed-text", label: "nomic-embed-text" },
        { value: "bge-m3", label: "bge-m3" },
    ],
};

/** 向量库（官方：内嵌 / pgvector / Qdrant） */
export const AI_VECTOR_STORE_OPTIONS: { value: string; label: string }[] = [
    { value: "embedded", label: "内嵌存储（推荐）" },
    { value: "pgvector", label: "pgvector" },
    { value: "qdrant", label: "Qdrant" },
];

/** 播客语音服务商（官方目前只有火山引擎豆包） */
export const AI_PODCAST_PROVIDER_OPTIONS: { value: string; label: string }[] = [
    { value: "doubao", label: "豆包（火山引擎）" },
];

export const AI_PODCAST_SPEAKER_OPTIONS: { value: string; label: string }[] = [
    { value: "zh_male_dayixiansheng_v2_saturn_bigtts", label: "大义先生（男声）" },
    { value: "zh_female_mizaitongxue_v2_saturn_bigtts", label: "米仔同学（女声）" },
    { value: "zh_male_liufei_v2_saturn_bigtts", label: "刘飞（男声）" },
    { value: "zh_male_xiaolei_v2_saturn_bigtts", label: "小雷（男声）" },
];

export const AI_PODCAST_AUDIO_FORMAT_OPTIONS: { value: string; label: string }[] = [
    { value: "mp3", label: "MP3" },
    { value: "ogg_opus", label: "OGG Opus" },
    { value: "pcm", label: "PCM" },
    { value: "aac", label: "AAC" },
];

export const AI_PODCAST_SAMPLE_RATE_OPTIONS: { value: string; label: string }[] = [
    { value: "16000", label: "16000 Hz" },
    { value: "24000", label: "24000 Hz（推荐）" },
    { value: "48000", label: "48000 Hz" },
];

export const SETTINGS_SECTIONS: SettingsSection[] = [
    {
        id: "site",
        label: "基本信息",
        group: "站点信息",
        icon: Globe,
        keywords: ["站点", "名称", "标题", "描述", "关键词", "地址", "备案", "头像", "gravatar", "关于"],
        desc: "站点名称、描述、备案与站长信息；前台标题、页脚备案、评论头像都读这里。",
        groups: [
            {
                id: "basic",
                label: "基本信息",
                fields: [
                    { key: "APP_NAME", label: "站点名称", type: "text", placeholder: "葱苓小筑" },
                    { key: "SUB_TITLE", label: "副标题", type: "text", placeholder: "风带来了故事的种子，时间使其发芽。" },
                    { key: "SITE_URL", label: "站点地址", type: "text", placeholder: "https://blog.example.com" },
                    { key: "ABOUT_LINK", label: "关于页链接", type: "text", placeholder: "/about" },
                    { key: "SITE_KEYWORDS", label: "关键词", type: "text", placeholder: "博客,Next.js,React（逗号分隔）" },
                    { key: "SITE_DESCRIPTION", label: "站点描述", type: "textarea", wide: true },
                ],
            },
            {
                id: "owner",
                label: "站长与头像",
                fields: [
                    { key: "frontDesk.siteOwner.name", label: "站长名称", type: "text" },
                    { key: "frontDesk.siteOwner.email", label: "站长邮箱", type: "text" },
                    { key: "USER_AVATAR", label: "站长头像", type: "image", placeholder: "图片地址" },
                    { key: "GRAVATAR_URL", label: "Gravatar 镜像", type: "text", placeholder: "https://cravatar.cn/avatar/" },
                    { key: "DEFAULT_GRAVATAR_TYPE", label: "默认头像风格", type: "select", options: GRAVATAR_TYPES },
                ],
            },
            {
                id: "record",
                label: "备案",
                fields: [
                    { key: "ICP_NUMBER", label: "ICP 备案号", type: "text", placeholder: "皖ICP备00000000号-1" },
                    { key: "POLICE_RECORD_NUMBER", label: "公安备案号", type: "text" },
                    { key: "POLICE_RECORD_ICON", label: "公安备案图标", type: "image" },
                ],
            },
        ],
    },
    {
        id: "logo",
        label: "Logo 与图标",
        group: "站点信息",
        icon: ImageIcon,
        keywords: ["logo", "图标", "favicon", "pwa", "横版"],
        desc: "站点 Logo 与浏览器/PWA 图标；改完刷新页面即可看到。",
        groups: [
            {
                id: "logo",
                label: "站点 Logo",
                fields: [
                    { key: "LOGO_URL", label: "站点 Logo", type: "image", placeholder: "图片地址" },
                    { key: "LOGO_HORIZONTAL_DAY", label: "横版 Logo（浅色）", type: "image" },
                    { key: "LOGO_HORIZONTAL_NIGHT", label: "横版 Logo（深色）", type: "image" },
                ],
            },
            {
                id: "icon",
                label: "图标",
                fields: [
                    { key: "ICON_URL", label: "站点图标（favicon）", type: "image" },
                    { key: "LOGO_URL_192x192", label: "PWA 图标 192", type: "image", hint: "留空则回退到站点 Logo / 图标" },
                    { key: "LOGO_URL_512x512", label: "PWA 图标 512", type: "image" },
                ],
            },
        ],
    },
    {
        id: "appearance",
        label: "换肤与配色",
        group: "外观配置",
        icon: Paintbrush,
        keywords: ["换肤", "皮肤", "主题", "配色", "颜色", "明暗", "深色", "浅色", "动效"],
        desc: "换肤与默认明暗模式；皮肤只影响主色与语义色，可再按令牌微调。",
        groups: [
            {
                id: "skin",
                label: "换肤与配色",
                fields: [
                    {
                        key: APPEARANCE_SKIN_KEY,
                        label: "皮肤",
                        type: "skin",
                        wide: true,
                        hint: "内置 8 套配色方案；卡片上两枚圆点是它浅色/深色的主色",
                    },
                    {
                        key: APPEARANCE_TOKENS_KEY,
                        label: "自定义配色令牌",
                        type: "tokens",
                        wide: true,
                        hint: "逐项取色或填十六进制；留空 = 跟随皮肤；保存后前台生效",
                    },
                ],
            },
            {
                id: "mode",
                label: "明暗与动效",
                fields: [
                    {
                        key: "DEFAULT_THEME_MODE",
                        label: "默认明暗模式",
                        type: "select",
                        hint: "「定时切换」= 按下面两个时间自动在深浅色之间切换",
                        options: [
                            { value: "light", label: "浅色" },
                            { value: "dark", label: "深色" },
                            { value: "auto", label: "定时切换（auto）" },
                        ],
                    },
                    {
                        key: "THEME_LIGHT_START_TIME",
                        label: "浅色时段开始",
                        type: "text",
                        placeholder: "08:00",
                        hint: "HH:MM（00:00–23:59）；仅「定时切换」时生效，填错会回退默认 08:00",
                    },
                    {
                        key: "THEME_DARK_START_TIME",
                        label: "深色时段开始",
                        type: "text",
                        placeholder: "20:00",
                        hint: "HH:MM；该时刻起进入深色，直到浅色时段开始",
                    },
                    { key: "RESPECT_REDUCED_MOTION", label: "尊重系统的「减少动态效果」", type: "boolean" },
                ],
            },
        ],
    },
    {
        id: "home",
        label: "首页设置",
        group: "外观配置",
        icon: House,
        keywords: ["首页", "公告", "home", "banner", "分类入口", "HOME_TOP", "公告栏"],
        desc: "站点公告与首页顶部区（标题、分类入口、右侧卡片）。",
        groups: [
            {
                id: "announcement",
                label: "站点公告",
                fields: [{ key: "SITE_ANNOUNCEMENT", label: "站点公告", type: "textarea", wide: true }],
            },
            {
                id: "top-text",
                label: "首页标题区",
                fields: [
                    { key: "HOME_TOP.title", label: "主标题", type: "text" },
                    { key: "HOME_TOP.subTitle", label: "副标题", type: "text" },
                    { key: "HOME_TOP.siteText", label: "站点小字", type: "text" },
                ],
            },
            {
                id: "top-banner",
                label: "首页右侧卡片",
                fields: [
                    { key: "HOME_TOP.banner.title", label: "卡片标题", type: "text" },
                    { key: "HOME_TOP.banner.tips", label: "角标文案", type: "text" },
                    { key: "HOME_TOP.banner.link", label: "跳转链接", type: "text" },
                    { key: "HOME_TOP.banner.image", label: "卡片背景图", type: "image" },
                    { key: "HOME_TOP.banner.isExternal", label: "新标签页打开", type: "boolean" },
                ],
            },
            {
                id: "top-category",
                label: "首页分类入口",
                fields: [
                    {
                        key: "HOME_TOP.category",
                        label: "分类入口",
                        type: "list",
                        hint: "背景支持图片地址或 linear-gradient(...)",
                        itemFields: [
                            { name: "name", label: "名称", placeholder: "分类" },
                            { name: "path", label: "路径", placeholder: "/categories/xxx" },
                            { name: "icon", label: "图标 class" },
                            { name: "background", label: "背景", placeholder: "图片地址或 linear-gradient(...)" },
                            { name: "isExternal", label: "新标签页打开", type: "boolean" },
                        ],
                    },
                ],
            },
        ],
    },
    {
        id: "header",
        label: "导航与页头",
        group: "外观配置",
        icon: Menu,
        keywords: ["导航", "菜单", "页头", "顶栏", "header", "时钟", "旅行"],
        desc: "站点头部导航菜单与页头附加项；导航菜单直接决定前台顶栏和移动端抽屉里的结构。",
        groups: [
            {
                id: "menu",
                label: "导航菜单",
                fields: [
                    {
                        key: "header.menu",
                        label: "导航菜单",
                        type: "list",
                        hint: "两层结构：分组（title）→ 分组内菜单项（items）",
                        itemFields: [
                            { name: "title", label: "分组名称", placeholder: "导航" },
                            {
                                name: "items",
                                label: "分组内菜单项",
                                nested: [
                                    { name: "title", label: "标题", placeholder: "首页" },
                                    { name: "path", label: "路径", placeholder: "/" },
                                    { name: "icon", label: "图标 class", placeholder: "iconfont icon-home" },
                                    { name: "isExternal", label: "新标签页打开", type: "boolean" },
                                ],
                            },
                        ],
                    },
                ],
            },
            {
                id: "nav",
                label: "页头附加项",
                fields: [
                    { key: "header.nav.clock", label: "显示时钟", type: "boolean" },
                    { key: "header.nav.travelling", label: "显示旅行足迹", type: "boolean" },
                    { key: "header.nav.menu", label: "附加菜单", type: "json", hint: "类型为 unknown[]", placeholder: "[]" },
                ],
            },
        ],
    },
    {
        id: "userpanel",
        label: "顶栏用户面板",
        group: "外观配置",
        icon: LayoutDashboard,
        keywords: ["用户", "面板", "userpanel", "菜单", "通知", "发布", "顶栏"],
        desc: "登录后右上角用户菜单里显示哪些入口（发布类入口仅管理员可见）。",
        groups: [
            {
                id: "menu",
                label: "用户菜单入口",
                fields: [
                    { key: "userpanel.show_user_center", label: "显示用户中心", type: "boolean" },
                    { key: "userpanel.show_notifications", label: "显示通知", type: "boolean" },
                    { key: "userpanel.show_publish_article", label: "显示发布文章", type: "boolean", hint: "仅管理员" },
                    { key: "userpanel.show_publish_essay", label: "显示发布说说", type: "boolean", hint: "仅管理员" },
                    { key: "userpanel.show_admin_dashboard", label: "显示后台入口", type: "boolean", hint: "仅管理员" },
                ],
            },
        ],
    },
    {
        id: "sidebar",
        label: "侧边栏",
        group: "外观配置",
        icon: PanelLeft,
        keywords: ["侧边栏", "sidebar", "作者卡", "归档", "标签云", "目录", "网站信息", "微信", "天气"],
        desc: "博客右侧边栏的各个卡片：作者卡、归档、标签云、网站信息、目录、自定义侧边栏、微信与天气。",
        groups: [
            {
                id: "author",
                label: "作者卡片",
                fields: [
                    { key: "sidebar.author.enable", label: "显示作者卡片", type: "boolean" },
                    { key: "sidebar.author.description", label: "悬浮描述", type: "textarea", wide: true, hint: "支持 HTML" },
                    { key: "sidebar.author.skills", label: "技能词", type: "stringlist", hint: "顶部问候语点击循环展示", placeholder: "一条技能" },
                    { key: "sidebar.author.statusImg", label: "头像状态角标", type: "image" },
                    { key: "sidebar.author.social", label: "社交链接", type: "json", hint: "键为平台名，值为 { icon, link }", placeholder: "{}" },
                ],
            },
            {
                id: "archive",
                label: "归档卡片",
                fields: [{ key: "sidebar.archive.displayMonths", label: "显示月份数", type: "number", placeholder: "6", hint: "0 表示不限制" }],
            },
            {
                id: "siteinfo",
                label: "网站信息卡片",
                fields: [
                    { key: "sidebar.siteinfo.totalPostCount", label: "文章总数", type: "number" },
                    { key: "sidebar.siteinfo.totalWordCount", label: "全站字数", type: "number" },
                    { key: "sidebar.siteinfo.runtimeEnable", label: "显示建站天数", type: "boolean" },
                ],
            },
            {
                id: "recent-post",
                label: "最近文章",
                fields: [
                    { key: "sidebar.recentPost.enable", label: "显示最近文章", type: "boolean" },
                    { key: "sidebar.recentPost.count", label: "显示条数", type: "number" },
                ],
            },
            {
                id: "tags",
                label: "标签云",
                fields: [
                    { key: "sidebar.tags.enable", label: "显示标签云", type: "boolean" },
                    { key: "sidebar.tags.highlight", label: "高亮标签", type: "stringlist", placeholder: "一个标签名", hint: "填标签名，命中的标签用主色高亮" },
                ],
            },
            {
                id: "series",
                label: "系列",
                fields: [{ key: "sidebar.series.postCount", label: "显示文章数", type: "number" }],
            },
            {
                id: "custom",
                label: "自定义侧边栏",
                fields: [{ key: "sidebar.custom.showInPost", label: "文章页显示", type: "boolean" }],
            },
            {
                id: "toc",
                label: "文章目录",
                fields: [{ key: "sidebar.toc.collapseMode", label: "默认折叠", type: "boolean" }],
            },
            {
                id: "doc",
                label: "文档链接",
                fields: [
                    {
                        key: "sidebar.doc.links",
                        label: "文档链接",
                        type: "list",
                        itemFields: [
                            { name: "title", label: "标题" },
                            { name: "link", label: "链接" },
                            { name: "icon", label: "图标 class" },
                            { name: "external", label: "外链", type: "boolean" },
                        ],
                    },
                ],
            },
            {
                id: "wechat",
                label: "微信卡片",
                fields: [
                    { key: "sidebar.wechat.enable", label: "显示微信卡片", type: "boolean" },
                    { key: "sidebar.wechat.face", label: "正面图", type: "image" },
                    { key: "sidebar.wechat.backFace", label: "背面图", type: "image" },
                    { key: "sidebar.wechat.blurBackground", label: "模糊背景图", type: "image" },
                    { key: "sidebar.wechat.link", label: "跳转链接", type: "text" },
                ],
            },
            {
                id: "weather",
                label: "天气卡片",
                fields: [
                    { key: "sidebar.weather.enable", label: "显示天气卡片", type: "boolean" },
                    {
                        key: "sidebar.weather.enable_page",
                        label: "显示范围",
                        type: "text",
                        placeholder: "all",
                        hint: "all = 所有页面",
                    },
                    {
                        key: "sidebar.weather.rectangle",
                        label: "默认地区坐标",
                        type: "text",
                        placeholder: "112.6534116,27.96920845",
                        hint: "经度,纬度",
                    },
                    { key: "sidebar.weather.default_rectangle", label: "固定用默认地区", type: "boolean", hint: "开启后忽略访客定位" },
                    { key: "sidebar.weather.loading", label: "加载中动画图", type: "image" },
                    {
                        key: "sidebar.weather.qweather_api_host",
                        label: "和风天气 API 域名",
                        type: "text",
                        hint: "和风控制台里的专用域名（不含 key；key 属敏感项，不在此维护）",
                    },
                ],
            },
        ],
    },
    {
        id: "one-image",
        label: "页面大图",
        group: "外观配置",
        icon: GalleryHorizontalEnd,
        keywords: ["大图", "one_image", "OneImage", "背景图", "视频背景", "打字机", "一言", "首页", "归档", "分类", "标签", "hero"],
        desc: "首页 / 归档页 / 分类页 / 标签页顶部整屏大图（前台 one-image-hero.tsx 真实使用，四页字段一致）；桌面端与移动端可各配图片或视频。",
        groups: [
            { id: "home", label: "首页大图", fields: oneImagePageFields("home") },
            { id: "archives", label: "归档页大图", fields: oneImagePageFields("archives") },
            { id: "categories", label: "分类页大图", fields: oneImagePageFields("categories") },
            { id: "tags", label: "标签页大图", fields: oneImagePageFields("tags") },
            {
                id: "hitokoto",
                label: "一言与打字机",
                fields: [
                    {
                        key: "page.one_image.hitokoto_api",
                        label: "一言接口地址",
                        type: "text",
                        placeholder: "https://v1.hitokoto.cn/",
                        hint: "留空则用 https://v1.hitokoto.cn/；返回 JSON 里的 hitokoto 字段作为句子",
                    },
                    {
                        key: "page.one_image.typing_speed",
                        label: "打字速度",
                        type: "number",
                        placeholder: "100",
                        hint: "每个字的间隔（毫秒），留空或 0 时按 100 处理",
                    },
                ],
            },
        ],
    },
    {
        id: "footer",
        label: "页脚",
        group: "外观配置",
        icon: PanelBottom,
        keywords: ["页脚", "footer", "社交", "图标", "项目", "友链", "运行时间", "徽章", "kuma", "备案"],
        desc: "页脚社交栏、项目链接、底部信息条、运行时间与徽章。",
        groups: [
            {
                id: "social",
                label: "社交栏",
                fields: [
                    {
                        key: "footer.socialBar.left",
                        label: "左侧社交图标",
                        type: "list",
                        wide: true,
                        itemFields: [
                            { name: "title", label: "名称", placeholder: "GitHub" },
                            { name: "icon", label: "图标 class", placeholder: "iconfont icon-github" },
                            { name: "link", label: "链接", placeholder: "https://github.com/xxx" },
                        ],
                    },
                    {
                        key: "footer.socialBar.right",
                        label: "右侧社交图标",
                        type: "list",
                        wide: true,
                        itemFields: [
                            { name: "title", label: "名称" },
                            { name: "icon", label: "图标 class" },
                            { name: "link", label: "链接" },
                        ],
                    },
                    { key: "footer.socialBar.centerImg", label: "中间头像/图片", type: "image" },
                ],
            },
            {
                id: "project",
                label: "项目链接",
                fields: [
                    {
                        key: "footer.project.list",
                        label: "项目分组",
                        type: "list",
                        wide: true,
                        itemFields: [
                            { name: "title", label: "分组标题", placeholder: "项目" },
                            { name: "links", label: "分组内链接", nested: [{ name: "title", label: "标题" }, { name: "link", label: "链接" }] },
                        ],
                    },
                    { key: "footer.list.randomFriends", label: "随机友链数量", type: "number", placeholder: "3" },
                ],
            },
            {
                id: "bar",
                label: "底部信息条",
                fields: [
                    { key: "footer.owner.name", label: "站长名称", type: "text" },
                    { key: "footer.owner.since", label: "建站年份", type: "number", placeholder: "2024" },
                    { key: "footer.bar.authorLink", label: "作者链接", type: "text", placeholder: "https://github.com/xxx" },
                    { key: "footer.bar.cc.link", label: "CC 协议链接", type: "text", placeholder: "https://creativecommons.org/licenses/by-nc-sa/4.0/" },
                    {
                        key: "footer.bar.linkList",
                        label: "信息条链接",
                        type: "list",
                        wide: true,
                        itemFields: [
                            { name: "text", label: "文案" },
                            { name: "link", label: "链接" },
                        ],
                    },
                    { key: "footer.custom_text", label: "自定义文案", type: "textarea", wide: true },
                ],
            },
            {
                id: "runtime",
                label: "运行时间",
                fields: [
                    { key: "footer.runtime.enable", label: "显示运行时间", type: "boolean" },
                    { key: "footer.runtime.launch_time", label: "建站时间", type: "text", placeholder: "2024-01-01T00:00:00+08:00" },
                    { key: "footer.runtime.work_description", label: "工作时间文案", type: "text" },
                    { key: "footer.runtime.work_img", label: "工作状态图", type: "image" },
                    { key: "footer.runtime.offduty_description", label: "休息时间文案", type: "text" },
                    { key: "footer.runtime.offduty_img", label: "休息状态图", type: "image" },
                ],
            },
            {
                id: "badge",
                label: "徽章",
                fields: [
                    { key: "footer.badge.enable", label: "显示徽章", type: "boolean" },
                    {
                        key: "footer.badge.list",
                        label: "徽章列表",
                        type: "list",
                        wide: true,
                        itemFields: [
                            { name: "message", label: "左文案", placeholder: " Powered by" },
                            { name: "link", label: "跳转链接" },
                            { name: "shields", label: "shields.io 参数", placeholder: "badge/AnHeYu-v2-blue" },
                        ],
                    },
                ],
            },
            {
                id: "kuma",
                label: "Uptime Kuma",
                fields: [
                    { key: "footer.uptime_kuma.enable", label: "显示监控", type: "boolean" },
                    {
                        key: "footer.uptime_kuma.page_url",
                        label: "监控页地址",
                        type: "text",
                        placeholder: "https://status.example.com/status/main",
                        hint: "填完整状态页地址（含 /status/<slug>）：页脚的状态点会按它自动推导心跳接口，实时显示运行状态",
                    },
                ],
            },
        ],
    },
    {
        id: "post",
        label: "文章配置",
        group: "内容管理",
        icon: FileText,
        keywords: ["文章", "post", "代码块", "版权", "目录", "波浪", "404"],
        desc: "文章详情页的代码块、底部按钮、版权模板、目录锚点、波浪动效与 404 默认图。",
        groups: [
            {
                id: "code-block",
                label: "代码块",
                fields: [
                    { key: "post.code_block.code_max_lines", label: "折叠行数阈值", type: "number", placeholder: "15", hint: "超过该行数折叠，显示「展开」按钮" },
                    { key: "post.code_block.mac_style", label: "Mac 风格圆点", type: "boolean" },
                ],
            },
            {
                id: "copyright-buttons",
                label: "文章底部按钮",
                fields: [
                    { key: "post.copyright.show_reward_button", label: "显示打赏按钮", type: "boolean" },
                    { key: "post.copyright.show_share_button", label: "显示分享按钮", type: "boolean" },
                    { key: "post.copyright.show_subscribe_button", label: "显示订阅按钮", type: "boolean" },
                ],
            },
            {
                id: "copyright-template",
                label: "版权文案模板",
                fields: [
                    { key: "post.copyright.original_template", label: "原创模板", type: "textarea", wide: true },
                    { key: "post.copyright.reprint_template_with_url", label: "转载模板（带原链）", type: "textarea", wide: true },
                    { key: "post.copyright.reprint_template_without_url", label: "转载模板（无原链）", type: "textarea", wide: true },
                ],
            },
            {
                id: "copy",
                label: "复制版权",
                fields: [
                    { key: "post.copy.enable", label: "启用", type: "boolean" },
                    { key: "post.copy.copyright_enable", label: "追加版权信息", type: "boolean" },
                    { key: "post.copy.copyright_original", label: "原创追加文案", type: "textarea", wide: true },
                    { key: "post.copy.copyright_reprint", label: "转载追加文案", type: "textarea", wide: true },
                ],
            },
            {
                id: "default",
                label: "文章列表默认",
                fields: [
                    { key: "post.default.cover", label: "默认封面", type: "image" },
                    { key: "post.default.double_column", label: "双列布局", type: "boolean" },
                    { key: "post.default.enable_primary_color_tag", label: "标签用主题色", type: "boolean" },
                    { key: "post.default.page_size", label: "每页数量", type: "number" },
                ],
            },
            {
                id: "toc",
                label: "目录锚点",
                fields: [{ key: "post.toc.hash_update_mode", label: "锚点更新方式", type: "text", hint: "类型是字符串，取值待确认" }],
            },
            {
                id: "waves",
                label: "波浪动效",
                fields: [
                    {
                        key: "post.waves.enable",
                        label: "文章底部波浪动效",
                        type: "boolean",
                        hint: "正文卡片下方的一层装饰波浪（跟随主题色，系统开启「减少动态效果」时静止）",
                    },
                ],
            },
            {
                id: "page404",
                label: "404 页面",
                fields: [{ key: "post.page404.default_image", label: "默认配图", type: "image" }],
            },
            {
                id: "post-reading",
                label: "阅读增强",
                fields: [
                    { key: "post.reading_mode", label: "沉浸式阅读模式", type: "boolean", hint: "本站前台未实现，开启无效果" },
                    { key: "post.smooth_scroll", label: "平滑滚动", type: "boolean", hint: "本站前台未实现，开启无效果" },
                    { key: "post.chinese_conversion", label: "中文简繁转换", type: "boolean", hint: "本站前台未实现，开启无效果" },
                    { key: "post.comment_dialog", label: "评论弹窗模式", type: "boolean", hint: "本站前台未实现，开启无效果" },
                ],
            },
            {
                id: "post-subscribe",
                label: "文章订阅与过期",
                fields: [
                    { key: "post.subscribe.enable", label: "启用文章订阅功能", type: "boolean" },
                    { key: "post.subscribe.button_text", label: "订阅按钮文案", type: "text", hint: "本站前台未读取该键" },
                    { key: "post.subscribe.dialog_title", label: "订阅弹窗标题", type: "text", hint: "本站前台未读取该键" },
                    { key: "post.subscribe.dialog_desc", label: "订阅弹窗说明", type: "textarea", wide: true, hint: "本站前台未读取该键" },
                    {
                        key: "post.expiration_time",
                        label: "文章过期时间（天）",
                        type: "number",
                        hint: "超过该天数后前台提示「内容可能已过时」；0 表示不提示",
                    },
                ],
            },
        ],
    },
    {
        id: "features-register",
        label: "注册与外链",
        group: "高级功能",
        icon: UserPlus,
        keywords: ["注册", "用户注册", "开放注册", "外链", "跳转提示", "enable", "registration", "external"],
        desc: "开放用户注册与外链跳转提示页两个开关。",
        groups: [
            {
                id: "site-register",
                label: "站点与注册",
                fields: [
                    {
                        key: "ENABLE_REGISTRATION",
                        label: "开放用户注册",
                        type: "boolean",
                    },
                    {
                        key: "ENABLE_EXTERNAL_LINK_WARNING",
                        label: "外链跳转提示页",
                        type: "boolean",
                    },
                ],
            },
        ],
    },
    {
        id: "features-oauth",
        label: "第三方登录",
        group: "三方服务",
        icon: KeyRound,
        keywords: ["第三方登录", "oauth", "github", "google", "logto", "microsoft", "oidc", "qq", "rainbow", "微信登录"],
        desc: "GitHub / Google / Logto / Microsoft / OIDC / QQ / Rainbow / 微信 八种第三方登录的启用开关。",
        groups: [
            {
                id: "oauth",
                label: "第三方登录",
                fields: [
                    { key: "oauth.github.enable", label: "启用 GitHub 登录", type: "boolean" },
                    { key: "oauth.google.enable", label: "启用 Google 登录", type: "boolean" },
                    { key: "oauth.logto.enable", label: "启用 Logto 登录", type: "boolean" },
                    { key: "oauth.microsoft.enable", label: "启用 Microsoft 登录", type: "boolean" },
                    { key: "oauth.oidc.enable", label: "启用 OIDC 登录", type: "boolean" },
                    { key: "oauth.qq.enable", label: "启用 QQ 登录", type: "boolean" },
                    { key: "oauth.rainbow.enable", label: "启用 Rainbow 登录", type: "boolean" },
                    { key: "oauth.wechat.enable", label: "启用微信登录", type: "boolean" },
                ],
            },
            {
                id: "oauth-name",
                label: "登录按钮名称",
                fields: [
                    { key: "oauth.github.display_name", label: "GitHub", type: "text", placeholder: "GitHub" },
                    { key: "oauth.google.display_name", label: "Google", type: "text", placeholder: "Google" },
                    { key: "oauth.logto.display_name", label: "Logto", type: "text", placeholder: "Logto" },
                    { key: "oauth.microsoft.display_name", label: "Microsoft", type: "text", placeholder: "Microsoft" },
                    { key: "oauth.oidc.display_name", label: "OIDC", type: "text", placeholder: "OIDC" },
                    { key: "oauth.qq.display_name", label: "QQ", type: "text", placeholder: "QQ" },
                    { key: "oauth.rainbow.display_name", label: "Rainbow", type: "text", placeholder: "Rainbow" },
                    { key: "oauth.wechat.display_name", label: "微信", type: "text", placeholder: "微信" },
                ],
            },
            {
                id: "oauth-rainbow",
                label: "Rainbow 附加配置",
                fields: [
                    { key: "oauth.rainbow.callback_url", label: "回调地址", type: "text", placeholder: "https://example.com/callback" },
                    { key: "oauth.rainbow.login_methods", label: "登录方式", type: "text" },
                ],
            },
        ],
    },
    {
        id: "features-comment",
        label: "评论系统",
        group: "用户通知",
        icon: MessageSquare,
        keywords: ["评论", "comment", "互动", "多作者", "multi_author", "违禁词", "审核", "待审", "限流", "通知", "邮件"],
        desc: "评论区行为：开关、显示项、输入限制与身份文案，以及评论审核（违禁词/限流/AI 检测）、评论通知与评论专用 SMTP、文章多作者。",
        groups: [
            {
                id: "comment-switch",
                label: "评论开关",
                fields: [
                    { key: "comment.enable", label: "启用评论功能", type: "boolean" },
                    { key: "comment.login_required", label: "登录后才能评论", type: "boolean" },
                    { key: "comment.allow_image_upload", label: "允许评论传图", type: "boolean", hint: "关闭后评论框不显示传图按钮；图片存进名为 comment_image 的存储策略（默认落在 data/storage/comment_image，可在「存储策略」里改）" },
                    { key: "comment.barrage_enable", label: "弹幕模式", type: "boolean" },
                    { key: "comment.random_praise", label: "随机精选评论", type: "boolean", hint: "本站前台未读取该键" },
                ],
            },
            {
                id: "comment-display",
                label: "评论显示",
                fields: [
                    { key: "comment.page_size", label: "每页评论数", type: "number", placeholder: "10" },
                    { key: "comment.show_ua", label: "显示 UA（浏览器/系统）", type: "boolean" },
                    { key: "comment.show_region", label: "显示 IP 归属地", type: "boolean" },
                    { key: "comment.master_tag", label: "博主标签文案", type: "text", placeholder: "博主" },
                ],
            },
            {
                id: "comment-input",
                label: "评论输入与身份",
                fields: [
                    { key: "comment.placeholder", label: "输入框占位文案", type: "textarea", wide: true },
                    { key: "comment.limit_length", label: "单条最大字数", type: "number", placeholder: "10000" },
                    { key: "comment.emoji_cdn", label: "表情包配置地址", type: "text", hint: "Twikoo/表情包 JSON 的地址" },
                    { key: "comment.blogger_email", label: "博主邮箱", type: "text", hint: "判断「博主」标识用" },
                    { key: "comment.anonymous_email", label: "匿名邮箱", type: "text", hint: "留空使用默认" },
                ],
            },
            {
                // 审核与限流：后端早已支持（comment.forbidden_words 命中即落「待审核」，前台不展示），
                // 但这批键 IsPublic=false、此前设置页完全没暴露，等于功能存在却没人能配。
                // 键名与默认值取自后端 internal/configdef/definition.go（2026-10 上游 main）。
                id: "comment-moderation",
                label: "审核与限流",
                fields: [
                    {
                        key: "comment.forbidden_words",
                        label: "评论违禁词（命中转待审）",
                        type: "textarea",
                        rows: 4,
                        wide: true,
                        remoteOnly: true,
                        placeholder: "空包,代发,刷单",
                        hint: "英文逗号分隔。命中的评论不会直接公开，而是进入「待审核」，管理员在评论管理里通过后才对外展示。",
                    },
                    {
                        key: "comment.nickname_forbidden_words",
                        label: "昵称违禁词（命中直接拒绝）",
                        type: "textarea",
                        rows: 3,
                        wide: true,
                        remoteOnly: true,
                        placeholder: "广告,代刷",
                        hint: "换行或中英文逗号分隔，不区分大小写。命中时评论会被直接拒绝并提示「昵称包含违禁词」——需要后端 ≥ 2026-10-20（commit 1b89fcc）才生效。",
                    },
                    {
                        key: "comment.limit_per_minute",
                        label: "单 IP 每分钟评论数",
                        type: "number",
                        remoteOnly: true,
                        placeholder: "5",
                        hint: "超过阈值的提交会被后端拒绝；留空或 0 表示不限制。",
                    },
                    {
                        key: "comment.ai_detect_enable",
                        label: "启用 AI 违禁词检测",
                        type: "boolean",
                        remoteOnly: true,
                        hint: "调用外部 AI 接口判断评论风险（会把你配置的接口地址发出去，注意隐私）。",
                    },
                    {
                        key: "comment.ai_detect_api_url",
                        label: "AI 检测接口地址",
                        type: "text",
                        remoteOnly: true,
                        placeholder: "https://v1.nsuuu.com/api/AiDetect",
                    },
                    {
                        key: "comment.ai_detect_action",
                        label: "AI 判定后的处理",
                        type: "select",
                        remoteOnly: true,
                        options: [
                            { value: "pending", label: "转待审核" },
                            { value: "reject", label: "直接拒绝" },
                        ],
                    },
                    {
                        key: "comment.ai_detect_risk_level",
                        label: "触发处理的最低风险等级",
                        type: "select",
                        remoteOnly: true,
                        options: [
                            { value: "high", label: "仅高风险" },
                            { value: "medium", label: "中高风险（默认）" },
                            { value: "low", label: "所有风险" },
                        ],
                    },
                ],
            },
            {
                // 评论通知：comment.notify_admin 后端默认 false —— 这是「有人评论却收不到邮件」的常见原因。
                id: "comment-notify",
                label: "评论通知",
                fields: [
                    {
                        key: "comment.notify_admin",
                        label: "新评论邮件通知博主",
                        type: "boolean",
                        remoteOnly: true,
                        hint: "后端默认关闭。要收到「有新评论」的邮件，必须打开这个开关（并配好下面的邮件服务）。",
                    },
                    {
                        key: "comment.notify_reply",
                        label: "评论被回复时通知对方",
                        type: "boolean",
                        remoteOnly: true,
                    },
                    {
                        key: "comment.mail_subject",
                        label: "回复通知邮件主题",
                        type: "text",
                        wide: true,
                        remoteOnly: true,
                        placeholder: "您在 [{{.SITE_NAME}}] 上的评论收到了新回复",
                    },
                    {
                        key: "comment.mail_subject_admin",
                        label: "博主通知邮件主题",
                        type: "text",
                        wide: true,
                        remoteOnly: true,
                        placeholder: "您的博客 [{{.SITE_NAME}}] 上有新评论了",
                    },
                    {
                        key: "comment.mail_template",
                        label: "回复通知邮件模板（HTML）",
                        type: "textarea",
                        rows: 10,
                        wide: true,
                        remoteOnly: true,
                        hint: "留空使用后端内置模板；改动前建议先复制备份。",
                    },
                    {
                        key: "comment.mail_template_admin",
                        label: "博主通知邮件模板（HTML）",
                        type: "textarea",
                        rows: 10,
                        wide: true,
                        remoteOnly: true,
                        hint: "留空使用后端内置模板。",
                    },
                ],
            },
            {
                // 评论专用 SMTP（后端注释：独立于系统 SMTP，用于评论通知；留空则回落到「邮件服务」那套 SMTP_*）
                id: "comment-smtp",
                label: "评论专用 SMTP（可选）",
                fields: [
                    {
                        key: "comment.smtp_host",
                        label: "SMTP 主机",
                        type: "text",
                        remoteOnly: true,
                        placeholder: "smtp.qq.com",
                        hint: "留空则使用「邮件服务」里的系统 SMTP 配置。",
                    },
                    {
                        key: "comment.smtp_port",
                        label: "SMTP 端口",
                        type: "text",
                        remoteOnly: true,
                        placeholder: "465",
                    },
                    {
                        key: "comment.smtp_user",
                        label: "用户名",
                        type: "text",
                        remoteOnly: true,
                        placeholder: "user@example.com",
                    },
                    {
                        key: "comment.smtp_pass",
                        label: "密码 / 授权码",
                        type: "password",
                        remoteOnly: true,
                        sensitive: true,
                        hint: "已配置时显示掩码；只填新值即覆盖。",
                    },
                    {
                        key: "comment.smtp_sender_name",
                        label: "发件人名称",
                        type: "text",
                        remoteOnly: true,
                    },
                    {
                        key: "comment.smtp_sender_email",
                        label: "发件人邮箱",
                        type: "text",
                        remoteOnly: true,
                        hint: "建议与用户名一致，否则容易被判为垃圾邮件。",
                    },
                    {
                        key: "comment.smtp_secure",
                        label: "强制 SSL",
                        type: "boolean",
                        remoteOnly: true,
                        hint: "465 端口一般开，587（STARTTLS）一般关。",
                    },
                ],
            },
            {
                id: "comment-multi-author",
                label: "文章多作者",
                fields: [
                    { key: "article.multi_author.enable", label: "启用文章多作者", type: "boolean" },
                    { key: "article.multi_author.need_review", label: "多作者需要审核", type: "boolean", hint: "本站前台未读取该键" },
                ],
            },
        ],
    },
    {
        id: "features-email",
        label: "邮件服务",
        group: "用户通知",
        icon: Mail,
        keywords: ["邮件", "email", "mail", "smtp", "发信", "授权码", "激活", "密码重置", "通知"],
        desc: "SMTP 发信配置与系统邮件模板（密码重置、账号激活）。这批键只存在后台设置里，不随公开站点配置下发。",
        groups: [
            {
                // 键名与后端 constant.SettingKey 一一对应（pkg/constant/setting.go 的 KeySmtp*），
                // 标签/取值建议照官方 EmailSettingsForm.tsx 抄，避免与官方后台对不上。
                id: "mail-smtp",
                label: "SMTP 配置",
                fields: [
                    {
                        key: "SMTP_HOST",
                        label: "SMTP 主机",
                        type: "text",
                        remoteOnly: true,
                        placeholder: "smtp.qq.com",
                        hint: "QQ / 163 需先在邮箱设置里开启 SMTP 服务",
                    },
                    {
                        key: "SMTP_PORT",
                        label: "SMTP 端口",
                        type: "text",
                        remoteOnly: true,
                        placeholder: "465",
                        hint: "SSL 常用 465，STARTTLS 常用 587",
                    },
                    {
                        key: "SMTP_USERNAME",
                        label: "用户名",
                        type: "text",
                        remoteOnly: true,
                        placeholder: "user@example.com",
                        hint: "一般就是完整邮箱地址",
                    },
                    {
                        key: "SMTP_PASSWORD",
                        label: "密码 / 授权码",
                        type: "password",
                        remoteOnly: true,
                        // sensitive：回显是掩码、没改动就不提交，避免把 ******** 写回后端
                        sensitive: true,
                        placeholder: "SMTP 授权码（不是邮箱登录密码）",
                        hint: "已配置时显示为掩码；只填新值即覆盖",
                    },
                    {
                        key: "SMTP_SENDER_NAME",
                        label: "发件人名称",
                        type: "text",
                        remoteOnly: true,
                        placeholder: "安和鱼",
                    },
                    {
                        key: "SMTP_SENDER_EMAIL",
                        label: "发件人邮箱",
                        type: "text",
                        remoteOnly: true,
                        placeholder: "user@example.com",
                        hint: "建议与 SMTP 用户名一致，否则易被判为垃圾邮件",
                    },
                    {
                        key: "SMTP_REPLY_TO_EMAIL",
                        label: "回复邮箱",
                        type: "text",
                        remoteOnly: true,
                        placeholder: "reply@example.com",
                        hint: "收件人点「回复」时的收件地址；留空用发件人邮箱",
                    },
                    {
                        key: "SMTP_FORCE_SSL",
                        label: "强制 SSL",
                        type: "boolean",
                        remoteOnly: true,
                        hint: "465 端口一般要开；587（STARTTLS）一般不开",
                    },
                ],
            },
            {
                id: "mail-reset-password",
                label: "密码重置邮件",
                fields: [
                    {
                        key: "DEFAULT_RESET_PASSWORD_SUBJECT",
                        label: "邮件主题",
                        type: "text",
                        remoteOnly: true,
                        placeholder: "【{{.AppName}}】重置您的账户密码",
                        hint: "可用变量 {{.AppName}}",
                    },
                    {
                        key: "DEFAULT_RESET_PASSWORD_TEMPLATE",
                        label: "邮件模板（HTML）",
                        type: "textarea",
                        remoteOnly: true,
                        wide: true,
                        rows: 10,
                        hint: "变量：{{.Nickname}} {{.AppName}} {{.ResetLink}} {{.ExpireMinutes}}",
                    },
                ],
            },
            {
                id: "mail-activate",
                label: "账号激活邮件",
                fields: [
                    {
                        key: "ENABLE_USER_ACTIVATION",
                        label: "启用账号激活",
                        type: "boolean",
                        remoteOnly: true,
                        hint: "开启后注册的新账号需点邮件链接激活才能登录",
                    },
                    {
                        key: "DEFAULT_ACTIVATE_ACCOUNT_SUBJECT",
                        label: "邮件主题",
                        type: "text",
                        remoteOnly: true,
                        placeholder: "【{{.AppName}}】激活您的账户",
                        hint: "可用变量 {{.AppName}}",
                    },
                    {
                        key: "DEFAULT_ACTIVATE_ACCOUNT_TEMPLATE",
                        label: "邮件模板（HTML）",
                        type: "textarea",
                        remoteOnly: true,
                        wide: true,
                        rows: 10,
                        hint: "变量：{{.Nickname}} {{.AppName}} {{.ActivateLink}} {{.ExpireMinutes}}",
                    },
                ],
            },
        ],
    },
    {
        id: "features-media",
        label: "文件处理",
        group: "内容管理",
        icon: FileImage,
        keywords: ["媒体", "媒体处理", "缩略图", "生成器", "EXIF", "音乐", "封面", "FFmpeg", "VIPS", "LibRaw"],
        desc: "上传与媒体处理管线：各生成器开关、体积上限与支持的扩展名（都由后端处理，本站前台不读取）。",
        groups: [
            {
                id: "upload",
                label: "上传限制与默认参数",
                fields: [
                    { key: "UPLOAD_ALLOWED_EXTENSIONS", label: "允许上传的扩展名", type: "text", placeholder: "留空表示不限制；逗号分隔", hint: "留空=按黑名单，填了=只允许这些" },
                    { key: "UPLOAD_DENIED_EXTENSIONS", label: "禁止上传的扩展名", type: "text", placeholder: "逗号分隔" },
                    { key: "BUILTIN_MAX_FILE_SIZE", label: "内置处理体积上限（字节）", type: "number", hint: "78643200 = 75 MB" },
                    { key: "BUILTIN_DIRECT_SERVE_EXTS", label: "直出扩展名", type: "text", placeholder: "avif,webp", hint: "这些格式不转码、直接返回原文件" },
                    { key: "DEFAULT_BIG_PARAM", label: "默认大图参数", type: "text" },
                    { key: "DEFAULT_THUMB_PARAM", label: "默认缩略图参数", type: "text" },
                ],
            },
            {
                id: "media-builtin",
                label: "内置缩略图生成器",
                fields: [{ key: "ENABLE_BUILTIN_GENERATOR", label: "启用内置生成器", type: "boolean" }],
            },
            {
                id: "media-vips",
                label: "VIPS 缩略图生成器",
                fields: [
                    { key: "ENABLE_VIPS_GENERATOR", label: "启用 VIPS 生成器", type: "boolean" },
                    { key: "VIPS_MAX_FILE_SIZE", label: "体积上限（字节）", type: "number" },
                    { key: "VIPS_SUPPORTED_EXTS", label: "支持的扩展名", type: "textarea", wide: true, hint: "逗号分隔；VIPS 处理 RAW 等格式" },
                ],
            },
            {
                id: "media-ffmpeg",
                label: "FFmpeg 视频缩略图",
                fields: [
                    { key: "ENABLE_FFMPEG_GENERATOR", label: "启用 FFmpeg 生成器", type: "boolean" },
                    { key: "FFMPEG_MAX_FILE_SIZE", label: "体积上限（字节）", type: "number", hint: "10737418240 = 10 GB" },
                    { key: "FFMPEG_CAPTURE_TIME", label: "截帧时间点", type: "text", placeholder: "00:00:01.00" },
                    { key: "FFMPEG_SUPPORTED_EXTS", label: "支持的扩展名", type: "textarea", wide: true, hint: "逗号分隔" },
                ],
            },
            {
                id: "media-libraw",
                label: "LibRaw 相机 RAW 缩略图",
                fields: [
                    { key: "ENABLE_LIBRAW_GENERATOR", label: "启用 LibRaw 生成器", type: "boolean" },
                    { key: "LIBRAW_MAX_FILE_SIZE", label: "体积上限（字节）", type: "number" },
                    { key: "LIBRAW_SUPPORTED_EXTS", label: "支持的扩展名", type: "textarea", wide: true, hint: "逗号分隔" },
                ],
            },
            {
                id: "media-exif",
                label: "EXIF 提取",
                fields: [
                    { key: "ENABLE_EXIF_EXTRACTOR", label: "启用 EXIF 提取", type: "boolean" },
                    { key: "EXIF_MAX_SIZE_LOCAL", label: "本地文件体积上限（字节）", type: "number" },
                    { key: "EXIF_MAX_SIZE_REMOTE", label: "远端文件体积上限（字节）", type: "number" },
                    { key: "EXIF_USE_BRUTE_FORCE", label: "暴力扫描（慢但更全）", type: "boolean" },
                ],
            },
            {
                id: "media-music",
                label: "音乐封面与元数据",
                fields: [
                    { key: "ENABLE_MUSIC_COVER_GENERATOR", label: "启用歌曲封面提取", type: "boolean" },
                    { key: "MUSIC_COVER_MAX_FILE_SIZE", label: "封面体积上限（字节）", type: "number" },
                    { key: "MUSIC_COVER_SUPPORTED_EXTS", label: "封面支持的扩展名", type: "text", placeholder: "mp3,m4a,ogg,flac" },
                    { key: "ENABLE_MUSIC_EXTRACTOR", label: "启用音乐元数据提取", type: "boolean" },
                    { key: "MUSIC_MAX_SIZE_LOCAL", label: "本地音乐体积上限（字节）", type: "number" },
                    { key: "MUSIC_MAX_SIZE_REMOTE", label: "远端音乐体积上限（字节）", type: "number" },
                ],
            },
        ],
    },
    {
        id: "features-ai",
        label: "AI 功能",
        group: "高级功能",
        icon: Sparkles,
        keywords: [
            "AI",
            "ai_assistant",
            "ai_podcast",
            "ai_writing",
            "ai_summary",
            "AI 助手",
            "AI 播客",
            "AI 写作",
            "AI 摘要",
            "podcast",
            "prompt",
            "embedding",
            "向量",
        ],
        desc: "AI 摘要 / 写作 / 播客 / 助手与检索增强（PRO）。凭据类字段只写不回显；未单独配置的模块沿用后端默认。",
        groups: [
            {
                // 整块交给 src/components/admin/ai-settings-panel.tsx 渲染（官方 AI 设置面板的分模块布局）。
                // 字段仍逐个登记在这里：草稿基线、改动判定、保存载荷都复用 settings-manager 的既有机制。
                id: "ai-panel",
                label: "AI 配置",
                fields: [
                    // ---------- AI 摘要（PRO，官方扁平键名） ----------
                    {
                        key: "ai_summary_provider",
                        label: "提供商",
                        type: "ai",
                        aiModule: "summary",
                        aiControl: "select",
                        options: AI_PROVIDER_OPTIONS,
                        placeholder: "请选择提供商",
                    },
                    {
                        key: "ai_summary_api_key",
                        label: "API Key",
                        type: "ai",
                        aiModule: "summary",
                        aiControl: "password",
                        sensitive: true,
                        placeholder: "留空使用全局 API Key",
                    },
                    {
                        key: "ai_summary_api_url",
                        label: "API URL",
                        type: "ai",
                        aiModule: "summary",
                        aiControl: "text",
                        placeholder: "https://api.openai.com/v1",
                    },
                    {
                        key: "ai_summary_model",
                        label: "模型",
                        type: "ai",
                        aiModule: "summary",
                        aiControl: "model",
                        hint: "可从列表选择，也可直接输入自定义模型名称",
                    },
                    {
                        key: "ai_summary_system_prompt",
                        label: "System Prompt",
                        type: "ai",
                        aiModule: "summary",
                        aiControl: "textarea",
                        wide: true,
                    },

                    // ---------- AI 写作（PRO，官方扁平键名） ----------
                    {
                        key: "ai_writing_provider",
                        label: "提供商",
                        type: "ai",
                        aiModule: "writing",
                        aiControl: "select",
                        options: AI_PROVIDER_OPTIONS,
                        placeholder: "请选择提供商",
                    },
                    {
                        key: "ai_writing_api_key",
                        label: "API Key",
                        type: "ai",
                        aiModule: "writing",
                        aiControl: "password",
                        sensitive: true,
                        placeholder: "留空使用全局 API Key",
                    },
                    {
                        key: "ai_writing_api_url",
                        label: "API URL",
                        type: "ai",
                        aiModule: "writing",
                        aiControl: "text",
                        placeholder: "https://api.openai.com/v1",
                    },
                    {
                        key: "ai_writing_model",
                        label: "模型",
                        type: "ai",
                        aiModule: "writing",
                        aiControl: "model",
                        hint: "可从列表选择，也可直接输入自定义模型名称",
                    },
                    {
                        key: "ai_writing_max_tokens",
                        label: "Max Tokens",
                        type: "ai",
                        aiModule: "writing",
                        aiControl: "number",
                        placeholder: "4096",
                    },
                    {
                        key: "ai_writing_temperature",
                        label: "Temperature",
                        type: "ai",
                        aiModule: "writing",
                        aiControl: "number",
                        placeholder: "0.7",
                    },
                    {
                        key: "ai_writing_system_prompt",
                        label: "System Prompt",
                        type: "ai",
                        aiModule: "writing",
                        aiControl: "textarea",
                        wide: true,
                    },

                    // ---------- AI 播客（PRO；凭据键 app_id / access_key / resource_id 按政策不在此维护） ----------
                    {
                        key: "ai_podcast.enable",
                        label: "启用 AI 播客",
                        type: "boolean",
                        aiModule: "podcast",
                        hint: "开启后文章页将显示 AI 播客生成按钮",
                    },
                    {
                        key: "ai_podcast.provider",
                        label: "提供商",
                        type: "ai",
                        aiModule: "podcast",
                        aiControl: "select",
                        options: AI_PODCAST_PROVIDER_OPTIONS,
                        placeholder: "请选择提供商",
                        hint: "当前播客能力基于火山引擎豆包语音服务",
                    },
                    {
                        key: "ai_podcast.speaker1",
                        label: "说话人 1",
                        type: "ai",
                        aiModule: "podcast",
                        aiControl: "select",
                        options: AI_PODCAST_SPEAKER_OPTIONS,
                        placeholder: "请选择音色",
                    },
                    {
                        key: "ai_podcast.speaker2",
                        label: "说话人 2",
                        type: "ai",
                        aiModule: "podcast",
                        aiControl: "select",
                        options: AI_PODCAST_SPEAKER_OPTIONS,
                        placeholder: "请选择音色",
                    },
                    { key: "ai_podcast.use_head_music", label: "使用片头音乐", type: "boolean", aiModule: "podcast" },
                    { key: "ai_podcast.use_tail_music", label: "使用片尾音乐", type: "boolean", aiModule: "podcast" },
                    {
                        key: "ai_podcast.audio_format",
                        label: "音频格式",
                        type: "ai",
                        aiModule: "podcast",
                        aiControl: "select",
                        options: AI_PODCAST_AUDIO_FORMAT_OPTIONS,
                        placeholder: "请选择格式",
                    },
                    {
                        key: "ai_podcast.sample_rate",
                        label: "采样率",
                        type: "ai",
                        aiModule: "podcast",
                        aiControl: "select",
                        options: AI_PODCAST_SAMPLE_RATE_OPTIONS,
                        placeholder: "请选择采样率",
                    },
                    {
                        key: "ai_podcast.speech_rate",
                        label: "语速",
                        type: "ai",
                        aiModule: "podcast",
                        aiControl: "number",
                        placeholder: "0",
                        hint: "豆包语音的 speech_rate，0 为正常语速",
                    },
                    {
                        key: "ai_podcast.button_text",
                        label: "按钮文案",
                        type: "ai",
                        aiModule: "podcast",
                        aiControl: "text",
                        placeholder: "AI 播客",
                    },
                    {
                        key: "ai_podcast.button_icon",
                        label: "按钮图标",
                        type: "ai",
                        aiModule: "podcast",
                        aiControl: "text",
                        placeholder: "ri:mic-fill",
                        hint: "官方用 iconify 名（ri:xxx）；本站前台没有该图标源，会退化为 lucide 麦克风图标",
                    },

                    // ---------- AI 助手（PRO） ----------
                    {
                        key: "ai_assistant.enable",
                        label: "启用 AI 助手",
                        type: "boolean",
                        aiModule: "assistant",
                        hint: "开启后站点将显示 AI 助手入口",
                    },
                    { key: "ai_assistant.name", label: "助手名称", type: "ai", aiModule: "assistant", aiControl: "text", placeholder: "AI 助手" },
                    { key: "ai_assistant.welcome", label: "欢迎语", type: "ai", aiModule: "assistant", aiControl: "textarea", wide: true },
                    {
                        key: "ai_assistant.chat_suggestions",
                        label: "对话建议",
                        type: "stringlist",
                        aiModule: "assistant",
                        placeholder: "一条建议问题",
                        hint: "前台助手面板里的「常见问题」快捷提问，每行一条",
                    },
                    {
                        key: "ai_assistant.search_suggestions",
                        label: "搜索建议",
                        type: "stringlist",
                        aiModule: "assistant",
                        placeholder: "一条建议",
                        hint: "前台助手面板里的「去站内搜索」快捷词，每行一条",
                    },
                    {
                        key: "ai_assistant.embedding_provider",
                        label: "向量化服务商",
                        type: "ai",
                        aiModule: "assistant",
                        aiControl: "select",
                        options: AI_EMBEDDING_PROVIDER_OPTIONS,
                        placeholder: "请选择向量化服务商",
                    },
                    {
                        key: "ai_assistant.embedding_api_key",
                        label: "向量化 API Key",
                        type: "ai",
                        aiModule: "assistant",
                        aiControl: "password",
                        sensitive: true,
                        placeholder: "已配置则留空不修改",
                    },
                    {
                        key: "ai_assistant.embedding_model",
                        label: "向量化模型",
                        type: "ai",
                        aiModule: "assistant",
                        aiControl: "model",
                        hint: "可从列表选择，也可直接输入自定义模型名称",
                    },
                    {
                        key: "ai_assistant.vector_store",
                        label: "向量库",
                        type: "ai",
                        aiModule: "assistant",
                        aiControl: "select",
                        options: AI_VECTOR_STORE_OPTIONS,
                        placeholder: "请选择向量库",
                    },
                    {
                        key: "ai_assistant.system_prompt",
                        label: "System Prompt",
                        type: "ai",
                        aiModule: "assistant",
                        aiControl: "textarea",
                        wide: true,
                    },
                    {
                        key: "ai_assistant.user_prompt",
                        label: "User Prompt（带上下文）",
                        type: "ai",
                        aiModule: "assistant",
                        aiControl: "textarea",
                        wide: true,
                    },
                    {
                        key: "ai_assistant.no_context_prompt",
                        label: "No Context Prompt（无检索结果）",
                        type: "ai",
                        aiModule: "assistant",
                        aiControl: "textarea",
                        wide: true,
                    },
                ],
            },
        ],
    },
    {
        id: "features-captcha",
        label: "人机验证",
        group: "高级功能",
        icon: ShieldCheck,
        keywords: ["人机验证", "验证", "turnstile", "cloudflare", "captcha"],
        desc: "验证服务选择与图片验证码参数；Turnstile 的 site key 属敏感项，不在此维护。",
        warning:
            "⚠️ 前台评论表单尚未接入任何验证码（既没有 /public/captcha/image 控件，提交也不带 captcha_id）。线上当前 captcha.provider = none；一旦改成 geetest / turnstile，评论提交会被后端拒绝，且前台没有任何提示。要开请先让前端接上验证码组件（见 docs/api-known-issues.md）。",
        groups: [
            {
                id: "captcha-provider",
                label: "验证方式",
                fields: [
                    {
                        key: "captcha.provider",
                        label: "验证服务",
                        type: "select",
                        options: [
                            { value: "none", label: "不启用" },
                            { value: "geetest", label: "极验 Geetest" },
                            { value: "turnstile", label: "Cloudflare Turnstile" },
                        ],
                    },
                    {
                        key: "turnstile.enable",
                        label: "启用 Cloudflare Turnstile",
                        type: "boolean",
                        hint: "后端注释：已废弃，请改用上面的「验证服务」",
                    },
                ],
            },
            {
                id: "image-captcha",
                label: "图片验证码",
                fields: [
                    { key: "image_captcha.length", label: "验证码位数", type: "number", placeholder: "4" },
                    { key: "image_captcha.expire", label: "有效期（秒）", type: "number", placeholder: "300" },
                ],
            },
        ],
    },
    {
        id: "features-share",
        label: "微信分享",
        group: "高级功能",
        icon: Share2,
        keywords: ["微信分享", "分享", "share", "wechat"],
        desc: "文章与页面的微信分享功能开关。",
        groups: [
            {
                id: "share",
                label: "微信分享",
                fields: [
                    { key: "wechat.share.enable", label: "启用微信分享功能", type: "boolean" },
                ],
            },
        ],
    },
    {
        id: "features-misc",
        label: "其它开关",
        group: "高级功能",
        icon: SlidersHorizontal,
        keywords: ["其它", "开关", "音乐播放器", "music", "社区问答", "烟花", "fireworks", "community_qa"],
        desc: "零散的功能开关与文案：音乐播放器、社区问答、节庆烟花入口及其按钮/祝福文案。",
        groups: [
            {
                id: "misc",
                label: "其它",
                fields: [
                    { key: "music.player.enable", label: "启用音乐播放器功能", type: "boolean" },
                    { key: "community_qa.enable", label: "启用社区问答", type: "boolean", hint: "本站前台未读取该键" },
                    { key: "fireworks.enable", label: "启用节庆烟花入口", type: "boolean", hint: "本站前台未读取该键" },
                    { key: "DISABLE_RIGHT_MENU", label: "隐藏右侧悬浮菜单", type: "boolean", hint: "本站前台用的是自己的悬浮按钮组，未读取该键" },
                ],
            },
            {
                id: "fireworks-text",
                label: "节庆烟花文案",
                fields: [
                    { key: "fireworks.button_text", label: "按钮文案", type: "text", placeholder: "节日快乐" },
                    { key: "fireworks.message", label: "祝福文案", type: "textarea", wide: true },
                ],
            },
        ],
    },
    {
        id: "features-payment",
        label: "支付配置",
        group: "高级功能",
        icon: CreditCard,
        keywords: ["支付", "payment", "支付宝", "alipay", "微信支付", "wechat", "易支付", "epay", "虎皮椒", "hupijiao", "回调"],
        desc: "PRO 支付通道：支付宝 / 微信支付 / 易支付 / 虎皮椒的密钥、回调地址、启停与连接测试。",
        groups: [
            {
                // 整块交给 PaymentSettingsPanel 渲染（每种支付方式有自己的字段集合、
                // 保存接口、启停与测试动作，逐字段塞进通用表单表达不了）。
                // 这里登记一个占位字段，只为了让它能进搜索索引、「本组 N 项」有东西可数；
                // 该键不会进草稿，也不会被保存。
                id: "payment-panel",
                label: "支付通道",
                fields: [
                    {
                        key: "payment.__panel",
                        label: "支付通道（支付宝 / 微信支付 / 易支付 / 虎皮椒）",
                        type: "payment",
                    },
                ],
            },
        ],
    },
    {
        id: "about",
        label: "关于页面",
        group: "页面显示",
        icon: UserRound,
        keywords: ["关于", "about", "自我介绍", "技能", "性格", "座右铭", "生涯", "追番", "音乐", "地图"],
        desc: "关于页的全部文案与模块开关：头像区、自我介绍、技能图标、统计、地图、性格、座右铭、Buff、游戏、追番、技术偏好、音乐。",
        groups: [
            {
                id: "creativity",
                label: "技能展示图标",
                fields: [
                    {
                        key: "CREATIVITY.creativity_list",
                        label: "技能图标列表",
                        type: "list",
                        itemFields: [
                            { name: "name", label: "名称", placeholder: "Vue" },
                            { name: "icon", label: "图标地址", placeholder: "图片地址" },
                            { name: "color", label: "底色", type: "color", placeholder: "#39c5bb" },
                        ],
                    },
                ],
            },
            {
                id: "creativity-text",
                label: "技能展示标题",
                fields: [
                    { key: "CREATIVITY.title", label: "标题", type: "text" },
                    { key: "CREATIVITY.subtitle", label: "副标题", type: "text" },
                ],
            },
            {
                id: "hero",
                label: "关于页头部",
                fields: [
                    { key: "about.page.name", label: "名字", type: "text" },
                    { key: "about.page.description", label: "一句话介绍", type: "textarea", wide: true },
                    { key: "about.page.avatar_img", label: "头像", type: "image", hint: "站点信息里填了站长头像时以站长头像优先" },
                    { key: "about.page.statistics_background", label: "统计卡片背景图", type: "image" },
                ],
            },
            {
                id: "hero-subtitle",
                label: "关于页副标题",
                fields: [{ key: "about.page.subtitle", label: "副标题", type: "text" }],
            },
            {
                id: "self-info",
                label: "个人信息",
                fields: [
                    { key: "about.page.self_info.tips1", label: "标签一", type: "text", placeholder: "生于" },
                    { key: "about.page.self_info.contentYear", label: "标签一内容", type: "text", placeholder: "2000" },
                    { key: "about.page.self_info.tips2", label: "标签二", type: "text", placeholder: "毕业于" },
                    { key: "about.page.self_info.content2", label: "标签二内容", type: "text" },
                    { key: "about.page.self_info.tips3", label: "标签三", type: "text", placeholder: "现在职业" },
                    { key: "about.page.self_info.content3", label: "标签三内容", type: "text" },
                ],
            },
            {
                id: "personalities",
                label: "性格与照片",
                fields: [
                    { key: "about.page.personalities.tips", label: "小字提示", type: "text" },
                    { key: "about.page.personalities.authorName", label: "昵称", type: "text" },
                    { key: "about.page.personalities.nameUrl", label: "昵称跳转链接", type: "text" },
                    { key: "about.page.personalities.personalityType", label: "性格类型", type: "text", placeholder: "INFP" },
                    { key: "about.page.personalities.personalityTypeColor", label: "性格类型颜色", type: "color", placeholder: "#ac899c" },
                    { key: "about.page.personalities.personalityImg", label: "性格配图", type: "image" },
                    { key: "about.page.personalities.photoUrl", label: "照片", type: "image" },
                ],
            },
            {
                id: "about-site-tips",
                label: "站点关键词轮播",
                fields: [
                    { key: "about.page.about_site_tips.tips", label: "小字提示", type: "text" },
                    { key: "about.page.about_site_tips.title1", label: "标题第一行", type: "text" },
                    { key: "about.page.about_site_tips.title2", label: "标题第二行", type: "text" },
                    {
                        key: "about.page.about_site_tips.word",
                        label: "轮播词",
                        type: "stringlist",
                        hint: "至少两条才会显示轮播",
                        placeholder: "一条词",
                    },
                ],
            },
            {
                id: "skills",
                label: "技能标签",
                fields: [
                    { key: "about.page.avatar_skills_left", label: "头像左侧技能", type: "stringlist", placeholder: "一条技能" },
                    { key: "about.page.avatar_skills_right", label: "头像右侧技能", type: "stringlist", placeholder: "一条技能" },
                    { key: "about.page.skills_tips.tips", label: "小字提示", type: "text" },
                    { key: "about.page.skills_tips.title", label: "标题", type: "text" },
                ],
            },
            {
                id: "enable",
                label: "模块开关（生效中）",
                fields: [
                    { key: "about.page.enable.author_box", label: "作者头像框", type: "boolean" },
                    { key: "about.page.enable.page_content", label: "自我介绍卡", type: "boolean" },
                    { key: "about.page.enable.skills", label: "技能展示", type: "boolean" },
                    { key: "about.page.enable.careers", label: "生涯", type: "boolean" },
                    { key: "about.page.enable.statistic", label: "访问统计", type: "boolean" },
                    { key: "about.page.enable.map_and_info", label: "地图与个人信息", type: "boolean" },
                    { key: "about.page.enable.personality", label: "性格", type: "boolean" },
                    { key: "about.page.enable.photo", label: "照片", type: "boolean" },
                    { key: "about.page.enable.maxim", label: "座右铭", type: "boolean" },
                    { key: "about.page.enable.buff", label: "Buff 卡片", type: "boolean" },
                    { key: "about.page.enable.game", label: "游戏", type: "boolean" },
                    { key: "about.page.enable.comic", label: "追番", type: "boolean" },
                    { key: "about.page.enable.like_tech", label: "技术偏好", type: "boolean" },
                    { key: "about.page.enable.music", label: "音乐", type: "boolean" },
                ],
            },
            {
                id: "enable-extra",
                label: "模块开关（未渲染）",
                fields: [
                    { key: "about.page.enable.comment", label: "评论区", type: "boolean" },
                    { key: "about.page.enable.custom_code", label: "自定义代码模块", type: "boolean" },
                ],
            },
            {
                id: "buff",
                label: "Buff 卡片",
                fields: [
                    { key: "about.page.buff.tips", label: "小字提示", type: "text" },
                    { key: "about.page.buff.top", label: "上行文案", type: "text" },
                    { key: "about.page.buff.bottom", label: "下行文案", type: "text" },
                ],
            },
            {
                id: "maxim",
                label: "座右铭",
                fields: [
                    { key: "about.page.maxim.tips", label: "小字提示", type: "text" },
                    { key: "about.page.maxim.top", label: "上行文案", type: "text" },
                    { key: "about.page.maxim.bottom", label: "下行文案", type: "text" },
                ],
            },
            {
                id: "careers",
                label: "生涯",
                fields: [
                    { key: "about.page.careers.title", label: "标题", type: "text" },
                    { key: "about.page.careers.tips", label: "小字提示", type: "text" },
                    { key: "about.page.careers.img", label: "右下角配图", type: "image" },
                    {
                        key: "about.page.careers.list",
                        label: "生涯条目",
                        type: "list",
                        itemFields: [
                            { name: "desc", label: "描述" },
                            { name: "color", label: "圆点颜色", type: "color", placeholder: "#357ef5" },
                        ],
                    },
                ],
            },
            {
                id: "comic",
                label: "追番",
                fields: [
                    { key: "about.page.comic.title", label: "标题", type: "text" },
                    { key: "about.page.comic.tips", label: "小字提示", type: "text" },
                    {
                        key: "about.page.comic.list",
                        label: "追番条目",
                        type: "list",
                        itemFields: [
                            { name: "name", label: "名称" },
                            { name: "cover", label: "封面地址", placeholder: "图片地址" },
                            { name: "href", label: "跳转链接" },
                        ],
                    },
                ],
            },
            {
                id: "game",
                label: "游戏",
                fields: [
                    { key: "about.page.game.title", label: "标题", type: "text" },
                    { key: "about.page.game.tips", label: "小字提示", type: "text" },
                    { key: "about.page.game.background", label: "背景图", type: "image" },
                    { key: "about.page.game.uid", label: "UID", type: "text" },
                ],
            },
            {
                id: "like",
                label: "技术偏好",
                fields: [
                    { key: "about.page.like.title", label: "标题", type: "text" },
                    { key: "about.page.like.tips", label: "小字提示", type: "text" },
                    { key: "about.page.like.bottom", label: "底部文案", type: "text" },
                    { key: "about.page.like.background", label: "背景图", type: "image" },
                ],
            },
            {
                id: "map",
                label: "地图与信息",
                fields: [
                    { key: "about.page.map.title", label: "地图标题", type: "text" },
                    { key: "about.page.map.strengthenTitle", label: "地图加粗标题", type: "text" },
                    { key: "about.page.map.background", label: "地图背景图", type: "image" },
                ],
            },
            {
                id: "map-extra",
                label: "地图深色背景",
                fields: [{ key: "about.page.map.backgroundDark", label: "深色模式背景图", type: "image" }],
            },
            {
                id: "music",
                label: "音乐卡片",
                fields: [
                    { key: "about.page.music.title", label: "标题", type: "text" },
                    { key: "about.page.music.tips", label: "小字提示", type: "text" },
                    { key: "about.page.music.link", label: "更多推荐链接", type: "text" },
                    { key: "about.page.music.background", label: "背景图", type: "image" },
                ],
            },
        ],
    },
    {
        id: "banner-album",
        label: "相册页面",
        group: "页面显示",
        icon: Images,
        keywords: ["相册", "album", "横幅", "banner", "背景图", "标题", "瀑布流", "列数", "分页", "评论"],
        desc: "相册页：顶部横幅、列表分页与瀑布流列数，以及图片参数与接口。",
        groups: [
            {
                id: "album",
                label: "相册横幅",
                fields: [
                    { key: "album.banner.title", label: "标题", type: "text" },
                    { key: "album.banner.tip", label: "小字提示", type: "text" },
                    { key: "album.banner.description", label: "描述", type: "text" },
                    { key: "album.banner.background", label: "背景图", type: "image" },
                ],
            },
            {
                id: "album-list",
                label: "列表与分页",
                fields: [
                    { key: "album.page_size", label: "每页图片数", type: "number", placeholder: "24" },
                    {
                        key: "album.layout_mode",
                        label: "列表布局",
                        type: "select",
                        options: [
                            { value: "grid", label: "网格" },
                            { value: "waterfall", label: "瀑布流" },
                        ],
                        hint: "本站相册页目前固定用瀑布流，未读取该键",
                    },
                    { key: "album.about_link", label: "「关于」跳转", type: "text", placeholder: "留空用站点信息里的关于页链接" },
                    { key: "album.enable_comment", label: "显示评论区", type: "boolean" },
                ],
            },
            {
                id: "album-waterfall",
                label: "瀑布流列数与间距",
                fields: [
                    { key: "album.waterfall.column_count.large", label: "大屏列数", type: "number", placeholder: "4" },
                    { key: "album.waterfall.column_count.medium", label: "中屏列数", type: "number", placeholder: "3" },
                    { key: "album.waterfall.column_count.small", label: "小屏列数", type: "number", placeholder: "1" },
                    { key: "album.waterfall.gap", label: "图片间距（px）", type: "number", placeholder: "16" },
                ],
            },
            {
                id: "album-misc",
                label: "图片参数与接口",
                fields: [
                    { key: "album.default_big_param", label: "默认大图参数", type: "text", hint: "本站前台未读取该键" },
                    { key: "album.default_thumb_param", label: "默认缩略图参数", type: "text", hint: "本站前台未读取该键" },
                    { key: "album.api_url", label: "相册接口地址", type: "text", hint: "留空用站点接口；本站前台未读取该键" },
                ],
            },
        ],
    },
    {
        id: "banner-essay",
        label: "即刻页面",
        group: "页面显示",
        icon: NotebookPen,
        keywords: ["即刻", "说说", "essay", "横幅", "banner", "分页", "加载更多", "每页数量"],
        desc: "即刻（说说）页顶部横幅的文案与背景，以及每页条数与分页方式。",
        groups: [
            {
                id: "essay",
                label: "即刻横幅",
                fields: [
                    { key: "essay.home_enable", label: "显示横幅", type: "boolean" },
                    { key: "essay.title", label: "标题", type: "text" },
                    { key: "essay.subtitle", label: "副标题", type: "text" },
                    { key: "essay.tips", label: "小字提示", type: "text" },
                    { key: "essay.button_text", label: "按钮文案", type: "text" },
                    { key: "essay.button_link", label: "按钮链接", type: "text" },
                    { key: "essay.top_background", label: "背景图", type: "image" },
                ],
            },
            {
                id: "essay-page",
                label: "即刻分页",
                fields: [
                    { key: "essay.limit", label: "每页数量", type: "number" },
                    {
                        key: "essay.pagination_mode",
                        label: "分页方式",
                        type: "select",
                        options: [
                            { value: "pagination", label: "页码分页" },
                            { value: "loadmore", label: "加载更多" },
                        ],
                    },
                ],
            },
        ],
    },
    {
        id: "banner-moments",
        label: "朋友圈页",
        group: "页面显示",
        icon: MessagesSquare,
        keywords: ["朋友圈", "好友圈", "moments", "横幅", "banner", "每页条数"],
        desc: "朋友圈页顶部横幅、好友圈开关与每页条数。",
        groups: [
            {
                id: "moments",
                label: "朋友圈横幅",
                fields: [
                    { key: "moments.enable", label: "启用好友圈", type: "boolean" },
                    { key: "moments.title", label: "标题", type: "text" },
                    { key: "moments.subtitle", label: "副标题", type: "text" },
                    { key: "moments.tips", label: "小字提示", type: "text" },
                    { key: "moments.button_text", label: "按钮文案", type: "text" },
                    { key: "moments.button_link", label: "按钮链接", type: "text" },
                    { key: "moments.display_limit", label: "每页条数", type: "number", hint: "同时作为抓取与分页大小" },
                    { key: "moments.top_background", label: "背景图", type: "image" },
                ],
            },
        ],
    },
    {
        id: "banner-equipment",
        label: "装备页面",
        group: "页面显示",
        icon: Backpack,
        keywords: ["装备", "equipment", "横幅", "banner", "背景图"],
        desc: "装备页顶部横幅的标题、小字提示、描述与背景图，以及下面的装备清单（分组 + 条目）。",
        groups: [
            {
                id: "equipment",
                label: "装备页横幅",
                fields: [
                    // 这三个键的名字和实际显示位置是错着来的（官方前端就是这么用的，线上 DOM 核过）
                    { key: "equipment.banner.title", label: "角标（左上角小字）", type: "text" },
                    { key: "equipment.banner.description", label: "主标题（大字）", type: "text" },
                    { key: "equipment.banner.tip", label: "底部说明", type: "text" },
                    { key: "equipment.banner.background", label: "背景图", type: "image" },
                ],
            },
            {
                id: "equipment-list",
                label: "装备清单",
                fields: [
                    {
                        key: "equipment.list",
                        label: "装备分组",
                        type: "list",
                        wide: true,
                        hint: "前台按「分组 → 装备条目」渲染；没有条目的分组自动跳过",
                        itemFields: [
                            { name: "title", label: "分组标题", placeholder: "日常使用" },
                            { name: "description", label: "分组描述" },
                            {
                                name: "equipment_list",
                                label: "装备条目",
                                nested: [
                                    { name: "name", label: "名称", placeholder: "Redmi K80" },
                                    { name: "specification", label: "规格", placeholder: "标准版" },
                                    { name: "description", label: "描述" },
                                    { name: "image", label: "图片地址" },
                                    { name: "link", label: "链接" },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    },
    {
        id: "banner-recent-comments",
        label: "最近评论页",
        group: "页面显示",
        icon: MessageCircle,
        keywords: ["最近评论", "评论", "recent_comments", "横幅", "banner"],
        desc: "最近评论页顶部横幅的标题、小字提示、描述与背景图。",
        groups: [
            {
                id: "recent-comments",
                label: "最近评论横幅",
                fields: [
                    { key: "recent_comments.banner.title", label: "标题", type: "text" },
                    { key: "recent_comments.banner.tip", label: "小字提示", type: "text" },
                    { key: "recent_comments.banner.description", label: "描述", type: "text" },
                    { key: "recent_comments.banner.background", label: "背景图", type: "image" },
                ],
            },
        ],
    },
    {
        id: "music",
        label: "音乐馆",
        group: "页面显示",
        icon: Music,
        keywords: ["音乐", "music", "唱片", "vinyl", "音源", "meting", "播放器", "歌单", "歌词"],
        desc: "音乐馆页面：唱片机 5 层图的图片地址、音源解析服务；播放器歌单那组本站前台未读取。",
        groups: [
            {
                id: "vinyl",
                label: "唱片机图片",
                fields: [
                    { key: "music.vinyl.background", label: "背景图", type: "image", hint: "留空回落官方默认图" },
                    { key: "music.vinyl.outer", label: "唱片外圈", type: "image" },
                    { key: "music.vinyl.inner", label: "唱片内圈", type: "image" },
                    { key: "music.vinyl.needle", label: "唱针", type: "image" },
                    { key: "music.vinyl.groove", label: "纹路", type: "image" },
                ],
            },
            {
                id: "api",
                label: "音源解析服务",
                fields: [
                    { key: "music.api.base_url", label: "解析服务地址", type: "text", placeholder: "https://metings.qjqq.cn" },
                    {
                        key: "music.api.meting_server",
                        label: "音源",
                        type: "text",
                        placeholder: "netease",
                        hint: "常见：netease / tencent / kugou / kuwo / baidu",
                    },
                    { key: "music.api.protocol", label: "接口协议", type: "text", placeholder: "legacy", hint: "常见：legacy / meting" },
                ],
            },
            {
                id: "player",
                label: "播放器歌单",
                fields: [
                    {
                        key: "music.player.playlist_id",
                        label: "歌单 ID",
                        type: "number",
                        hint: "网易云歌单 ID。后端拉歌单时读它（pkg/service/music/service.go 的 getPlaylistID），改完刷新前台即生效；留空用默认 8152976493",
                    },
                    {
                        key: "music.player.custom_playlist",
                        label: "自定义歌单",
                        type: "text",
                        hint: "后端没有读取这个键（Go 侧只有定义、无使用点），本站前台也不读，填了不生效",
                    },
                    {
                        key: "music.capsule.custom_playlist",
                        label: "胶囊自定义歌单",
                        type: "text",
                        hint: "同上：后端未接、本站未读，填了不生效",
                    },
                ],
            },
        ],
    },
    {
        id: "friend-apply",
        label: "友链管理",
        group: "页面显示",
        icon: Link2,
        keywords: ["友链", "申请", "friend", "link", "条件", "占位", "默认分类"],
        desc: "友链页的申请条件、申请表单占位文案、申请页自定义内容与后端默认分类。",
        groups: [
            {
                id: "condition",
                label: "申请条件",
                fields: [
                    {
                        key: "FRIEND_LINK_APPLY_CONDITION",
                        label: "申请条件",
                        type: "stringlist",
                        placeholder: "一条条件",
                        hint: "前台按 HTML 渲染，只写自己信任的内容",
                    },
                ],
            },
            {
                id: "placeholder",
                label: "表单占位文案",
                fields: [
                    { key: "FRIEND_LINK_PLACEHOLDER_NAME", label: "名称", type: "text", hint: "友链申请表单里「网站名称」的占位文案；留空回退默认" },
                    { key: "FRIEND_LINK_PLACEHOLDER_URL", label: "网址", type: "text", hint: "「网站链接」的占位文案；留空回退默认" },
                    { key: "FRIEND_LINK_PLACEHOLDER_LOGO", label: "头像", type: "text", hint: "「Logo链接」的占位文案；留空回退默认" },
                    { key: "FRIEND_LINK_PLACEHOLDER_DESCRIPTION", label: "描述", type: "text", hint: "「网站简介」的占位文案；留空回退默认" },
                    { key: "FRIEND_LINK_PLACEHOLDER_SITESHOT", label: "截图", type: "text", hint: "「网站截图」的占位文案；留空回退默认" },
                ],
            },
            {
                id: "default",
                label: "默认分类",
                fields: [
                    {
                        key: "FRIEND_LINK_DEFAULTCATEGORY",
                        label: "默认分类 ID",
                        type: "number",
                        hint: "后端建友链时使用；值是友链分类 ID（在友链管理页能看到）",
                    },
                ],
            },
            {
                id: "custom-code",
                label: "申请页自定义内容",
                fields: [
                    {
                        key: "FRIEND_LINK_APPLY_CUSTOM_CODE_HTML",
                        label: "自定义内容（前台渲染这段 HTML）",
                        type: "code",
                        language: "html",
                        rows: 18,
                        wide: true,
                        hint: "友链页按「免责声明 → 相关须知 → 申请条件 → yaml 示例」排列：这段 HTML 里最后一个代码块会被自动切到申请条件之后，其余部分在申请条件之前。",
                    },
                ],
            },
        ],
    },
];

/** 所有字段（按分区顺序展平） */
export const ALL_SETTINGS_FIELDS: SettingsField[] = SETTINGS_SECTIONS.flatMap((section) =>
    section.groups.flatMap((group) => group.fields)
);

/**
 * AI 面板的字段（带 aiModule 的都是）——给两处用：
 *  1) AiSettingsPanel 分组渲染；
 *  2) settings-manager 挂载时按这批键去 POST /settings/get-by-keys 补齐「公开 site-config 不下发」的
 *     后台专有键（ai_summary_*、ai_writing_*、embedding_*、播客音频参数、三个 prompt 等）。
 */
export const AI_SETTINGS_FIELDS: SettingsField[] = ALL_SETTINGS_FIELDS.filter((field) => Boolean(field.aiModule));
/** 上述字段的后端键（去重） */
export const AI_SETTINGS_KEYS: string[] = Array.from(new Set(AI_SETTINGS_FIELDS.map((field) => field.key)));

/**
 * 标了 remoteOnly 的字段（SMTP_*、DEFAULT_*_TEMPLATE、ENABLE_USER_ACTIVATION 等）：
 * 公开的 /public/site-config 里没有这些键，必须另走 POST /settings/get-by-keys 补读，
 * 否则面板会把「后端已配置」显示成空态。
 */
export const REMOTE_ONLY_SETTINGS_FIELDS: SettingsField[] = ALL_SETTINGS_FIELDS.filter((field) => Boolean(field.remoteOnly));
/** 上述字段的后端键（去重） */
export const REMOTE_ONLY_SETTINGS_KEYS: string[] = Array.from(
    new Set(REMOTE_ONLY_SETTINGS_FIELDS.map((field) => field.key))
);

/**
 * 「无法从外部验证」的设置键。
 *
 * 两类：
 *   1. 私密项 —— 父段在公开配置里，但子键不下发（密钥、提示词、向量库、语音参数…）；
 *   2. PRO 后台专有键 —— 读取需要管理员登录态（AI 写作 / AI 摘要），公开 site-config 里没有。
 *
 * 设置页会在这些字段的标签右侧加一个 ⚠，点开说明为什么“保存成功也可能没生效”。
 */
export const UNVERIFIABLE_SETTINGS_KEYS = new Set<string>([
    "ai_podcast.provider",
    "ai_podcast.speaker1",
    "ai_podcast.speaker2",
    "ai_podcast.use_head_music",
    "ai_podcast.use_tail_music",
    "ai_podcast.audio_format",
    "ai_podcast.sample_rate",
    "ai_podcast.speech_rate",
    "ai_assistant.embedding_provider",
    "ai_assistant.embedding_api_key",
    "ai_assistant.embedding_model",
    "ai_assistant.vector_store",
    "ai_assistant.system_prompt",
    "ai_assistant.user_prompt",
    "ai_assistant.no_context_prompt",
    "oauth.qq.display_name",
    "oauth.wechat.display_name",
    "oauth.rainbow.display_name",
    "comment.nickname_forbidden_words",
    "ai_summary_provider",
    "ai_summary_api_key",
    "ai_summary_api_url",
    "ai_summary_model",
    "ai_summary_system_prompt",
    "ai_writing_provider",
    "ai_writing_api_key",
    "ai_writing_api_url",
    "ai_writing_model",
    "ai_writing_max_tokens",
    "ai_writing_temperature",
    "ai_writing_system_prompt",
]);

/** 后端对敏感项的回显占位（只写不回显）；空串 = 未配置 */
export function isSecretMask(value: unknown): boolean {
    return typeof value === "string" && /^\*+$/.test(value.trim());
}

/** 表单值：文本/数字/图片/下拉/颜色 = string；开关 = boolean；列表 = 数组；令牌 = { light, dark }；json = 文本 */
export type SettingsFormValue =
    | string
    | boolean
    | string[]
    | Record<string, unknown>[]
    | AppearanceTokenBranches;

/** 按点号路径从 site-config 取值（如 footer.socialBar.left） */
export function readConfigPath(config: unknown, key: string): unknown {
    if (!config || typeof config !== "object") return undefined;
    let node: unknown = config;
    for (const part of key.split(".")) {
        if (!node || typeof node !== "object") return undefined;
        node = (node as Record<string, unknown>)[part];
    }
    return node;
}

function parseJson(value: unknown): unknown {
    if (typeof value !== "string") return value;
    const text = value.trim();
    if (!text) return undefined;
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
}

/** 把配置里的原始值归一成表单值 */
export function toFormValue(field: SettingsField, raw: unknown): SettingsFormValue {
    if (field.type === "boolean") {
        if (typeof raw === "boolean") return raw;
        if (typeof raw === "string") return raw.trim() === "true" || raw.trim() === "1";
        return false;
    }
    if (field.type === "list") {
        const parsed = parseJson(raw);
        return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
    }
    if (field.type === "stringlist") {
        // 接口一般直接给数组；也兼容后端存成 JSON 字符串、或用户按「一行一条」写的纯文本
        const parsed = parseJson(raw);
        if (Array.isArray(parsed)) return parsed.map((item) => String(item));
        if (typeof raw === "string" && raw.trim()) {
            return raw
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean);
        }
        return [];
    }
    if (field.type === "json") {
        // 对象/数组字段：接口可能给对象，也可能给 JSON 字符串；统一格式化成可编辑的缩进文本
        if (raw === undefined || raw === null || raw === "") return "";
        const parsed = parseJson(raw);
        if (parsed === undefined || parsed === null) return String(raw);
        return JSON.stringify(parsed, null, 2);
    }
    if (field.type === "tokens") {
        const parsed = parseJson(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
        return parsed as AppearanceTokenBranches;
    }
    if (raw === undefined || raw === null) return "";
    return String(raw);
}

/** 构造表单基线（key → 表单值） */
export function buildSettingsBaseline(config: unknown): Record<string, SettingsFormValue> {
    const out: Record<string, SettingsFormValue> = {};
    for (const field of ALL_SETTINGS_FIELDS) {
        out[field.key] = toFormValue(field, readConfigPath(config, field.key));
    }
    return out;
}

/** 判断某个字段是否有改动 */
export function isFieldDirty(field: SettingsField, draft: Record<string, SettingsFormValue>, baseline: Record<string, SettingsFormValue>): boolean {
    const current = draft[field.key];
    // 敏感项特例：基线是后端回显的掩码（********）时，
    //   - 草稿还是掩码 → 没改（相等，下面照常判）
    //   - 草稿被清空 → 视为「没改」，既不该把掩码写回后端，也不该把已配置的密钥清掉
    //   （要改就直接输入新值，那时草稿是新值，必然 dirty）
    if (field.sensitive && isSecretMask(baseline[field.key]) && (current === "" || current === undefined)) {
        return false;
    }
    return JSON.stringify(current) !== JSON.stringify(baseline[field.key]);
}

/**
 * 后端把哪些「一张 JSON 存整段」的键当成单个设置项。
 *
 * page.one_image.config 就是一个整段 JSON（{ home, archives, categories, tags }），后端没有
 * `page.one_image.config.home.enable` 这种子键。所以表单里按点号展开的子字段，保存时必须
 * 合并回这一整段再提交，否则后端只会收到一堆它不认识的孤立键 —— 表面上提示「已保存」，
 * 实际公开配置一点没变（首页关了大图却还在，就是这个原因）。
 */
const JSON_BLOB_KEYS = [
    "page.one_image.config",
    "HOME_TOP",
    "CREATIVITY",
    "album.waterfall.column_count",
    "about.page.about_site_tips",
    "about.page.buff",
    "about.page.careers",
    "about.page.comic",
    "about.page.game",
    "about.page.like",
    "about.page.map",
    "about.page.maxim",
    "about.page.music",
    "about.page.personalities",
    "about.page.self_info",
    "about.page.skills_tips",
] as const;

/** 把 "a.b.c" 写进对象（不存在就逐层补） */
function setDeepPath(target: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split(".");
    let node: Record<string, unknown> = target;
    for (const part of parts.slice(0, -1)) {
        const next = node[part];
        if (!next || typeof next !== "object" || Array.isArray(next)) node[part] = {};
        node = node[part] as Record<string, unknown>;
    }
    node[parts[parts.length - 1]] = value;
}

/** 表单值 → 后端 JSON 里的原始类型（布尔仍是布尔，数字仍是数字） */
function toJsonValue(field: SettingsField, value: SettingsFormValue): unknown {
    if (field.type === "boolean") return Boolean(value);
    if (field.type === "number") {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    }
    return String(value ?? "");
}

/** 按官方口径构造保存载荷：布尔 → "true"/"false"；列表/令牌 → JSON 字符串；json 原样提交（本身就是 JSON 文本）；其余原样 */
export function buildSettingsPayload(
    fields: SettingsField[],
    draft: Record<string, SettingsFormValue>,
    config?: unknown,
    /**
     * 全部字段（含未改动的）。整段 JSON 键合并时要用它补齐同一段里的其它字段，
     * 否则公开配置里没有这段（例如后台专有键）时会写出半截 JSON 把原数据冲掉。
     */
    allFields: SettingsField[] = fields
): Record<string, string> {
    const payload: Record<string, string> = {};

    // 「JSON 整段」的键：把脏字段（以及同段的其它字段）合并进原对象后整体提交
    const touchedBlobs = new Map<string, SettingsField[]>();
    for (const field of fields) {
        const blob = JSON_BLOB_KEYS.find((key) => field.key.startsWith(`${key}.`));
        if (!blob) continue;
        const list = touchedBlobs.get(blob) ?? [];
        list.push(field);
        touchedBlobs.set(blob, list);
    }
    for (const [blob, dirtyBlobFields] of touchedBlobs) {
        const existing = readConfigPath(config, blob);
        const hasExisting = Boolean(existing && typeof existing === "object" && !Array.isArray(existing));
        const merged: Record<string, unknown> = hasExisting
            ? (JSON.parse(JSON.stringify(existing)) as Record<string, unknown>)
            : {};
        // 原有对象在 → 只覆盖脏字段；原有对象缺失 → 用全部字段铺满，避免只写半截
        const source = hasExisting ? dirtyBlobFields : allFields.filter((f) => f.key.startsWith(`${blob}.`));
        for (const field of source) {
            setDeepPath(merged, field.key.slice(blob.length + 1), toJsonValue(field, draft[field.key]));
        }
        payload[blob] = JSON.stringify(merged);
    }

    for (const field of fields) {
        if (JSON_BLOB_KEYS.some((key) => field.key.startsWith(`${key}.`))) continue;
        const value = draft[field.key];
        if (field.type === "boolean") payload[field.key] = value ? "true" : "false";
        else if (field.type === "list" || field.type === "stringlist") payload[field.key] = JSON.stringify(value ?? []);
        else if (field.type === "tokens") payload[field.key] = JSON.stringify(value ?? {});
        else payload[field.key] = String(value ?? "");
    }
    return payload;
}
