// 后台「系统设置」的字段描述与读写工具。
//
// 约定（与官方后台一致）：
//  - 每个字段的 key 就是**后端键**，点号路径形式（如 footer.socialBar.left、LOGO_URL_192x192）；
//  - 读取：首屏值来自公开的 /public/site-config（嵌套对象），按点号路径取值；
//  - 保存：POST /settings/update，只提交改动项；字符串原样提交，
//    布尔提交 "true"/"false"，列表/对象提交 JSON.stringify 后的字符串。
//
// 第一批只做 4 个分区：站点信息、Logo 与图标、外观、页脚。

import { BUILT_IN_SKINS } from "@/lib/appearance";

export type SettingsFieldType = "text" | "textarea" | "number" | "boolean" | "select" | "image" | "list" | "tokens";

/** 列表项里的字段定义（type=list 时表示嵌套一层列表，如 footer.project.list[].links） */
export interface SettingsListField {
    name: string;
    label: string;
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
}

export interface SettingsGroup {
    id: string;
    label: string;
    /** 组级说明（例如「前端暂未渲染」） */
    note?: string;
    fields: SettingsField[];
}

export interface SettingsSection {
    id: string;
    label: string;
    desc?: string;
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

/** 可自定义的配色令牌（对应 APPEARANCE_TOKENS 的 light/dark 分支键名） */
export const APPEARANCE_TOKEN_FIELDS = [
    { name: "primary", label: "主色" },
    { name: "primaryForeground", label: "主色前景" },
    { name: "accent", label: "强调色" },
    { name: "success", label: "成功" },
    { name: "warning", label: "警告" },
    { name: "danger", label: "危险" },
    { name: "info", label: "信息" },
] as const;

const NOT_RENDERED = "这些字段后端/官方前端在用，本站前台暂未渲染，先保证可配置。";

export const SETTINGS_SECTIONS: SettingsSection[] = [
    {
        id: "site",
        label: "站点信息",
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
        label: "外观",
        desc: "换肤与默认明暗模式；皮肤只影响主色与语义色，可再按令牌微调。",
        groups: [
            {
                id: "skin",
                label: "换肤与配色",
                fields: [
                    { key: "APPEARANCE_SKIN", label: "皮肤", type: "select", options: SKIN_OPTIONS.map((s) => ({ value: s.value, label: s.label })) },
                    { key: "APPEARANCE_TOKENS", label: "自定义配色令牌", type: "tokens", wide: true, hint: "留空表示用皮肤自带颜色" },
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
                        options: [
                            { value: "light", label: "浅色" },
                            { value: "dark", label: "深色" },
                        ],
                    },
                    { key: "RESPECT_REDUCED_MOTION", label: "尊重系统的「减少动态效果」", type: "boolean" },
                ],
            },
        ],
    },
    {
        id: "footer",
        label: "页脚",
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
                note: NOT_RENDERED,
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
                note: NOT_RENDERED,
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
                note: NOT_RENDERED,
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
                note: NOT_RENDERED,
                fields: [
                    { key: "footer.uptime_kuma.enable", label: "显示监控", type: "boolean" },
                    { key: "footer.uptime_kuma.page_url", label: "监控页地址", type: "text", placeholder: "https://status.example.com" },
                ],
            },
        ],
    },
];

/** 所有字段（按分区顺序展平） */
export const ALL_SETTINGS_FIELDS: SettingsField[] = SETTINGS_SECTIONS.flatMap((section) =>
    section.groups.flatMap((group) => group.fields)
);

/** 表单值：文本/数字/图片/下拉 = string；开关 = boolean；列表 = 数组；令牌 = { light, dark } */
export type SettingsFormValue = string | boolean | Record<string, unknown>[] | { light?: Record<string, string>; dark?: Record<string, string> };

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
    if (field.type === "tokens") {
        const parsed = parseJson(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
        return parsed as { light?: Record<string, string>; dark?: Record<string, string> };
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
    return JSON.stringify(draft[field.key]) !== JSON.stringify(baseline[field.key]);
}

/** 按官方口径构造保存载荷：布尔 → "true"/"false"；列表/令牌 → JSON 字符串；其余原样 */
export function buildSettingsPayload(
    fields: SettingsField[],
    draft: Record<string, SettingsFormValue>
): Record<string, string> {
    const payload: Record<string, string> = {};
    for (const field of fields) {
        const value = draft[field.key];
        if (field.type === "boolean") payload[field.key] = value ? "true" : "false";
        else if (field.type === "list" || field.type === "tokens") payload[field.key] = JSON.stringify(value ?? (field.type === "list" ? [] : {}));
        else payload[field.key] = String(value ?? "");
    }
    return payload;
}
