"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    BellRing,
    Check,
    ExternalLink,
    Info,
    Loader2,
    RefreshCw,
    Save,
    ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    getNotificationTypesApi,
    getUserNotificationConfigsApi,
    getUserNotificationSettingsApi,
    updateUserNotificationSettingsApi,
    type NotificationType,
    type UserNotificationConfig,
    type UserNotificationSettings,
} from "@/lib/api-notifications";

/* =============================================================================
 * 通知管理（纯配置型页面，无假数据）
 *
 * 数据源（同源代理 → 远端，全部读接口除 PUT 外都已实测通过鉴权）：
 *  1. GET /api/admin/notification/types     → 远端 GET /notification/types
 *     （router.go:868-871，JWTAuth + AdminAuth）= 系统支持的全部通知类型，
 *     只读清单，页面按 category 分组展示。
 *  2. GET /api/admin/notification/settings  → 远端 GET /user/notification-settings
 *     （router.go:860，仅 JWTAuth）= 当前登录用户的简化设置，后端目前只建模了
 *     「评论回复通知」一个开关（SimpleUserNotificationSettingsResponse，
 *     pkg/handler/notification/dto.go:57-60）。
 *  3. GET /api/admin/notification/configs   → 远端 GET /user/notification-configs
 *     （router.go:864，仅 JWTAuth）= 当前用户的完整配置明细（UserNotificationConfigDTO[]，
 *     dto.go:25-36）。⚠️ 后端**只有 GET**（router.go:864），没有 PUT/POST，
 *     所以这一块按「只读展示」渲染，不提供勾选开关。
 *
 * ⚠️ 写操作声明：页面唯一的写动作是 PUT /user/notification-settings（评论回复通知开关），
 *    按任务约定**只实现不实测**（不向线上发写请求），提交前一定走二次确认。
 * ========================================================================== */

/** 卡片外壳：与统计卡片同一套令牌（紧凑密度：内边距 p-4） */
const cardCls = "rounded-xl border bg-card p-4 shadow-sm";

/** 小徽章（与评论管理页的状态徽章同一套配色） */
function Badge({ children, tone }: { children: React.ReactNode; tone: "ok" | "muted" | "warn" }) {
    const cls =
        tone === "ok"
            ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400"
            : tone === "warn"
              ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400"
              : "bg-muted text-muted-foreground";
    return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}

/** 渠道英文 code → 中文展示名（后端 code 未知时原样显示，不编造含义） */
const CHANNEL_LABEL: Record<string, string> = {
    email: "邮件",
    site: "站内",
    web: "站内",
    browser: "浏览器推送",
    push: "推送",
    wechat: "微信",
    qq: "QQ",
    webhook: "Webhook",
};

function channelLabel(code: string): string {
    return CHANNEL_LABEL[code] ?? code;
}

/** 通知分类 code → 中文展示名（未知分类原样显示） */
const CATEGORY_LABEL: Record<string, string> = {
    comment: "评论",
    system: "系统",
    content: "内容",
    user: "用户",
    security: "安全",
};

function categoryLabel(code: string): string {
    const key = (code ?? "").trim();
    if (key === "") return "未分类";
    return CATEGORY_LABEL[key] ?? key;
}

/** 加载骨架：两块卡片同尺寸，避免加载时跳一下 */
function Skeleton() {
    return (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3" aria-busy="true" aria-label="通知配置加载中">
            <div className="h-[236px] animate-pulse rounded-xl border bg-card lg:col-span-2" />
            <div className="h-[236px] animate-pulse rounded-xl border bg-card" />
        </div>
    );
}

