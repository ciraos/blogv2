
// ===================== 通用顶层响应类型 =====================
export interface ApiResponse<T> {
    code: number;
    message: string;
    data: T;
}

// ===================== 站点总配置 =====================
export interface SiteConfig {
    ABOUT_LINK: string;
    API_URL: string;
    APPEARANCE_SKIN: string;
    APPEARANCE_TOKENS: Record<string, any>;
    APP_NAME: string;
    APP_VERSION: string;
    BUILTIN_DIRECT_SERVE_EXTS: string;
    BUILTIN_MAX_FILE_SIZE: number;
    CREATIVITY: CreativityConfig;
    CUSTOM_CSS: string;
    CUSTOM_FOOTER_HTML: string;
    CUSTOM_HEADER_HTML: string;
    CUSTOM_JS: string;
    CUSTOM_POST_BOTTOM_HTML: string;
    CUSTOM_POST_TOP_HTML: string;
    CUSTOM_SIDEBAR: any[];
    DEFAULT_BIG_PARAM: string;
    DEFAULT_GRAVATAR_TYPE: string;
    DEFAULT_THEME_MODE: "light" | "dark";
    DEFAULT_THUMB_PARAM: string;
    ENABLE_BUILTIN_GENERATOR: boolean;
    ENABLE_EXIF_EXTRACTOR: boolean;
    ENABLE_EXTERNAL_LINK_WARNING: boolean;
    ENABLE_FFMPEG_GENERATOR: boolean;
    ENABLE_LIBRAW_GENERATOR: boolean;
    ENABLE_MUSIC_COVER_GENERATOR: boolean;
    ENABLE_MUSIC_EXTRACTOR: boolean;
    ENABLE_REGISTRATION: boolean;
    ENABLE_VIPS_GENERATOR: boolean;
    EXIF_MAX_SIZE_LOCAL: number;
    EXIF_MAX_SIZE_REMOTE: number;
    EXIF_USE_BRUTE_FORCE: boolean;
    FFMPEG_CAPTURE_TIME: string;
    FFMPEG_MAX_FILE_SIZE: number;
    FFMPEG_SUPPORTED_EXTS: string;
    FRIEND_LINK_APPLY_CONDITION: string[];
    FRIEND_LINK_APPLY_CUSTOM_CODE: string;
    FRIEND_LINK_APPLY_CUSTOM_CODE_HTML: string;
    FRIEND_LINK_DEFAULTCATEGORY: number;
    FRIEND_LINK_PLACEHOLDER_DESCRIPTION: string;
    FRIEND_LINK_PLACEHOLDER_LOGO: string;
    FRIEND_LINK_PLACEHOLDER_NAME: string;
    FRIEND_LINK_PLACEHOLDER_SITESHOT: string;
    FRIEND_LINK_PLACEHOLDER_URL: string;
    GRAVATAR_URL: string;
    HOME_TOP: HomeTopConfig;
    ICON_URL: string;
    ICP_NUMBER: string;
    LIBRAW_MAX_FILE_SIZE: number;
    LIBRAW_SUPPORTED_EXTS: string;
    LOGO_HORIZONTAL_DAY: string;
    LOGO_HORIZONTAL_NIGHT: string;
    LOGO_URL: string;
    LOGO_URL_192x192: string;
    LOGO_URL_512x512: string;
    MUSIC_COVER_MAX_FILE_SIZE: number;
    MUSIC_COVER_SUPPORTED_EXTS: string;
    MUSIC_MAX_SIZE_LOCAL: number;
    MUSIC_MAX_SIZE_REMOTE: number;
    POLICE_RECORD_ICON: string;
    POLICE_RECORD_NUMBER: string;
    RESPECT_REDUCED_MOTION: boolean;
    SITE_ANNOUNCEMENT: string;
    SITE_DESCRIPTION: string;
    SITE_KEYWORDS: string;
    SITE_URL: string;
    SUB_TITLE: string;
    UPLOAD_ALLOWED_EXTENSIONS: string;
    UPLOAD_DENIED_EXTENSIONS: string;
    USER_AVATAR: string;
    VIPS_MAX_FILE_SIZE: number;
    VIPS_SUPPORTED_EXTS: string;
    _config_version: number;
    about: AboutPageConfig;
    ai_assistant: AiAssistantConfig;
    ai_podcast: AiPodcastConfig;
    album: AlbumConfig;
    article: ArticleConfig;
    captcha: CaptchaConfig;
    comment: CommentConfig;
    equipment: EquipmentConfig;
    essay: EssayConfig;
    footer: FooterConfig;
    frontDesk: FrontDeskConfig;
    geetest: GeetestConfig;
    header: HeaderConfig;
    image_captcha: ImageCaptchaConfig;
    moments: MomentsConfig;
    music: MusicConfig;
    oauth: OauthConfig;
    page: PageOneImageConfig;
    post: PostConfig;
    recent_comments: RecentCommentsConfig;
    sidebar: SidebarConfig;
    turnstile: TurnstileConfig;
    userpanel: UserPanelConfig;
    wechat: WechatConfig;
}

