// 后台列表「操作列」按钮的统一配色。
//
// 设计约定：一个浅色底 + 同色图标/文字，hover 时底色加深；同一行内每个动作颜色都不同，
// 深浅色主题下都可读（深色用浅一号的 400 色）。用法：
//   <Button variant="ghost" size="icon-sm" className={ACTION_TONE.edit} …><Pencil /></Button>
//
// 注意：Button 的 ghost 变体自带 hover:bg-muted / dark:hover:bg-muted/50，
// 会盖掉 hover 底色，所以 hover 背景用 `!` 提权。
export const ACTION_TONE = {
    /** 查看 / 预览 / 打开前台：蓝 */
    view: "rounded-lg bg-blue-500/10 text-blue-600 hover:bg-blue-500/20! hover:text-blue-600 dark:text-blue-400 dark:hover:bg-blue-400/25!",
    /** 编辑：橙 */
    edit: "rounded-lg bg-orange-500/10 text-orange-600 hover:bg-orange-500/20! hover:text-orange-600 dark:text-orange-400 dark:hover:bg-orange-400/25!",
    /** 删除：红 */
    delete: "rounded-lg bg-red-500/10 text-red-600 hover:bg-red-500/20! hover:text-red-600 dark:text-red-400 dark:hover:bg-red-400/25!",
    /** 通过 / 发布 / 解封 / 启用：绿 */
    approve: "rounded-lg bg-green-500/10 text-green-600 hover:bg-green-500/20! hover:text-green-600 dark:text-green-400 dark:hover:bg-green-400/25!",
    /** 中性动作（下线 / 转待审 / 取消置顶等）：灰 */
    neutral: "rounded-lg bg-slate-500/10 text-slate-600 hover:bg-slate-500/20! hover:text-slate-600 dark:text-slate-300 dark:hover:bg-slate-400/25!",
    /** 置顶 / 加精：紫 */
    pin: "rounded-lg bg-violet-500/10 text-violet-600 hover:bg-violet-500/20! hover:text-violet-600 dark:text-violet-400 dark:hover:bg-violet-400/25!",
    /** 重置密码 / 密钥类：青 */
    key: "rounded-lg bg-cyan-500/10 text-cyan-600 hover:bg-cyan-500/20! hover:text-cyan-600 dark:text-cyan-400 dark:hover:bg-cyan-400/25!",
    /** 封禁 / 禁用类：品红（避开橙、红，保证同一行里看得出区别） */
    block: "rounded-lg bg-fuchsia-500/10 text-fuchsia-600 hover:bg-fuchsia-500/20! hover:text-fuchsia-600 dark:text-fuchsia-400 dark:hover:bg-fuchsia-400/25!",
} as const;

export type ActionTone = keyof typeof ACTION_TONE;
