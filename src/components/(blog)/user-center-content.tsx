"use client";

import { useRef, useState } from "react";
import { useRouter } from "nextjs-toploader/app";
import { Bell, Calendar, Camera, ChevronRight, Home, IdCard, Link2, Lock, LogOut, Mail, Pencil, Ticket, User } from "lucide-react";
import { toast } from "sonner";

import {
    ChangePasswordDialog,
    EditProfileDialog,
    NotificationSettingsDialog,
} from "@/components/(blog)/user-center-dialogs";
import { ApiError, uploadUserAvatarApi } from "@/lib/api";
import { useConfirm } from "@/components/confirm-provider";
import styles from "./user-center.module.css";

/** 用户中心展示所需的用户信息（由服务端 /user/info 取好后传入） */
export interface UserCenterUser {
    id: string;
    username: string;
    nickname: string;
    email: string;
    website?: string;
    /** 已解析好的头像 URL（后端自定义头像优先，否则 Cravatar） */
    avatar: string | null;
    /** 注册时间文案（服务端按固定时区格式化，避免水合不一致） */
    joinedText: string;
    /** 是否管理员（用户组 1） */
    isAdmin: boolean;
}

/**
 * 用户中心（对齐官方 anheyu-app-frontend 的 UserCenterContent）：
 * 资料卡（可点头像上传）+ 操作卡（编辑资料 / 修改密码 / 通知设置 / 退出登录）。
 * 与官方的差异：用户信息来自服务端 props（本应用没有 zustand auth store），
 * 保存后调用 router.refresh() 重新取服务端数据（官方是整页 reload）。
 */
