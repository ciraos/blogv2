"use client";

import { useEffect, useState } from "react";
import { Bell, Link2, Lock, Pencil, Ticket, X } from "lucide-react";
import { toast } from "sonner";

import {
    ApiError,
    bindOAuthProviderApi,
    getMySupportTicketsApi,
    getNotificationSettingsApi,
    getOAuthBindingsApi,
    unbindOAuthProviderApi,
    updateNotificationSettingsApi,
    updateUserPasswordApi,
    updateUserProfileApi,
} from "@/lib/api";
import styles from "./user-center.module.css";

/** 统一取错误文案（后端 ApiError 的 message，兜底给默认提示） */
function errorText(err: unknown, fallback: string): string {
    if (err instanceof ApiError && err.message) return err.message;
    return err instanceof Error && err.message ? err.message : fallback;
}

/** Esc 关闭弹窗 */
function useEscapeToClose(open: boolean, onClose: () => void) {
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [open, onClose]);
}

// ===================== 编辑资料 =====================

interface EditProfileDialogProps {
    open: boolean;
    onClose: () => void;
    /** 保存成功（父组件刷新服务端数据） */
    onSuccess: () => void;
    userInfo: { nickname: string; email: string; website: string };
}

/**
 * 编辑资料：昵称 + 个人网站（邮箱暂不支持修改）。
 * 由父组件在打开时挂载（key 变化 → 状态重置），所以初值直接取 props，无需 effect 同步。
 */
