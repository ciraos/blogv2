/**
 * 本浏览器「点过赞的评论 id」记账（localStorage）。
 *
 * 为什么需要前端自己记：后端 `/public/comments/{id}/like` 只是把 like_count +1，
 * **不校验是否点过、也不记是谁点的**（scripts/swagger.yaml 该接口无 body、无鉴权）。
 * 没有这份记账，用户连点十下就是 +10，再点 unlike 还能把计数减成负数。
 *
 * 设计要点：
 * - 用 `useSyncExternalStore` 消费（见 post-comments.tsx），而不是在 useEffect 里 setState ——
 *   后者会触发 react-compiler 的 set-state-in-effect 规则，也会多渲染一帧；
 * - 快照必须**稳定引用**（返回 boolean，不是 Set），否则 useSyncExternalStore 会死循环；
 * - 隐私模式/配额满时 localStorage 会抛异常，全部吞掉并退化成「内存里记」。
 */
const KEY = "ciraos:liked-comments";

const listeners = new Set<() => void>();
let cache: Set<string> | null = null;

function read(): Set<string> {
    if (cache) return cache;
    try {
        const raw = window.localStorage.getItem(KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        cache = new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []);
    } catch {
        cache = new Set();
    }
    return cache;
}

function persist(next: Set<string>) {
    cache = next;
    try {
        window.localStorage.setItem(KEY, JSON.stringify([...next]));
    } catch {
        // 忽略：配额/隐私模式，退化为内存记账
    }
    // 快照是 boolean，React 只能靠订阅通知重读，所以每次变更都要广播
    for (const listener of listeners) listener();
}

/** 该评论在本浏览器里是否已点赞（供 useSyncExternalStore 的 getSnapshot 使用） */
export function isCommentLiked(id: string): boolean {
    if (typeof window === "undefined") return false;
    return read().has(id);
}

/** 记录/取消「已点赞」 */
export function setCommentLiked(id: string, liked: boolean) {
    if (typeof window === "undefined") return;
    const current = read();
    if (liked === current.has(id)) return;
    const next = new Set(current);
    if (liked) next.add(id);
    else next.delete(id);
    persist(next);
}

/** useSyncExternalStore 的 subscribe */
export function subscribeCommentLikes(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** SSR 快照：服务端永远算「没点过」 */
export function getCommentLikeServerSnapshot(): boolean {
    return false;
}