// ===================== 技能展示 CREATIVITY =====================
export interface CreativityItem {
    color: string;
    icon: string;
    name: string;
}
export interface CreativityConfig {
    creativity_list: CreativityItem[];
    subtitle: string;
    title: string;
}

// ===================== 首页顶部 HOME_TOP =====================
export interface HomeBanner {
    image: string;
    isExternal: boolean;
    link: string;
    tips: string;
    title: string;
}
export interface HomeCategoryItem {
    background: string;
    icon: string;
    isExternal: boolean;
    name: string;
    path: string;
}
export interface HomeTopConfig {
    banner: HomeBanner;
    category: HomeCategoryItem[];
    siteText: string;
    subTitle: string;
    title: string;
}

// ===================== 关于页 ABOUT =====================
export interface AboutCareerItem {
    color: string;
    desc: string;
}
export interface AboutComicItem {
    cover: string;
    href: string;
    name: string;
}
export interface AboutEnableSwitch {
    author_box: boolean;
    buff: boolean;
    careers: boolean;
    comic: boolean;
    comment: boolean;
    custom_code: boolean;
    game: boolean;
    like_tech: boolean;
    map_and_info: boolean;
    maxim: boolean;
    music: boolean;
    page_content: boolean;
    personality: boolean;
    photo: boolean;
    skills: boolean;
    statistic: boolean;
}
export interface AboutPageConfig {
    page: {
        about_site_tips: {
            tips: string;
            title1: string;
            title2: string;
            word: string[];
        };
        avatar_img: string;
        avatar_skills_left: string[];
        avatar_skills_right: string[];
        buff: {
            bottom: string;
            tips: string;
            top: string;
        };
        careers: {
            img: string;
            list: AboutCareerItem[];
            tips: string;
            title: string;
        };
        comic: {
            list: AboutComicItem[];
            tips: string;
            title: string;
        };
        custom_code: string;
        custom_code_html: string;
        description: string;
        enable: AboutEnableSwitch;
        game: {
            background: string;
            tips: string;
            title: string;
            uid: string;
        };
        like: {
            background: string;
            bottom: string;
            tips: string;
            title: string;
        };
        map: {
            background: string;
            backgroundDark: string;
            strengthenTitle: string;
            title: string;
        };
        maxim: {
            bottom: string;
            tips: string;
            top: string;
        };
        music: {
            background: string;
            link: string;
            tips: string;
            title: string;
        };
        name: string;
        personalities: {
            authorName: string;
            nameUrl: string;
            personalityImg: string;
            personalityType: string;
            personalityTypeColor: string;
            photoUrl: string;
            tips: string;
        };
        self_info: {
            content2: string;
            content3: string;
            contentYear: string;
            tips1: string;
            tips2: string;
            tips3: string;
        };
        skills_tips: {
            tips: string;
            title: string;
        };
        statistics_background: string;
        subtitle: string;
    };
}

// ===================== AI助手 =====================
export interface AiAssistantConfig {
    chat_suggestions: string[];
    enable: boolean;
    name: string;
    search_suggestions: string[];
    welcome: string;
}

// ===================== AI播客 =====================
export interface AiPodcastConfig {
    button_icon: string;
    button_text: string;
    enable: boolean;
}

// ===================== 相册 ALBUM =====================
export interface AlbumWaterfall {
    column_count: {
        large: number;
        medium: number;
        small: number;
    };
    gap: number;
}
export interface AlbumConfig {
    about_link: string;
    api_url: string;
    banner: {
        background: string;
        description: string;
        tip: string;
        title: string;
    };
    default_big_param: string;
    default_thumb_param: string;
    enable_comment: boolean;
    layout_mode: "grid" | "waterfall";
    page_size: number;
    waterfall: AlbumWaterfall;
}

