// 验证导航菜单动态渲染
const BASE = "http://localhost:3126";

const html = (await (await fetch(`${BASE}/`)).text()).replace(/<!-- -->/g, "");

const checks = [
    // 站点名（来自配置）
    "葱苓小筑",
    // 分组标题
    "文库", "友链", "我的", "关于",
    // 菜单项标题
    "全部文章", "分类列表", "标签列表", "友情链接", "音乐馆", "相册集", "关于本站", "我的装备",
    // 路径
    "/archives", "/categories", "/tags", "/link", "/music", "/about",
    // 图标 class
    "anzhiyu-icon-book",
    // 外链属性渲染
];
console.log("== 首页导航菜单 ==");
for (const c of checks) {
    console.log(`  ${c}:`, html.includes(c));
}
// 确认菜单项是 <a href=...> 链接
const linkCount = (html.match(/href="\/(archives|categories|tags|link|music|about)"/g) || []).length;
console.log(" 渲染出的菜单链接数:", linkCount);
