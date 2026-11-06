// 后台列表「操作列」按钮的统一配色。
//
// 设计约定（编辑部风）：**默认透明底 + 同色文字**，hover 才出现一层很浅的同色底。
// 原来是「浅色块 + 同色字」，一行里三个色块像三颗糖；现在只留文字颜色做区分，
// 表格看起来干净，颜色也还在（预览=蓝 / 编辑=橙 / 删除=红 / 通过=绿 …）。
//
// 注意：Button 的 ghost 变体自带 hover:bg-muted，会盖掉 hover 底色，
// 所以 hover 背景用 `!` 提权。
const base = "rounded-md bg-transparent";

export const ACTION_TONE = {
    /** 查看 / 预览 / 打开前台：蓝 */
    view: `${base} text-blue-600 hover:bg-blue-500/10! hover:text-blue-600 dark:text-blue-400 dark:hover:bg-blue-400/15!`,
    /** 编辑：橙 */
    edit: `${base} text-orange-600 hover:bg-orange-500/10! hover:text-orange-600 dark:text-orange-400 dark:hover:bg-orange-400/15!`,
    /** 删除：红 */
    delete: `${base} text-red-600 hover:bg-red-500/10! hover:text-red-600 dark:text-red-400 dark:hover:bg-red-400/15!`,
    /** 通过 / 发布 / 解封 / 启用：绿 */
    approve: `${base} text-green-600 hover:bg-green-500/10! hover:text-green-600 dark:text-green-400 dark:hover:bg-green-400/15!`,
    /** 中性动作（下线 / 转待审 / 取消置顶等）：灰 */
    neutral: `${base} text-slate-600 hover:bg-slate-500/10! hover:text-slate-600 dark:text-slate-300 dark:hover:bg-slate-400/15!`,
    /** 置顶 / 加精：紫 */
    pin: `${base} text-violet-600 hover:bg-violet-500/10! hover:text-violet-600 dark:text-violet-400 dark:hover:bg-violet-400/15!`,
    /** 重置密码 / 密钥类：青 */
    key: `${base} text-cyan-600 hover:bg-cyan-500/10! hover:text-cyan-600 dark:text-cyan-400 dark:hover:bg-cyan-400/15!`,
    /** 封禁 / 禁用类：品红（避开橙、红，保证同一行里看得出区别） */
    block: `${base} text-fuchsia-600 hover:bg-fuchsia-500/10! hover:text-fuchsia-600 dark:text-fuchsia-400 dark:hover:bg-fuchsia-400/15!`,
} as const;

export type ActionTone = keyof typeof ACTION_TONE;
