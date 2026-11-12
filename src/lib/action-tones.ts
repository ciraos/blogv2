// 后台列表「操作列」按钮的统一配色。
//
// 设计约定（编辑部风）：**静止时一律是次级灰，颜色只在 hover 时出现**。
//
// 为什么要再收一次：上一版是「透明底 + 同色文字」，本意是去色块，但一行里
// 预览=蓝、编辑=橙、删除=红三个彩色文字并排，二十多个列表页每行都重复一遍，
// 结果就是**整屏没有重点**——颜色该留给「这一行现在怎么了」，不是「这里有三个按钮」。
// 按钮的语义已经由图标和文字（预览/编辑/删除）说清楚了，颜色是多余的。
//
// 现在：静止 muted，hover 浅底 + 语义色。危险动作（删除/封禁）依旧只在 hover 变红，
// 不常驻红字；正向动作（通过/发布）hover 变绿。
//
// 注意：Button 的 ghost 变体自带 hover:bg-muted，会盖掉 hover 底色，
// 所以 hover 背景用 `!` 提权。
const base = "rounded-md bg-transparent text-muted-foreground";

/** 中性动作：hover 只提亮文字，不加颜色 */
const quiet = `${base} hover:bg-muted! hover:text-foreground`;

export const ACTION_TONE = {
    /** 查看 / 预览 / 打开前台 */
    view: quiet,
    /** 编辑 */
    edit: quiet,
    /** 中性动作（下线 / 转待审 / 取消置顶等） */
    neutral: quiet,
    /** 置顶 / 加精 */
    pin: quiet,
    /** 重置密码 / 密钥类 */
    key: quiet,
    /** 通过 / 发布 / 解封 / 启用：hover 绿 */
    approve: `${base} hover:bg-emerald-500/10! hover:text-emerald-600 dark:hover:text-emerald-400`,
    /** 删除：hover 红 */
    delete: `${base} hover:bg-red-500/10! hover:text-red-600 dark:hover:text-red-400`,
    /** 封禁 / 禁用类：hover 红（与删除同一语义层，不再用单独一个品红） */
    block: `${base} hover:bg-red-500/10! hover:text-red-600 dark:hover:text-red-400`,
} as const;

export type ActionTone = keyof typeof ACTION_TONE;