export function UserCenterContent({ user }: { user: UserCenterUser | null }) {
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [showEditProfile, setShowEditProfile] = useState(false);
    const [showChangePassword, setShowChangePassword] = useState(false);
    const [showNotificationSettings, setShowNotificationSettings] = useState(false);
    const [avatarUploading, setAvatarUploading] = useState(false);

    // 应用内确认弹窗（替代 window.confirm，见 components/confirm-provider.tsx，
    // Provider 挂在前台 (blog)/layout.tsx）
    const confirm = useConfirm();

    /** 退出登录：清 cookie 后回首页（官方为确认后 logout + push("/")） */
    async function handleLogout() {
        if (!(await confirm({ title: "确定要退出登录吗？" }))) return;
        try {
            await fetch("/api/auth/logout?redirect=0");
        } finally {
            window.location.href = "/";
        }
    }

    /** 头像上传：校验格式与大小后走 /api/user/avatar（multipart），成功刷新服务端数据 */
    async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        event.target.value = ""; // 允许连续选择同一个文件
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            toast.error("头像文件大小不能超过 5MB");
            return;
        }
        const allowed = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
        if (!allowed.includes(file.type)) {
            toast.error("只支持 JPG、PNG、GIF、WebP 格式的图片");
            return;
        }

        setAvatarUploading(true);
        try {
            await uploadUserAvatarApi(file);
            toast.success("头像已更新");
            router.refresh();
        } catch (err) {
            toast.error(err instanceof ApiError ? err.message : "头像上传失败，请稍后再试");
        } finally {
            setAvatarUploading(false);
        }
    }

    // ===== 未登录 / token 失效：空态（与官方一致） =====
    if (!user) {
        return (
            <div className={styles.container}>
                <div className={styles.notLoggedIn}>
                    <div className={styles.emptyState}>
                        <div className={styles.emptyIcon}><User size={48} /></div>
                        <h2 className={styles.emptyTitle}>请先登录</h2>
                        <p className={styles.emptyDesc}>登录后即可访问用户中心</p>
                        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
                            <button className={styles.homeBtn} onClick={() => router.push("/login")}>
                                去登录
                            </button>
                            <button
                                className={styles.homeBtn}
                                style={{ background: "var(--muted)", color: "var(--foreground)" }}
                                onClick={() => router.push("/")}
                            >
                                <Home size={18} /> 返回首页
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // 操作卡（从左到右：编辑资料、修改密码、通知设置、我的工单、第三方账号、退出登录）
    // accent 用于图标底色与图标配色（淡淡的同色底 + 同色图标）
    const actions = [
        { icon: <Pencil size={20} />, title: "编辑资料", desc: "修改个人信息", accent: "#409eff", onClick: () => setShowEditProfile(true) },
        { icon: <Lock size={20} />, title: "修改密码", desc: "更改登录密码", accent: "#9c27b0", onClick: () => setShowChangePassword(true) },
        { icon: <Bell size={20} />, title: "通知设置", desc: "管理通知偏好", accent: "#e6a23c", onClick: () => setShowNotificationSettings(true) },
        // 后端目前没有用户端工单 / 第三方账号绑定接口，先占位（管理员的工单在后台「售后工单」）
        { icon: <Ticket size={20} />, title: "我的工单", desc: "查看与提交工单", accent: "#67c23a", onClick: () => toast.info("我的工单功能待接入") },
        { icon: <Link2 size={20} />, title: "第三方账号", desc: "绑定与解绑账号", accent: "#13c2c2", onClick: () => toast.info("第三方账号绑定功能待接入") },
    ];

    return (
        <div className={styles.container}>
            <div className={styles.content}>
                {/* ===== 资料卡 ===== */}
                <div className={styles.profileCard}>
                    <div className={styles.profileHeader}>
                        <div className={styles.avatarSection}>
                            <div
                                className={styles.avatarWrapper}
                                onClick={() => {
                                    if (!avatarUploading) fileInputRef.current?.click();
                                }}
                                title="点击更换头像"
                            >
                                {user.avatar ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={user.avatar}
                                        alt={user.nickname || "avatar"}
                                        className={styles.avatar}
                                        width={120}
                                        height={120}
                                    />
                                ) : (
                                    <div className={styles.avatar} style={{ display: "grid", placeItems: "center" }}>
                                        <User size={48} />
                                    </div>
                                )}
                                <div className={styles.avatarOverlay}>
                                    <Camera />
                                </div>
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                                className="hidden"
                                onChange={handleAvatarChange}
                            />
                        </div>
                        <div className={styles.userInfo}>
                            <h1 className={styles.nickname}>{user.nickname || user.username}</h1>
                            <div className={styles.metaRow}>
                                <span className={styles.metaTag}><IdCard size={14} /> UID: {user.id || user.username}</span>
                                <span className={styles.metaTag}><Calendar size={14} /> 加入于 {user.joinedText}</span>
                            </div>
                            <div className={styles.email}><Mail size={14} /> {user.email}</div>
                            <div className={styles.badges}>
                                <span className={styles.badge}>{user.isAdmin ? "管理员" : "普通用户"}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ===== 操作卡 ===== */}
                <div className={styles.actionCards}>
                    {actions.map((action) => (
                        <div
                            key={action.title}
                            className={styles.actionCard}
                            style={{ "--accent": action.accent } as React.CSSProperties}
                            onClick={action.onClick}
                        >
                            <div className={styles.actionIcon}>{action.icon}</div>
                            <div className={styles.actionContent}>
                                <div className={styles.actionTitle}>{action.title}</div>
                                <div className={styles.actionDesc}>{action.desc}</div>
                            </div>
                            <ChevronRight className={styles.actionArrow} />
                        </div>
                    ))}
                    <div
                        className={`${styles.actionCard} ${styles.danger}`}
                        style={{ "--accent": "var(--destructive)" } as React.CSSProperties}
                        onClick={() => void handleLogout()}
                    >
                        <div className={styles.actionIcon}><LogOut size={20} /></div>
                        <div className={styles.actionContent}>
                            <div className={styles.actionTitle}>退出登录</div>
                            <div className={styles.actionDesc}>安全退出当前账号</div>
                        </div>
                        <ChevronRight className={styles.actionArrow} />
                    </div>
                </div>
            </div>

            {/* 弹窗：仅在打开时挂载（挂载即重置表单，避免 effect 内同步 setState） */}
            {showEditProfile && (
                <EditProfileDialog
                    open
                    onClose={() => setShowEditProfile(false)}
                    onSuccess={() => router.refresh()}
                    userInfo={{
                        nickname: user.nickname,
                        email: user.email,
                        website: user.website || "",
                    }}
                />
            )}
            {showChangePassword && (
                <ChangePasswordDialog open onClose={() => setShowChangePassword(false)} />
            )}
            {showNotificationSettings && (
                <NotificationSettingsDialog open onClose={() => setShowNotificationSettings(false)} />
            )}
        </div>
    );
}