// ===================== 文章多作者 =====================
export interface ArticleConfig {
    multi_author: {
        enable: boolean;
        need_review: boolean;
    };
}

// ===================== 验证码基础 =====================
export interface CaptchaConfig {
    provider: "none" | "geetest" | "turnstile";
}

// ===================== 评论配置 =====================
export interface CommentConfig {
    allow_image_upload: boolean;
    anonymous_email: string;
    barrage_enable: boolean;
    blogger_email: string;
    emoji_cdn: string;
    enable: boolean;
    limit_length: number;
    login_required: boolean;
    master_tag: string;
    page_size: number;
    placeholder: string;
    show_region: boolean;
    show_ua: boolean;
}

// ===================== 装备/好物 =====================
export interface EquipmentConfig {
    banner: {
        background: string;
        description: string;
        tip: string;
        title: string;
    };
    list: any[];
}

// ===================== 即刻短文 ESSAY =====================
export interface EssayConfig {
    button_link: string;
    button_text: string;
    home_enable: boolean;
    limit: number;
    pagination_mode: "pagination" | "loadmore";
    subtitle: string;
    tips: string;
    title: string;
    top_background: string;
}

// ===================== 页脚 FOOTER =====================
export interface FooterBadgeItem {
    link: string;
    message: string;
    shields: string;
}
export interface FooterLinkItem {
    link: string;
    text: string;
}
export interface FooterProjectLink {
    link: string;
    title: string;
}
export interface FooterProjectGroup {
    links: FooterProjectLink[];
    title: string;
}
export interface FooterSocialItem {
    icon: string;
    link: string;
    title: string;
}
export interface FooterRuntimeConfig {
    enable: boolean;
    launch_time: string;
    offduty_description: string;
    offduty_img: string;
    work_description: string;
    work_img: string;
}
export interface FooterConfig {
    badge: {
        enable: boolean;
        list: FooterBadgeItem[];
    };
    bar: {
        authorLink: string;
        cc: { link: string };
        linkList: FooterLinkItem[];
    };
    custom_text: string;
    list: {
        randomFriends: number;
    };
    owner: {
        name: string;
        since: number;
    };
    project: {
        list: FooterProjectGroup[];
    };
    runtime: FooterRuntimeConfig;
    socialBar: {
        centerImg: string;
        left: FooterSocialItem[];
        right: FooterSocialItem[];
    };
    uptime_kuma: {
        enable: boolean;
        page_url: string;
    };
}

// ===================== 前台站点所有者 =====================
export interface FrontDeskConfig {
    siteOwner: {
        email: string;
        name: string;
    };
}

// ===================== 极验验证码 =====================
export interface GeetestConfig {
    captcha_id: string;
}

// ===================== 导航栏 HEADER =====================
export interface HeaderMenuItem {
    icon: string;
    isExternal: boolean;
    path: string;
    title: string;
}
export interface HeaderMenuGroup {
    items: HeaderMenuItem[];
    title: string;
}
export interface HeaderConfig {
    menu: HeaderMenuGroup[];
    nav: {
        clock: boolean;
        menu: any[];
        travelling: boolean;
    };
}

// ===================== 图片验证码 =====================
export interface ImageCaptchaConfig {
    expire: number;
    length: number;
}

// ===================== 友链朋友圈 MOMENTS =====================
export interface MomentsConfig {
    button_link: string;
    button_text: string;
    display_limit: number;
    enable: boolean;
    subtitle: string;
    tips: string;
    title: string;
    top_background: string;
}

// ===================== 音乐模块 =====================
export interface MusicConfig {
    api: {
        base_url: string;
    };
    capsule: {
        custom_playlist: string;
    };
    player: {
        custom_playlist: string;
        enable: boolean;
        playlist_id: number;
    };
    vinyl: {
        background: string;
        groove: string;
        inner: string;
        needle: string;
        outer: string;
    };
}

// ===================== Oauth第三方登录 =====================
export interface OauthItem {
    display_name?: string;
    enable: boolean;
}
export interface OauthRainbow {
    api_url: string;
    app_id: string;
    callback_url: string;
    enable: boolean;
    login_methods: string;
}
export interface OauthConfig {
    github: OauthItem;
    google: OauthItem;
    logto: OauthItem;
    microsoft: OauthItem;
    oidc: OauthItem;
    qq: OauthItem;
    rainbow: OauthRainbow;
    wechat: OauthItem;
}

