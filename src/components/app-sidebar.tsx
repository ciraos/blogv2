import Link from "next/link";
import { NavDocuments } from "@/components/nav-documents"
import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  LayoutDashboardIcon,
  FileTextIcon,
  MessageSquareIcon,
  UsersIcon,
  Settings2Icon,
  CircleHelpIcon,
  CommandIcon,
  Grid2x2Plus,
  Settings
} from "lucide-react"
import { SiteConfigResponse } from "@/types/site-config";

const api_url = process.env.NEXT_PUBLIC_API_URL;

export async function getSiteConfigs() {
  try {
    const i = await fetch(`${api_url}/public/site-config`);
    if (!i.ok) throw new Error("获取配置失败！");
    const data = (await i.json()) as SiteConfigResponse;
    // console.log(data);
    return data.data;
  } catch (error) {
    // return { APP_NAME: "博客", ICON_URL: "/favicon.ico", error };
    console.error(error);
  }
}

const config = await getSiteConfigs();
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
        { title: "说说管理", url: "/admin/essays" },
        { title: "评论管理", url: "/admin/comments" },
        { title: "相册管理", url: "/admin/albums" },
      ],
    },
    {
      title: "互动管理",
      icon: (<MessageSquareIcon />),
      items: [
        { title: "友链", url: "/admin/friends" },
        { title: "朋友圈", url: "/admin/moments" },
        { title: "用户管理", url: "/admin/users" },
      ],
    },
    {
      title: "运营管理",
      icon: (<UsersIcon />),
      items: [
        { title: "订单管理", url: "/admin/orders" },
        { title: "打赏管理", url: "/admin/donations" },
        { title: "商品管理", url: "/admin/products" },
        { title: "会员管理", url: "/admin/memberships" },
        { title: "售后工单", url: "/admin/supports" },
      ],
    }, {
      title: "系统管理",
      icon: (<Settings />),
      items: [
        { title: "系统设置", url: "/admin/settings" },
        { title: "SEO 推送", url: "/admn/seo-push" },
        { title: "存储策略", url: "/admin/storage" },
        { title: "图片样式缓存", url: "/admin/image-styles/cache" },
        { title: "主题商城", url: "/admin/themes" },
        { title: "知识库管理", url: "/admin/knowledge" },
        { title: "插件管理", url: "/admin/plugins" },
      ]
    }
  ],
  navClouds: [],
  navSecondary: [
    {
      title: "设置",
      url: "/admin/settings",
      icon: (<Settings2Icon />),
    },
    {
      title: "访问前台",
      url: "/",
      icon: (<CircleHelpIcon />),
      target: "_blank",
    }
  ],
  documents: [],
}

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  /** 当前登录用户（由 admin layout 从 /user/info 获取） */
  user: { name: string; email: string; avatar: string }
}) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>

      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <div>
                <CommandIcon className="size-5!" />
                <span className="text-base font-semibold">{config?.APP_NAME}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <NavMain items={data.navMain} />
        {/* <NavDocuments items={data.documents} /> */}
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>

    </Sidebar>
  )
}
