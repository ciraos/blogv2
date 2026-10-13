// 图表（饼图/图例）配色：只在这里定义「第几段用什么颜色」，所有饼图一律消费它。
//
// 为什么用 CSS 令牌（globals.css 的 --chart-1…--chart-6 / --chart-other）而不是在这里写死色值：
//   ① 深浅色需要**两套明度**（同一组色在深色底上发闷、在浅色底上发飘），令牌能让 :root / .dark 各给一套；
//   ② 换肤时 appearance.ts 会把令牌内联进 :root，图表颜色跟着一起换，组件不用动；
//   ③ 组件只认「第 i 段 = var(--chart-N)」，以后调配色只改 globals.css 一处。
// 色相刻意拉开（青 / 蓝 / 紫 / 琥珀 / 玫红 / 石灰），不靠同一色相的明度差区分。

/** 彩色槽位（0-based 取用）：饼图扇区与列表色点共用，保证「色点 ↔ 扇区」同色 */
export const CHART_SLICE_COLORS = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
    "var(--chart-6)",
] as const;

/** 「其他」段/色点：中性灰，不占用彩色槽位（占用了会把相邻两项挤成相近色） */
export const CHART_OTHER_COLOR = "var(--chart-other)";

/** 第 index 段（0-based）的颜色；槽位用完（第 7 段起）统一落到中性灰 */
export function sliceColor(index: number): string {
    return CHART_SLICE_COLORS[index] ?? CHART_OTHER_COLOR;
}
