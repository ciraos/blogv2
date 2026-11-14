// import Link from "next/link";
// import { NavDocuments } from "@/components/nav-documents"
import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar"
import { SidebarCollapseButton } from "@/components/sidebar-collapse-button"
import {
  LayoutDashboardIcon,
  FileTextIcon,
  MessageSquareIcon,
  UsersIcon,
  ExternalLinkIcon,
  CommandIcon,
  Grid2x2Plus,
  Settings
} from "lucide-react"
import { SiteConfig } from "@/types/site-config";
import { APP_VERSION_LABEL } from "@/lib/version";
import { resolveAssetUrl } from "@/lib/utils";

const data = {
  navMain: [
    {
      title: "仪表盘",
      url: "/admin/dashboard",
      icon: (<LayoutDashboardIcon />),
    },
    {
      title: "概览",
      icon: (<Grid2x2Plus />),
      items: [
        { title: "文件管理", url: "/admin/file-management" },
      ]
    },
    {
      title: "内容管理",
      icon: (<FileTextIcon />),
      items: [
        { title: "文章管理", url: "/admin/post-management" },
        { title: "页面管理", url: "/admin/page-management" },
        { title: "文档系列", url: "/admin/doc-series" },
        { title: "说说管理", url: "/admin/essays", pro: true },
        { title: "评论管理", url: "/admin/comments" },
        { title: "相册管理", url: "/admin/albums" },
      ],
    },
    {
      title: "互动管理",
      icon: (<MessageSquareIcon />),
      items: [
        { title: "友链", url: "/admin/friends" },
        { title: "朋友圈", url: "/admin/moments", pro: true },
        { title: "用户管理", url: "/admin/users" },
      ],
    },
    {
      title: "运营管理",
      icon: (<UsersIcon />),
      items: [
        { title: "订单管理", url: "/admin/orders", pro: true },
        { title: "打赏管理", url: "/admin/donations", pro: true },
        { title: "商品管理", url: "/admin/products", pro: true },
        { title: "会员管理", url: "/admin/memberships", pro: true },
        { title: "售后工单", url: "/admin/supports", pro: true },
      ],
    }, {
      title: "系统管理",
      icon: (<Settings />),
      items: [
        { title: "系统设置", url: "/admin/settings" },
        { title: "配置备份", url: "/admin/backup" },
        { title: "通知管理", url: "/admin/notifications" },
        { title: "SEO 推送", url: "/admin/seo-push", pro: true },
        { title: "存储策略", url: "/admin/storage" },
        { title: "图片样式缓存", url: "/admin/image-styles/cache", pro: true },
        { title: "缓存管理", url: "/admin/cache-management" },
        { title: "主题商城", url: "/admin/themes" },
        { title: "知识库管理", url: "/admin/knowledge" },
        { title: "插件管理", url: "/admin/plugins" },
      ]
    }
  ],
  navClouds: [],
  // 只留「访问前台」：「设置」在「系统管理 → 系统设置」里已经有了，底部这个入口是重复的。
  navSecondary: [
    {
      title: "访问前台",
      url: "/",
      icon: (<ExternalLinkIcon />),
      target: "_blank",
    }
  ],
  documents: [],
}

export function AppSidebar({
  user,
  config,
  isPro = true,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  /** 当前登录用户（由 admin layout 从 /user/info 获取） */
  user: { name: string; email: string; avatar: string }
  /** 站点配置（由 admin layout 传入，避免这里再发一次 /public/site-config） */
  config?: SiteConfig
  /** 后端是否 PRO 版：社区版把带 `pro: true` 的菜单项整条隐藏（默认 true，避免接口抖动时误伤） */
  isPro?: boolean
}) {
  // 社区版：过滤掉标记了 pro 的子项；某分组过滤后没有子项则整组不渲染
  const navMain = isPro
    ? data.navMain
    : data.navMain
        .map((group) =>
          "items" in group && Array.isArray(group.items)
            ? { ...group, items: group.items.filter((item) => !("pro" in item) || !item.pro) }
            : group
        )
        .filter((group) => !("items" in group) || !Array.isArray(group.items) || group.items.length > 0)

  return (
    <Sidebar collapsible="icon" variant="floating" className="dsh-sidebar-flat" {...props}>

      <SidebarHeader>
        {/* 顶部一行：收缩按钮 → 站点名称 → 版本（依次排列）。
            收起为 icon 模式时改为竖排居中，站名与版本自动隐藏，只留图标 + 收缩按钮 */}
        {/* 顶部：收缩按钮 → 站点图标 → 站点名称 → 版本。
            收起成 icon 模式时整块品牌区隐藏、只留居中的收缩按钮（底部同理只留头像）。 */}
        <div className="flex items-center gap-2 px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <SidebarCollapseButton />
          <div className="flex min-w-0 items-center gap-2 group-data-[collapsible=icon]:hidden">
            {/* 站点图标：优先用站点配置里的 ICON_URL（千站千面），取不到才回退到通用图标 */}
            {config?.ICON_URL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={resolveAssetUrl(config.ICON_URL) ?? ""}
                    alt=""
                    aria-hidden="true"
                    className="size-5 shrink-0 rounded-sm object-cover"
                />
            ) : (
                <CommandIcon className="size-5! shrink-0" />
            )}
            {/* 站名走前台的衬线刊头字，后台与前台是同一个产品，不该在两处换字体 */}
            <span className="editorial-serif truncate text-[15px] leading-none font-semibold">{config?.APP_NAME}</span>
            {/* 前端版本号（package.json → 构建时注入，与后端版本无关）。纯灰小字，不加底色 */}
            <span className="shrink-0 font-mono text-[10px] font-normal tabular-nums text-muted-foreground/80">
              {APP_VERSION_LABEL}
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <NavMain items={navMain} />
        {/* <NavDocuments items={data.documents} /> */}
      </SidebarContent>

      {/* 「访问前台」原本贴在 SidebarContent 底部（mt-auto），菜单一长就跟着一起滚走。
          现在搬到滚动区外面：常驻在导航卡片下方、用户卡片上方，只有上面的菜单自己滚
          （sidebar-content 自带 overflow-auto，是唯一的滚动容器）。 */}
      <NavSecondary items={data.navSecondary} className="pb-1" />

      <SidebarFooter>
        {/* 版本号已移到顶栏（收缩按钮 / 站名之后），这里只留用户卡片 */}
        <NavUser user={user} />
      </SidebarFooter>

    </Sidebar>
  )
}