// ===================== 页面大图配置 =====================
export interface PageOneImageSingle {
    background: string;
    enable: boolean;
    hitokoto: boolean;
    mainTitle: string;
    mediaType: "image" | "video";
    mobileBackground: string;
    mobileMediaType: "image" | "video";
    mobileVideoAutoplay: boolean;
    mobileVideoLoop: boolean;
    mobileVideoMuted: boolean;
    subTitle: string;
    typingEffect: boolean;
    videoAutoplay: boolean;
    videoLoop: boolean;
    videoMuted: boolean;
}
export interface PageOneImageConfig {
    one_image: {
        config: {
            archives: PageOneImageSingle;
            categories: PageOneImageSingle;
            home: PageOneImageSingle;
            tags: PageOneImageSingle;
        };
        hitokoto_api: string;
        typing_speed: number;
    };
}

// ===================== 文章 POST 配置 =====================
export interface PostRewardConfig {
    alipay_enable: boolean;
    alipay_label: string;
    alipay_qr: string;
    button_text: string;
    enable: boolean;
    list_button_desc: string;
    list_button_text: string;
    title: string;
    wechat_enable: boolean;
    wechat_label: string;
    wechat_qr: string;
}
export interface PostConfig {
    code_block: {
        code_max_lines: number;
        mac_style: boolean;
    };
    copy: {
        copyright_enable: boolean;
        copyright_original: string;
        copyright_reprint: string;
        enable: boolean;
    };
    copyright: {
        original_template: string;
        reprint_template_with_url: string;
        reprint_template_without_url: string;
        show_reward_button: boolean;
        show_share_button: boolean;
        show_subscribe_button: boolean;
    };
    default: {
        cover: string;
        double_column: boolean;
        enable_primary_color_tag: boolean;
        page_size: number;
    };
    expiration_time: number;
    page404: {
        default_image: string;
    };
    reward: PostRewardConfig;
    subscribe: {
        button_text: string;
        dialog_desc: string;
        dialog_title: string;
        enable: boolean;
    };
    toc: {
        hash_update_mode: string;
    };
    waves: {
        enable: boolean;
    };
}

// ===================== 最新评论模块 =====================
export interface RecentCommentsConfig {
    banner: {
        background: string;
        description: string;
        tip: string;
        title: string;
    };
}

// ===================== 侧边栏 SIDEBAR =====================
export interface SidebarSocialItem {
    icon: string;
    link: string;
}
export interface SidebarConfig {
    archive: {
        displayMonths: number;
    };
    author: {
        description: string;
        enable: boolean;
        skills: string[];
        social: Record<string, SidebarSocialItem>;
        statusImg: string;
    };
    custom: {
        showInPost: boolean;
    };
    doc: {
        links: Array<{
            external: boolean;
            icon: string;
            link: string;
            title: string;
        }>;
    };
    recentPost: {
        count: number;
        enable: boolean;
    };
    series: {
        postCount: number;
    };
    siteinfo: {
        runtimeEnable: boolean;
        totalPostCount: number;
        totalWordCount: number;
    };
    tags: {
        enable: boolean;
        highlight: string[];
    };
    toc: {
        collapseMode: boolean;
    };
    weather: {
        default_rectangle: boolean;
        enable: boolean;
        enable_page: string;
        ip_api_key: string;
        loading: string;
        qweather_api_host: string;
        qweather_key: string;
        rectangle: string;
    };
    wechat: {
        backFace: string;
        blurBackground: string;
        enable: boolean;
        face: string;
        link: string;
    };
}

// ===================== Turnstile 人机验证 =====================
export interface TurnstileConfig {
    enable: boolean;
    site_key: string;
}

// ===================== 用户面板 =====================
export interface UserPanelConfig {
    show_admin_dashboard: boolean;
    show_notifications: boolean;
    show_publish_article: boolean;
    show_publish_essay: boolean;
    show_user_center: boolean;
}

// ===================== 微信分享 =====================
export interface WechatConfig {
    share: {
        app_id: string;
        enable: boolean;
    };
}

// ===================== 导出顶层响应泛型实例 =====================
export type SiteConfigResponse = ApiResponse<SiteConfig>;
