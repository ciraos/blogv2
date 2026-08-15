// 探测线上 site-config 的 about 配置结构
const res = await fetch("https://blog.ciraos.top/api/public/site-config");
const data = await res.json();
const about = data?.data?.about;
if (!about) {
    console.log("no about config");
    process.exit(0);
}
console.log("about keys:", Object.keys(about));
console.log("page.enable:", JSON.stringify(about.page?.enable, null, 2));
console.log("page.name:", about.page?.name, "| subtitle:", about.page?.subtitle, "| description:", about.page?.description?.slice(0, 100));
console.log("page.avatar_img:", about.page?.avatar_img);
console.log("page.personalities:", JSON.stringify(about.page?.personalities, null, 2));
console.log("page.skills_tips:", JSON.stringify(about.page?.skills_tips, null, 2));
console.log("page.avatar_skills_left:", JSON.stringify(about.page?.avatar_skills_left));
console.log("page.avatar_skills_right:", JSON.stringify(about.page?.avatar_skills_right));
console.log("page.maxim:", JSON.stringify(about.page?.maxim, null, 2));
console.log("page.buff:", JSON.stringify(about.page?.buff, null, 2));
console.log("page.careers:", JSON.stringify(about.page?.careers, null, 2));
console.log("page.self_info:", JSON.stringify(about.page?.self_info, null, 2));
console.log("page.about_site_tips:", JSON.stringify(about.page?.about_site_tips, null, 2));
console.log("page.comic:", JSON.stringify(about.page?.comic, null, 2));
console.log("page.map:", JSON.stringify(about.page?.map, null, 2));
console.log("page.music:", JSON.stringify(about.page?.music, null, 2));
console.log("page.game:", JSON.stringify(about.page?.game, null, 2));
console.log("page.like:", JSON.stringify(about.page?.like, null, 2));
console.log("page.custom_code:", about.page?.custom_code?.slice(0, 200));
console.log("page.statistics_background:", about.page?.statistics_background);