export function NotificationsManager() {
    const [types, setTypes] = useState<NotificationType[]>([]);
    const [configs, setConfigs] = useState<UserNotificationConfig[]>([]);
    const [settings, setSettings] = useState<UserNotificationSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    /** 三个接口并行拉取；任一失败只影响自己那一块，不整页报错 */
    const load = useCallback(async () => {
        setLoading(true);
        const [typesRes, configsRes, settingsRes] = await Promise.allSettled([
            getNotificationTypesApi(),
            getUserNotificationConfigsApi(),
            getUserNotificationSettingsApi(),
        ]);

        if (typesRes.status === "fulfilled") {
            setTypes(typesRes.value);
        } else {
            toast.error(typesRes.reason instanceof Error ? typesRes.reason.message : "获取通知类型失败");
        }

        if (configsRes.status === "fulfilled") {
            setConfigs(configsRes.value);
        } else {
            // 配置明细是补充信息，失败时给空列表 + 页面内说明，不打断主流程
            setConfigs([]);
        }

        if (settingsRes.status === "fulfilled") {
            setSettings(settingsRes.value);
        } else {
            toast.error(settingsRes.reason instanceof Error ? settingsRes.reason.message : "获取通知设置失败");
        }

        setLoading(false);
    }, []);

    useEffect(() => {
        // 延后到下一个 tick：effect 内同步 setState 会触发级联渲染（react-hooks/set-state-in-effect）
        const timer = setTimeout(() => void load(), 0);
        return () => clearTimeout(timer);
    }, [load]);

    /** 按 category 分组（保持后端返回顺序，不额外排序，避免与后端配置顺序不一致） */
    const groupedTypes = useMemo(() => {
        const groups = new Map<string, NotificationType[]>();
        for (const t of types) {
            const key = categoryLabel(t.category);
            const list = groups.get(key);
            if (list) list.push(t);
            else groups.set(key, [t]);
        }
        return Array.from(groups.entries());
    }, [types]);

    /** 已存在配置的类型 id 集合（用来标「已配置」） */
    const configuredTypeIds = useMemo(
        () => new Set(configs.map((c) => c.notificationTypeId).filter((id): id is number => typeof id === "number")),
        [configs]
    );

    /** 配置里的类型名（后端预加载了 notificationType 才有；否则退回类型清单里查 code → name） */
    const typeNameOf = useCallback(
        (config: UserNotificationConfig): string => {
            if (config.notificationType?.name) return config.notificationType.name;
            const matched = types.find((t) => t.id === config.notificationTypeId);
            return matched?.name ?? `类型 #${config.notificationTypeId}`;
        },
        [types]
    );

    /**
     * 保存「评论回复通知」开关（⚠️ 写操作，仅实现不实测）。
     * 二次确认文案写明后果；成功后用后端返回的形状回填，不以本地猜测为准。
     */
    const handleSaveSettings = async () => {
        if (!settings) return;
        const next = !settings.allowCommentReplyNotification;
        const ok = window.confirm(
            `确定${next ? "开启" : "关闭"}「评论回复通知」吗？\n\n` +
                `这会更新当前账号的通知配置（远端 PUT /user/notification-settings）。\n` +
                `关闭后，别人回复你的评论将不再给你发送通知。`
        );
        if (!ok) return;

        setSaving(true);
        try {
            const saved = await updateUserNotificationSettingsApi({ allowCommentReplyNotification: next });
            setSettings(saved);
            // 配置明细也跟着回填（后端更新的是同一张表）
            const refreshed = await getUserNotificationConfigsApi().catch(() => null);
            if (refreshed) setConfigs(refreshed);
            toast.success(next ? "已开启评论回复通知" : "已关闭评论回复通知");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "保存通知设置失败");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <Skeleton />;
    }

    return (
        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-3">
            {/* ===== 左：通知类型清单（管理员视角，只读） ===== */}
            <section className={`${cardCls} lg:col-span-2`}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                        <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <BellRing className="size-3.5" />
                        </span>
                        通知类型
                    </h3>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                            共 <span className="font-medium text-foreground tabular-nums">{types.length}</span> 种
                        </span>
                        <button
                            type="button"
                            onClick={() => void load()}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-background px-2 text-xs transition-colors hover:bg-muted dark:border-input dark:bg-input/30"
                        >
                            <RefreshCw className="size-3.5" />
                            刷新
                        </button>
                    </div>
                </div>

                {types.length === 0 ? (
                    <p className="py-8 text-xs text-muted-foreground">
                        后端未返回任何通知类型（notification_types 表可能尚未初始化）。
                    </p>
                ) : (
                    <div className="space-y-3">
                        {groupedTypes.map(([category, list]) => (
                            <div key={category}>
                                <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">{category}</h4>
                                <ul className="space-y-2">
                                    {list.map((t) => (
                                        <li
                                            key={t.id}
                                            className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-lg border bg-muted/40 px-3 py-2"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-sm font-medium">{t.name || t.code}</span>
                                                    <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                                        {t.code}
                                                    </code>
                                                    {t.isActive ? <Badge tone="ok">已启用</Badge> : <Badge tone="warn">已停用</Badge>}
                                                    {t.defaultEnabled && <Badge tone="muted">新用户默认开启</Badge>}
                                                    {configuredTypeIds.has(t.id) && <Badge tone="muted">我已有配置</Badge>}
                                                </div>
                                                {t.description && (
                                                    <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
                                                )}
                                                <p className="mt-1 text-[11px] text-muted-foreground/80">
                                                    支持渠道：
                                                    {(t.supportedChannels ?? []).length > 0
                                                        ? (t.supportedChannels ?? []).map(channelLabel).join(" / ")
                                                        : "—"}
                                                </p>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* ===== 右：当前账号的通知配置 ===== */}
            <div className="space-y-3">
                <section className={cardCls}>
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                        <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <ShieldCheck className="size-3.5" />
                        </span>
                        我的通知设置
                    </h3>

                    {settings === null ? (
                        <p className="text-xs text-muted-foreground">读取通知设置失败，请刷新重试。</p>
                    ) : (
                        <>
                            <label
                                htmlFor="notify-comment-reply"
                                className="flex cursor-pointer items-start gap-3 rounded-lg border bg-muted/40 px-3 py-2"
                            >
                                <Checkbox
                                    id="notify-comment-reply"
                                    className="mt-0.5"
                                    checked={settings.allowCommentReplyNotification}
                                    disabled={saving}
                                    onCheckedChange={(checked) =>
                                        // 勾选只是本地草稿（点「保存」才落库），所以这里直接改状态
                                        setSettings({ allowCommentReplyNotification: checked === true })
                                    }
                                />
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-medium">评论回复通知</span>
                                    <span className="mt-0.5 block text-xs text-muted-foreground">
                                        别人回复你的评论时，通过邮件等渠道通知你。
                                    </span>
                                </span>
                            </label>

                            <div className="mt-3 flex items-center gap-2">
                                <Button size="sm" className="h-8 px-2 text-xs" disabled={saving} onClick={() => void handleSaveSettings()}>
                                    {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                                    保存
                                </Button>
                                <span className="text-[11px] text-muted-foreground">
                                    当前：
                                    <span className="font-medium text-foreground">
                                        {settings.allowCommentReplyNotification ? "已开启" : "已关闭"}
                                    </span>
                                </span>
                            </div>

                            <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-muted/40 px-2.5 py-2 text-[11px] text-muted-foreground">
                                <Info className="mt-px size-3.5 shrink-0" />
                                后端简化版设置目前只建模了「评论回复通知」这一个开关；其余类型的订阅状态见下方配置明细。
                            </p>
                        </>
                    )}
                </section>

                <section className={cardCls}>
                    <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
                        <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <Check className="size-3.5" />
                        </span>
                        我的配置明细
                    </h3>
                    <p className="mb-3 text-[11px] text-muted-foreground">
                        来自 <code className="rounded bg-muted px-1 py-0.5">GET /user/notification-configs</code>
                        （只读：后端未提供对应的更新接口）。
                    </p>

                    {configs.length === 0 ? (
                        <p className="py-8 text-xs text-muted-foreground">暂无已落库的通知配置。</p>
                    ) : (
                        <ul className="space-y-2">
                            {configs.map((c) => (
                                <li key={c.id} className="rounded-lg border border-border/60 px-3 py-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-medium">{typeNameOf(c)}</span>
                                        {c.isEnabled ? <Badge tone="ok">已开启</Badge> : <Badge tone="muted">已关闭</Badge>}
                                    </div>
                                    <p className="mt-1 text-[11px] text-muted-foreground">
                                        渠道：
                                        {(c.enabledChannels ?? []).length > 0
                                            ? (c.enabledChannels ?? []).map(channelLabel).join(" / ")
                                            : "—"}
                                        {c.notificationEmail ? ` · 邮箱：${c.notificationEmail}` : ""}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                {/* 用户中心里已经有同一个开关的入口；这里只做指路，不改用户中心页面 */}
                <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
                    <ExternalLink className="size-3.5" />
                    前台用户中心 → 账号设置里也有同一个「评论回复通知」开关。
                </p>
            </div>
        </div>
    );
}
