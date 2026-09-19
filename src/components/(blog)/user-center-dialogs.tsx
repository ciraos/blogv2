"use client";

import { useEffect, useState } from "react";
import { Bell, Lock, Pencil, X } from "lucide-react";
import { toast } from "sonner";

import {
    ApiError,
    getNotificationSettingsApi,
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
