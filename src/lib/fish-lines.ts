/**
 * 友链鱼塘（钓鱼）趣味前缀文案。
 *
 * 抽签放在服务端首屏（页面以 force-dynamic 每请求随机一次）并作为 prop 下传，
 * 客户端水合时读同一个值 —— 不能在组件里用 `useState(() => pick())`：
 * 那样服务端与客户端会各抽一次，两次结果大概率不同，React 会报水合文本不匹配（#418）。
 */
export const FISH_LINES = [
    "外星人降临地球学习地球文化，落地时被你塞了",
    "考古学家发现了一篇沉睡千年的文章，来自友链",
    "你在深海里打捞起一份宝藏，来自友链",
    "有一只信鸽穿越山海送来一篇文章，来自友链",
];

/** 随机抽一句（服务端首屏与客户端「换一篇」共用） */
export function pickFishLine(): string {
    return FISH_LINES[Math.floor(Math.random() * FISH_LINES.length)];
}