export function EditProfileDialog({ open, onClose, onSuccess, userInfo }: EditProfileDialogProps) {
    // 官方行为：昵称若等于邮箱前缀（注册时的默认昵称）则不预填，提示用户自己设置
    const emailPrefix = (userInfo.email || "").split("@")[0] || "";
    const initialNickname = userInfo.nickname === emailPrefix ? "" : userInfo.nickname;

    const [nickname, setNickname] = useState(initialNickname);
    const [website, setWebsite] = useState(userInfo.website || "");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const isValid = nickname.trim().length >= 2 && nickname.trim().length <= 50;
    useEscapeToClose(open, onClose);

    async function handleSubmit() {
        if (!isValid || submitting) {
            if (!isValid) setError("昵称长度需在 2-50 个字符之间");
            return;
        }
        setSubmitting(true);
        setError("");
        try {
            await updateUserProfileApi({
                nickname: nickname.trim(),
                website: website.trim() || undefined,
            });
            toast.success("资料已保存");
            onClose();
            onSuccess();
        } catch (err) {
            setError(errorText(err, "保存失败，请稍后再试"));
        } finally {
            setSubmitting(false);
        }
    }

    if (!open) return null;

    return (
        <div className={styles.dialogOverlay} role="dialog" aria-modal="true" aria-labelledby="edit-profile-title" onClick={onClose}>
            <div className={styles.dialogPanel} onClick={(e) => e.stopPropagation()}>
                <button className={styles.dialogClose} aria-label="关闭" onClick={onClose}>
                    <X />
                </button>

                <div className={styles.dialogHeader}>
                    <span className={styles.dialogHeaderIcon}><Pencil /></span>
                    <h2 id="edit-profile-title" className={styles.dialogTitle}>编辑资料</h2>
                </div>

                <div className={styles.dialogBody}>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>昵称</label>
                        <input
                            className={styles.formInput}
                            value={nickname}
                            onChange={(e) => setNickname(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    void handleSubmit();
                                }
                            }}
                            placeholder="请设置一个个性化的昵称"
                            maxLength={50}
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>邮箱</label>
                        <input className={styles.formInput} value={userInfo.email} disabled />
                        <span className={styles.formTip}>邮箱暂不支持修改</span>
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>个人网站</label>
                        <input
                            className={styles.formInput}
                            value={website}
                            onChange={(e) => setWebsite(e.target.value)}
                            placeholder="请输入个人网站地址（选填）"
                        />
                    </div>
                    {error && <span className={styles.formError}>{error}</span>}
                </div>

                <div className={styles.dialogFooter}>
                    <button className={styles.btnSecondary} onClick={onClose}>取消</button>
                    <button className={styles.btnPrimary} disabled={!isValid || submitting} onClick={handleSubmit}>
                        {submitting ? "保存中..." : "保存"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ===================== 修改密码 =====================

interface ChangePasswordDialogProps {
    open: boolean;
    onClose: () => void;
}

/** 修改密码：成功后提示并登出（需用新密码重新登录） */
export function ChangePasswordDialog({ open, onClose }: ChangePasswordDialogProps) {
    const [oldPassword, setOldPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    useEscapeToClose(open, onClose);

    function validate(): string | null {
        if (!oldPassword) return "请输入当前密码";
        if (!newPassword) return "请输入新密码";
        if (newPassword.length < 6) return "新密码长度不能少于 6 位";
        if (newPassword === oldPassword) return "新密码不能与旧密码相同";
        if (newPassword !== confirmPassword) return "两次输入的密码不一致";
        return null;
    }

    async function handleSubmit() {
        if (submitting) return;
        const invalid = validate();
        if (invalid) {
            setError(invalid);
            return;
        }
        setSubmitting(true);
        setError("");
        try {
            await updateUserPasswordApi({ oldPassword, newPassword });
            toast.success("密码修改成功，请重新登录");
            onClose();
            window.setTimeout(() => {
                window.location.href = "/api/auth/logout";
            }, 1000);
        } catch (err) {
            setError(errorText(err, "修改密码失败，请稍后再试"));
        } finally {
            setSubmitting(false);
        }
    }

    if (!open) return null;

    return (
        <div className={styles.dialogOverlay} role="dialog" aria-modal="true" aria-labelledby="change-password-title" onClick={onClose}>
            <div className={styles.dialogPanel} onClick={(e) => e.stopPropagation()}>
                <button className={styles.dialogClose} aria-label="关闭" onClick={onClose}>
                    <X />
                </button>

                <div className={styles.dialogHeader}>
                    <span className={styles.dialogHeaderIcon}><Lock /></span>
                    <h2 id="change-password-title" className={styles.dialogTitle}>修改密码</h2>
                </div>

                <div className={styles.dialogBody}>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>当前密码</label>
                        <input
                            className={styles.formInput}
                            type="password"
                            value={oldPassword}
                            onChange={(e) => setOldPassword(e.target.value)}
                            placeholder="请输入当前密码"
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>新密码</label>
                        <input
                            className={styles.formInput}
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="请输入新密码（不少于 6 位）"
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>确认新密码</label>
                        <input
                            className={styles.formInput}
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="请再次输入新密码"
                        />
                    </div>
                    {error && <span className={styles.formError}>{error}</span>}

                    <div className={styles.passwordTips}>
                        <p>密码安全建议：</p>
                        <ul>
                            <li>长度至少 6 位字符</li>
                            <li>建议包含大小写字母、数字和特殊字符</li>
                            <li>避免使用容易被猜到的密码</li>
                        </ul>
                    </div>
                </div>

                <div className={styles.dialogFooter}>
                    <button className={styles.btnSecondary} onClick={onClose}>取消</button>
                    <button className={styles.btnPrimary} disabled={submitting} onClick={handleSubmit}>
                        {submitting ? "修改中..." : "确认修改"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ===================== 通知设置 =====================

interface NotificationSettingsDialogProps {
    open: boolean;
    onClose: () => void;
}

/** 通知设置：接收评论回复通知开关（后端 GET/PUT /user/notification-settings） */
export function NotificationSettingsDialog({ open, onClose }: NotificationSettingsDialogProps) {
    const [allowCommentReply, setAllowCommentReply] = useState(true);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEscapeToClose(open, onClose);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        getNotificationSettingsApi()
            .then((data) => {
                if (!cancelled && typeof data?.allowCommentReplyNotification === "boolean") {
                    setAllowCommentReply(data.allowCommentReplyNotification);
                }
            })
            .catch(() => {
                // 没取到（如接口 404 / 无配置）时保持默认值 true
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [open]);

    async function handleSave() {
        setSaving(true);
        try {
            await updateNotificationSettingsApi({ allowCommentReplyNotification: allowCommentReply });
            toast.success("通知设置已保存");
            onClose();
        } catch (err) {
            toast.error(errorText(err, "保存通知设置失败，请稍后再试"));
        } finally {
            setSaving(false);
        }
    }

    if (!open) return null;

    return (
        <div className={styles.dialogOverlay} role="dialog" aria-modal="true" aria-labelledby="notification-settings-title" onClick={onClose}>
            <div className={styles.dialogPanel} onClick={(e) => e.stopPropagation()}>
                <button className={styles.dialogClose} aria-label="关闭" onClick={onClose}>
                    <X />
                </button>

                <div className={styles.dialogHeader}>
                    <span className={styles.dialogHeaderIcon}><Bell /></span>
                    <h2 id="notification-settings-title" className={styles.dialogTitle}>通知设置</h2>
                </div>

                <div className={styles.dialogBody}>
                    <div className={styles.settingAlert}>
                        这些设置控制您接收各类通知的方式。您可以随时修改这些偏好。
                    </div>

                    {loading ? (
                        <div className={styles.loadingContainer} style={{ minHeight: "100px" }}>
                            <div className={styles.spinner} />
                        </div>
                    ) : (
                        <div className={styles.settingRow}>
                            <div className={styles.settingInfo}>
                                <div className={styles.settingLabel}>接收评论回复通知</div>
                                <div className={styles.settingDesc}>开启后，当您的评论被回复时会收到邮件通知</div>
                            </div>
                            <label className={styles.toggle}>
                                <input
                                    type="checkbox"
                                    checked={allowCommentReply}
                                    onChange={(e) => setAllowCommentReply(e.target.checked)}
                                />
                                <span className={styles.toggleSlider} />
                            </label>
                        </div>
                    )}
                </div>

                <div className={styles.dialogFooter}>
                    <button className={styles.btnSecondary} onClick={onClose}>取消</button>
                    <button className={styles.btnPrimary} disabled={saving || loading} onClick={handleSave}>
                        {saving ? "保存中..." : "保存设置"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ===================== 第三方账号绑定（PRO） =====================

/** 支持绑定的第三方平台（与后台设置里的 oauth.* 一一对应） */
const OAUTH_PROVIDERS: { key: string; name: string }[] = [
    { key: "github", name: "GitHub" },
    { key: "google", name: "Google" },
    { key: "microsoft", name: "Microsoft" },
    { key: "qq", name: "QQ" },
    { key: "wechat", name: "微信" },
    { key: "logto", name: "Logto" },
    { key: "oidc", name: "OIDC" },
    { key: "rainbow", name: "Rainbow" },
];

/**
 * 把后端返回的绑定信息归一成 { provider: { bound, label } }。
 *
 * 远端结构没有文档，兼容三种常见形态：
 *   1. [{ provider, bound, nickname }] / { list: [...] } / { bindings: [...] }
 *   2. { github: true, google: false }
 *   3. { github: { bound: true, nickname: "xxx" } }
 */
function normalizeBindings(raw: unknown): Record<string, { bound: boolean; label?: string }> {
    const out: Record<string, { bound: boolean; label?: string }> = {};
    const push = (provider: unknown, entry: unknown) => {
        if (typeof provider !== "string" || !provider) return;
        if (typeof entry === "boolean") {
            out[provider] = { bound: entry };
            return;
        }
        if (entry && typeof entry === "object") {
            const obj = entry as Record<string, unknown>;
            const bound = obj.bound ?? obj.is_bound ?? obj.bound_at ?? obj.linked;
            const label = obj.nickname ?? obj.name ?? obj.display_name ?? obj.username ?? obj.email;
            out[provider] = { bound: Boolean(bound), label: typeof label === "string" ? label : undefined };
            return;
        }
        if (typeof entry === "string" && entry) out[provider] = { bound: true, label: entry };
    };

    const list = Array.isArray(raw)
        ? raw
        : raw && typeof raw === "object"
          ? ((raw as Record<string, unknown>).list ?? (raw as Record<string, unknown>).bindings ?? null)
          : null;

    if (Array.isArray(list)) {
        for (const item of list) {
            if (!item || typeof item !== "object") continue;
            const obj = item as Record<string, unknown>;
            push(obj.provider ?? obj.type ?? obj.platform ?? obj.name, obj);
        }
        return out;
    }

    if (raw && typeof raw === "object") {
        for (const [key, value] of Object.entries(raw as Record<string, unknown>)) push(key, value);
    }
    return out;
}

interface OAuthBindingsDialogProps {
    open: boolean;
    onClose: () => void;
}

/** 第三方账号：查看 / 绑定 / 解绑（PRO 模块，远端 /pro/oauth/*） */
export function OAuthBindingsDialog({ open, onClose }: OAuthBindingsDialogProps) {
    const [bindings, setBindings] = useState<Record<string, { bound: boolean; label?: string }>>({});
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState("");

    useEscapeToClose(open, onClose);

    const reload = () => {
        setLoading(true);
        return getOAuthBindingsApi()
            .then((data) => {
                setBindings(normalizeBindings(data));
                setError("");
            })
            .catch((err) => {
                setError(errorText(err, "读取第三方账号绑定失败"));
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        getOAuthBindingsApi()
            .then((data) => {
                if (!cancelled) {
                    setBindings(normalizeBindings(data));
                    setError("");
                }
            })
            .catch((err) => {
                if (!cancelled) setError(errorText(err, "读取第三方账号绑定失败"));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [open]);

    async function handleBind(provider: string) {
        setBusy(provider);
        try {
            const data = await bindOAuthProviderApi(provider);
            const url = typeof data?.url === "string" ? data.url : "";
            if (url) {
                window.location.assign(url);
                return;
            }
            toast.success("已发起绑定，请按提示完成授权");
            await reload();
        } catch (err) {
            toast.error(errorText(err, "发起绑定失败，请稍后再试"));
        } finally {
            setBusy(null);
        }
    }

    async function handleUnbind(provider: string) {
        setBusy(provider);
        try {
            await unbindOAuthProviderApi(provider);
            toast.success("已解绑");
            await reload();
        } catch (err) {
            toast.error(errorText(err, "解绑失败，请稍后再试"));
        } finally {
            setBusy(null);
        }
    }

    if (!open) return null;

    return (
        <div className={styles.dialogOverlay} role="dialog" aria-modal="true" aria-labelledby="oauth-bindings-title" onClick={onClose}>
            <div className={styles.dialogPanel} onClick={(e) => e.stopPropagation()}>
                <button className={styles.dialogClose} aria-label="关闭" onClick={onClose}>
                    <X />
                </button>

                <div className={styles.dialogHeader}>
                    <span className={styles.dialogHeaderIcon}><Link2 /></span>
                    <h2 id="oauth-bindings-title" className={styles.dialogTitle}>第三方账号</h2>
                </div>

                <div className={styles.dialogBody}>
                    <div className={styles.settingAlert}>
                        绑定第三方账号后，可以直接用对应平台一键登录。解绑不影响当前密码登录。
                    </div>

                    {loading ? (
                        <div className={styles.loadingContainer} style={{ minHeight: "100px" }}>
                            <div className={styles.spinner} />
                        </div>
                    ) : error ? (
                        <div className={styles.settingRow}>
                            <div className={styles.settingInfo}>
                                <div className={styles.settingLabel}>暂时无法读取绑定信息</div>
                                <div className={styles.settingDesc}>{error}</div>
                            </div>
                        </div>
                    ) : (
                        OAUTH_PROVIDERS.map((provider) => {
                            const state = bindings[provider.key];
                            const bound = state?.bound === true;
                            return (
                                <div key={provider.key} className={styles.settingRow}>
                                    <div className={styles.settingInfo}>
                                        <div className={styles.settingLabel}>{provider.name}</div>
                                        <div className={styles.settingDesc}>
                                            {bound ? (state?.label ? `已绑定：${state.label}` : "已绑定") : "未绑定"}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        className={styles.btnSecondary}
                                        style={{ flex: "0 0 auto", padding: "0.4rem 1rem", fontSize: "0.875rem" }}
                                        disabled={busy === provider.key}
                                        onClick={() => (bound ? handleUnbind(provider.key) : handleBind(provider.key))}
                                    >
                                        {busy === provider.key ? "处理中…" : bound ? "解绑" : "绑定"}
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>

                <div className={styles.dialogFooter}>
                    <button className={styles.btnSecondary} onClick={onClose}>关闭</button>
                </div>
            </div>
        </div>
    );
}

// ===================== 我的工单（PRO） =====================

interface MyTicketsDialogProps {
    open: boolean;
    onClose: () => void;
}

/**
 * 我的工单：列表接口尚未开放。
 *
 * PRO 后端只有管理端列表（/pro/admin/support/tickets）与用户侧「按 ID 查详情 / 回复」
 * （/pro/support/tickets/{id}），没有用户侧列表；这里请求 /api/user/support-tickets，
 * 失败时展示「后端暂未开放」，等 PRO 补上同路径后自动变成真实列表。
 */
export function MyTicketsDialog({ open, onClose }: MyTicketsDialogProps) {
    const [list, setList] = useState<unknown[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [unavailable, setUnavailable] = useState(false);

    useEscapeToClose(open, onClose);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        getMySupportTicketsApi()
            .then((data) => {
                if (cancelled) return;
                const items = Array.isArray(data)
                    ? data
                    : data && typeof data === "object"
                      ? ((data as Record<string, unknown>).list ?? (data as Record<string, unknown>).items ?? [])
                      : [];
                setList(Array.isArray(items) ? items : []);
            })
            .catch((err) => {
                if (cancelled) return;
                setList(null);
                setUnavailable(true);
                if (!(err instanceof ApiError)) toast.error(errorText(err, "读取工单失败"));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [open]);

    if (!open) return null;

    return (
        <div className={styles.dialogOverlay} role="dialog" aria-modal="true" aria-labelledby="my-tickets-title" onClick={onClose}>
            <div className={styles.dialogPanel} onClick={(e) => e.stopPropagation()}>
                <button className={styles.dialogClose} aria-label="关闭" onClick={onClose}>
                    <X />
                </button>

                <div className={styles.dialogHeader}>
                    <span className={styles.dialogHeaderIcon}><Ticket /></span>
                    <h2 id="my-tickets-title" className={styles.dialogTitle}>我的工单</h2>
                </div>

                <div className={styles.dialogBody}>
                    {loading ? (
                        <div className={styles.loadingContainer} style={{ minHeight: "100px" }}>
                            <div className={styles.spinner} />
                        </div>
                    ) : unavailable ? (
                        <div className={styles.settingAlert}>
                            当前后端还没有提供「用户侧工单列表」接口（PRO 模块目前只有管理端列表），
                            接口开放后这里会自动显示你的工单。
                        </div>
                    ) : !list || list.length === 0 ? (
                        <div className={styles.settingAlert}>还没有工单记录。</div>
                    ) : (
                        <div className={styles.settingRow}>
                            <div className={styles.settingInfo}>
                                <div className={styles.settingLabel}>共 {list.length} 条工单</div>
                                <div className={styles.settingDesc}>详情页尚未实现</div>
                            </div>
                        </div>
                    )}
                </div>

                <div className={styles.dialogFooter}>
                    <button className={styles.btnSecondary} onClick={onClose}>关闭</button>
                </div>
            </div>
        </div>
    );
}
