// 统计概览（GET /statistics/summary）

export interface VisitorAnalytics {
    top_browsers: { browser: string; count: number }[] | null;
    top_cities: { city: string; count: number }[] | null;
    top_countries: { country: string; count: number }[] | null;
    top_devices: { device: string; count: number }[] | null;
    top_os: { os: string; count: number }[] | null;
    top_referers: { referer: string; count: number }[] | null;
}

export interface VisitorStatistics {
    month_views: number;
    today_views: number;
    today_visitors: number;
    year_views: number;
    yesterday_views: number;
    yesterday_visitors: number;
}

export interface URLStatistics {
    avg_duration: number;
    bounce_count: number;
    bounce_rate: number;
    last_visited_at: string;
    page_title: string;
    total_views: number;
    unique_views: number;
    url_path: string;
}

export interface DateRangeStats {
    date: string;
    views: number;
    visitors: number;
}

export interface VisitorTrendData {
    daily: DateRangeStats[] | null;
    monthly: DateRangeStats[] | null;
    weekly: DateRangeStats[] | null;
}

export interface StatisticsSummary {
    analytics: VisitorAnalytics | null;
    basic_stats: VisitorStatistics | null;
    top_pages: URLStatistics[] | null;
    trend_data: VisitorTrendData | null;
}
