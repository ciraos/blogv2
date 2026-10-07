"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "nextjs-toploader/app";
import { Bell, Crown, Inbox, MessageSquare, MessagesSquare, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import {
    ApiError,
    getNotificationsApi,
    markAllNotificationsReadApi,
    markNotificationReadApi,
    type NotificationItem,
} from "@/lib/api";
import styles from "./notifications.module.css";

/** 通知分类（与官方一致：未读消息 / 文章评论 / 购买通知 / 会员服务 / 系统通知） */
const CATEGORIES = [
    { key: "unread", label: "未读消息", icon: <MessageSquare size={16} />, color: "#49b1f5", bgColor: "#e8f7ff" },
    { key: "COMMENT", label: "文章评论", icon: <MessagesSquare size={16} />, color: "#49b1f5", bgColor: "#e8f7ff" },
    { key: "PURCHASE", label: "购买通知", icon: <ShoppingCart size={16} />, color: "#67c23a", bgColor: "#e8f8e8" },
    { key: "MEMBERSHIP", label: "会员服务", icon: <Crown size={16} />, color: "#e6a23c", bgColor: "#fef6e8" },
    { key: "SYSTEM", label: "系统通知", icon: <Bell size={16} />, color: "#409eff", bgColor: "#ecf5ff" },
];

/** 列表项里显示的通知类型文案 */
const TYPE_LABELS: Record<string, string> = {
    COMMENT: "评论消息",
    PURCHASE: "购买通知",
    MEMBERSHIP: "会员服务",
    SYSTEM: "系统通知",
};

/** 各分类未读数（unread 为总数；SUPPORT 对应后端 TICKET 类型） */
interface UnreadCounts {
    unread: number;
    COMMENT: number;
    PURCHASE: number;
    MEMBERSHIP: number;
    SUPPORT: number;
    SYSTEM: number;
    [key: string]: number;
}

const EMPTY_COUNTS: UnreadCounts = { unread: 0, COMMENT: 0, PURCHASE: 0, MEMBERSHIP: 0, SUPPORT: 0, SYSTEM: 0 };

/** 相对时间（与官方口径一致：刚刚 / N分钟前 / N小时前 / N天前 / N周前 / 月日） */
function relativeTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const minutes = Math.floor((Date.now() - d.getTime()) / 60000);
    if (minutes < 1) return "刚刚";
    if (minutes < 60) return `${minutes}分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}天前`;
    if (days < 30) return `${Math.floor(days / 7)}周前`;
    return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

/** 详情页时间（完整日期时间） */
function fullTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

interface CategoryMeta {
    color: string;
    bgColor: string;
}

/** 通知列表（含空态与「没有更多内容了」） */
function NotificationList({
    notifications,
    category,
    onSelect,
}: {
    notifications: NotificationItem[];
    category: CategoryMeta;
    onSelect: (item: NotificationItem) => void;
}) {
    if (notifications.length === 0) {
        return (
            <div className={styles.emptyState}>
                <div className={styles.emptyIcon}><Inbox size={48} /></div>
                <span>暂无消息</span>
            </div>
        );
    }

    return (
        <div>
            {notifications.map((item) => (
                <div
                    key={item.id}
                    className={`${styles.notificationItem} ${!item.is_read ? styles.notificationItemUnread : ""}`}
                    onClick={() => onSelect(item)}
                >
                    <div
                        className={styles.notificationIcon}
                        style={{ backgroundColor: category.bgColor, color: category.color }}
                    >
                        {!item.is_read && <span className={styles.newBadge}>NEW</span>}
                        <MessageSquare size={18} />
                    </div>
                    <div className={styles.notificationContent}>
                        <div className={styles.notificationTitle}>{item.title}</div>
                        <div className={styles.notificationMeta}>
                            <span>{relativeTime(item.created_at)}</span>
                            <span className={styles.notificationType}>{TYPE_LABELS[item.type] || "通知"}</span>
                        </div>
                    </div>
                </div>
            ))}
            <div className={styles.listEnd}>没有更多内容了</div>
        </div>
    );
}

/**
 * 消息通知（对齐官方 anheyu-app-frontend 的 (frontend)/notifications）：
 * 左侧分类（未读消息 / 文章评论 / 购买通知 / 会员服务 / 系统通知，带未读角标）+ 右侧列表，
 * 点条目即标记已读并进入详情（有 link 时显示「查看详情 →」）；支持「全部标为已读」。
 * 数据：GET /pro/notifications（page_size=100, unread_only=false），未读数由列表本地聚合。
 */
export function NotificationsContent({ isLoggedIn }: { isLoggedIn: boolean }) {
    const router = useRouter();
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<NotificationItem | null>(null);
    const [activeCategory, setActiveCategory] = useState("unread");
    const [unreadCounts, setUnreadCounts] = useState<UnreadCounts>(EMPTY_COUNTS);

    // 拉取通知列表（未登录不请求）
    useEffect(() => {
        if (!isLoggedIn) return;
        let cancelled = false;
        getNotificationsApi({ page: 1, page_size: 100, unread_only: false })
            .then((data) => {
                if (cancelled) return;
                const list = data?.list ?? [];
                setNotifications(list);
                setUnreadCounts({
                    unread: data?.unread_count ?? 0,
                    COMMENT: list.filter((n) => n.type === "COMMENT" && !n.is_read).length,
                    PURCHASE: list.filter((n) => n.type === "PURCHASE" && !n.is_read).length,
                    MEMBERSHIP: list.filter((n) => n.type === "MEMBERSHIP" && !n.is_read).length,
                    SUPPORT: list.filter((n) => n.type === "TICKET" && !n.is_read).length,
                    SYSTEM: list.filter((n) => n.type === "SYSTEM" && !n.is_read).length,
                });
            })
            .catch((err) => {
                if (!cancelled) {
                    toast.error(err instanceof ApiError ? err.message : "获取通知列表失败，请稍后再试");
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [isLoggedIn]);

    const activeCategoryMeta = useMemo(
        () => CATEGORIES.find((c) => c.key === activeCategory) ?? CATEGORIES[0],
        [activeCategory]
    );

    const filtered = useMemo(
        () =>
            activeCategory === "unread"
                ? notifications.filter((n) => !n.is_read)
                : notifications.filter((n) => n.type === activeCategory),
        [notifications, activeCategory]
    );

    /** 打开某条通知：先本地选中进入详情，未读则同步标记已读（标记失败不阻塞查看） */
    const selectNotification = useCallback(async (item: NotificationItem) => {
        setSelected(item);
        if (item.is_read) return;
        try {
            await markNotificationReadApi(item.id);
            setNotifications((prev) => prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)));
            setUnreadCounts((prev) => ({
                ...prev,
                unread: Math.max(0, prev.unread - 1),
                ...(item.type in prev ? { [item.type]: Math.max(0, prev[item.type] - 1) } : {}),
            }));
        } catch {
            // 标记已读失败：保留未读状态，不影响查看详情
        }
    }, []);

    /** 全部标为已读 */
    const markAllAsRead = useCallback(async () => {
        try {
            await markAllNotificationsReadApi();
            setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
            setUnreadCounts(EMPTY_COUNTS);
        } catch {
            toast.error("操作失败，请稍后再试");
        }
    }, []);

    /** 「查看详情 →」：外链新标签打开，站内链接直接跳转 */
    const goToLink = useCallback(() => {
        const link = selected?.link;
        if (!link) return;
        if (link.startsWith("http://") || link.startsWith("https://")) {
            window.open(link, "_blank", "noopener,noreferrer");
        } else {
            window.location.href = link;
        }
    }, [selected]);

    // 未登录：提示登录（与官方「请先登录后查看通知」一致）
    if (!isLoggedIn) {
        return (
            <div className={styles.container}>
                <div className={styles.contentCard}>
                    <div className={styles.emptyState}>
                        <div className={styles.emptyIcon}><Inbox size={48} /></div>
                        <span>请先登录后查看通知</span>
                        <button type="button" className={styles.markAllBtn} onClick={() => router.push("/login")}>
                            去登录
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.layout}>
                {/* 分类侧栏 */}
                <div className={styles.sidebar}>
                    {CATEGORIES.map((category) => {
                        const count = unreadCounts[category.key] ?? 0;
                        return (
                            <div
                                key={category.key}
                                className={`${styles.categoryItem} ${activeCategory === category.key ? styles.categoryItemActive : ""}`}
                                onClick={() => {
                                    setActiveCategory(category.key);
                                    setSelected(null);
                                }}
                            >
                                <span
                                    className={styles.categoryIcon}
                                    style={{ backgroundColor: category.bgColor, color: category.color }}
                                >
                                    {category.icon}
                                </span>
                                <span className={styles.categoryLabel}>{category.label}</span>
                                {count > 0 && (
                                    <span className={styles.categoryBadge}>{count > 99 ? "99+" : count}</span>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* 内容区：详情 / 加载 / 列表 */}
                <div className={styles.contentCard}>
                    {selected ? (
                        <div className={styles.detailView}>
                            <button type="button" className={styles.backBtn} onClick={() => setSelected(null)}>
                                ← 返回列表
                            </button>
                            <div className={styles.detailHeader}>
                                <h2 className={styles.detailTitle}>{selected.title}</h2>
                                <div className={styles.detailMeta}>
                                    <span>{fullTime(selected.created_at)}</span>
                                    <span className={styles.detailType}>{TYPE_LABELS[selected.type] || "通知"}</span>
                                </div>
                            </div>
                            <div
                                className={styles.detailContent}
                                dangerouslySetInnerHTML={{ __html: selected.content || "" }}
                            />
                            {selected.link && (
                                <button type="button" className={styles.detailLinkBtn} onClick={goToLink}>
                                    查看详情 →
                                </button>
                            )}
                        </div>
                    ) : loading ? (
                        <div className={styles.loadingWrapper}>
                            <div className={styles.spinner} />
                        </div>
                    ) : (
                        <>
                            <div className={styles.toolbar}>
                                <button type="button" className={styles.markAllBtn} onClick={markAllAsRead}>
                                    全部标为已读
                                </button>
                            </div>
                            <NotificationList
                                notifications={filtered}
                                category={activeCategoryMeta}
                                onSelect={selectNotification}
                            />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
