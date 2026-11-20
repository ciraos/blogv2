/**
 * 中文简繁转换（后台 `post.chinese_conversion`）。
 *
 * 为什么不用 opencc：那套词表动辄几 MB（还分 s2t/t2s/台湾正体/香港繁体），
 * 一个博客文章页只为了「点一下看繁体」不值得背这个体积。
 * 这里用**单字映射**覆盖高频字（约 500 组），能覆盖绝大多数中文散文；
 * 代价是词级差异（例如「里面→裡面」这种同字不同形的）不会处理 —— 已足够阅读，不追求出版级。
 *
 * 映射是双向的：`tw` 走简→繁，`cn` 走繁→简。
 */

/** 「简体繁体」成对列出（空格分隔） */
const PAIRS = `
爱愛 碍礙 袄襖 坝壩 罢罷 摆擺 败敗 颁頒 办辦 绑綁 帮幫 宝寶 饱飽 报報 贝貝 备備 辈輩 币幣
毕畢 边邊 编編 变變 辩辯 标標 表錶 别別 宾賓 饼餅 拨撥 补補 财財 参參 惭慚 蚕蠶 惨慘 灿燦
仓倉 苍蒼 舱艙 层層 尝嘗 长長 偿償 厂廠 畅暢 钞鈔 车車 彻徹 尘塵 陈陳 衬襯 称稱 惩懲 诚誠
承氶 骋騁 吃喫 迟遲 齿齒 冲衝 虫蟲 宠寵 筹籌 丑醜 出齣 础礎 处處 触觸 传傳 疮瘡 闯闖 创創
纯純 词詞 辞辭 从從 丛叢 凑湊 窜竄 错錯 达達 带帶 贷貸 担擔 单單 胆膽 弹彈 当當 党黨 挡擋
导導 岛島 灯燈 邓鄧 敌敵 递遞 点點 电電 垫墊 淀澱 钓釣 调調 迭疊 顶頂 订訂 东東 动動 冻凍
斗鬥 独獨 读讀 赌賭 镀鍍 断斷 锻鍛 队隊 对對 吨噸 顿頓 夺奪 堕墮 额額 讹訛 恶惡 儿兒 尔爾
饵餌 贰貳 发發 罚罰 阀閥 法灋 帆颿 烦煩 范範 贩販 饭飯 访訪 纺紡 飞飛 废廢 费費 纷紛 坟墳
奋奮 愤憤 丰豐 风風 疯瘋 锋鋒 缝縫 讽諷 凤鳳 佛彿 肤膚 辐輻 抚撫 辅輔 赋賦 复復 负負 妇婦
缚縛 该該 赶趕 干乾 冈岡 刚剛 岗崗 钢鋼 纲綱 镐鎬 告吿 阁閣 个個 给給 跟跟 龚龔 巩鞏 贡貢
沟溝 构構 购購 估估 谷穀 顾顧 刮颳 关關 观觀 馆館 惯慣 贯貫 广廣 归歸 龟龜 规規 柜櫃 国國
过過 骸骸 汉漢 号號 合閤 轰轟 红紅 后後 胡鬍 壶壺 护護 沪滬 户戶 华華 画畫 划劃 怀懷 坏壞
欢歡 环環 还還 换換 唤喚 荒荒 黄黃 挥揮 辉輝 毁毀 汇匯 会會 秽穢 荤葷 浑渾 伙夥 获獲 货貨
祸禍 击擊 机機 积積 饥饑 讥譏 鸡雞 绩績 辑輯 极極 级級 挤擠 几幾 剂劑 济濟 计計 记記 纪紀
继繼 夹夾 家傢 价價 驾駕 歼殲 监監 坚堅 笺箋 拣揀 硷鹼 舰艦 艰艱 见見 荐薦 剑劍 键鍵 讲講
奖獎 浆漿 酱醬 胶膠 浇澆 骄驕 娇嬌 搅攪 铰鉸 缴繳 较較 阶階 节節 洁潔 结結 诫誡 届屆 紧緊
谨謹 进進 尽盡 惊驚 经經 茎莖 鲸鯨 竞競 净淨 旧舊 剧劇 惧懼 卷捲 觉覺 决決 绝絕 军軍 开開
凯凱 颗顆 壳殼 课課 垦墾 恳懇 库庫 夸誇 块塊 亏虧 困睏 扩擴 蜡蠟 腊臘 来來 赖賴 蓝藍 栏欄
拦攔 烂爛 劳勞 涝澇 乐樂 累纍 垒壘 类類 泪淚 离離 里裡 礼禮 丽麗 历歷 厉厲 励勵 连連 联聯
怜憐 炼煉 练練 恋戀 链鏈 粮糧 两兩 辆輛 疗療 辽遼 猎獵 临臨 邻鄰 岭嶺 龄齡 灵靈 领領 刘劉
龙龍 楼樓 卢盧 炉爐 陆陸 录錄 滤濾 乱亂 仑侖 论論 罗羅 萝蘿 络絡 骆駱 妈媽 马馬 买買 卖賣
迈邁 麦麥 瞒瞞 馒饅 满滿 蛮蠻 猫貓 贸貿 么麼 没沒 门門 闷悶 们們 梦夢 弥彌 米米 觅覓 密密
绵綿 面麵 庙廟 灭滅 悯憫 鸣鳴 谬謬 亩畝 纳納 难難 挠撓 脑腦 闹鬧 内內 拟擬 酿釀 鸟鳥 聂聶
您您 宁寧 农農 暖暖 欧歐 盘盤 庞龐 赔賠 喷噴 贫貧 频頻 凭憑 屏屛 泼潑 扑撲 铺鋪 朴樸 仆僕
启啟 弃棄 迁遷 签簽 钱錢 潜潛 浅淺 谴譴 枪槍 墙牆 抢搶 桥橋 窍竅 窃竊 亲親 轻輕 倾傾 请請
庆慶 穷窮 秋鞦 区區 驱驅 趋趨 权權 劝勸 确確 让讓 扰擾 热熱 认認 荣榮 绒絨 软軟 锐銳 洒灑
伞傘 丧喪 扫掃 涩澀 杀殺 晒曬 删刪 伤傷 赏賞 烧燒 绍紹 设設 绅紳 审審 渗滲 声聲 绳繩 胜勝
圣聖 师師 狮獅 湿濕 诗詩 时時 实實 识識 驶駛 势勢 试試 饰飾 视視 适適 释釋 兽獸 书書 属屬
术術 树樹 帅帥 双雙 谁誰 顺順 说說 硕碩 丝絲 松鬆 苏蘇 诉訴 虽雖 随隨 岁歲 孙孫 损損 缩縮
锁鎖 台臺 态態 摊攤 贪貪 谈談 叹嘆 汤湯 烫燙 涛濤 讨討 腾騰 题題 体體 条條 贴貼 铁鐵 听聽
厅廳 廷廷 通通 铜銅 统統 头頭 图圖 涂塗 团團 椭橢 洼窪 袜襪 弯彎 湾灣 万萬 网網 为為 围圍
违違 卫衛 伟偉 伪偽 纬緯 谓謂 温溫 闻聞 问問 瓮甕 窝窩 卧臥 乌烏 无無 吴吳 武武 务務 雾霧
误誤 牺犧 袭襲 洗洗 铣銑 戏戲 细細 吓嚇 鲜鮮 咸鹹 现現 献獻 县縣 宪憲 乡鄉 详詳 响響 向嚮
项項 象像 销銷 晓曉 啸嘯 协協 挟挾 胁脅 谐諧 写寫 泻瀉 谢謝 锌鋅 兴興 凶兇 汹洶 锈鏽 绣繡
须須 许許 续續 绪緒 悬懸 选選 学學 寻尋 训訓 讯訊 逊遜 压壓 亚亞 讶訝 咽嚥 烟煙 盐鹽 严嚴
岩巖 沿沿 艳豔 验驗 厌厭 砚硯 扬揚 阳陽 养養 样樣 痒癢 谣謠 药藥 爷爺 业業 叶葉 页頁 义義
议議 忆憶 艺藝 亿億 应應 痈癰 拥擁 佣傭 踊踴 忧憂 优優 邮郵 犹猶 游遊 诱誘 于於 舆輿 鱼魚
渔漁 与與 语語 吁籲 御禦 狱獄 誉譽 预預 驭馭 郁鬱 渊淵 园園 员員 圆圓 缘緣 远遠 愿願 约約
跃躍 钥鑰 岳嶽 云雲 郑鄭 杂雜 灾災 载載 攒攢 暂暫 赞贊 赃贓 脏臟 凿鑿 枣棗 灶灶 责責 择擇
泽澤 贼賊 赠贈 扎紮 札札 诈詐 斋齋 债債 毡氈 战戰 张張 帐帳 账賬 胀脹 赵趙 这這 针針 侦偵
诊診 镇鎮 阵陣 挣掙 睁睜 争爭 帧幀 证證 织織 职職 执執 纸紙 挚摯 掷擲 帜幟 制製 质質 钟鐘
终終 种種 肿腫 众眾 昼晝 骤驟 朱硃 烛燭 嘱囑 筑築 铸鑄 专專 转轉 赚賺 庄莊 装裝 妆妝 壮壯
状狀 锥錐 准準 浊濁 兹茲 资資 渍漬 综綜 总總 纵縱 邹鄒 诅詛 组組 钻鑽 尊尊 左左 作作 坐坐
汉漢 说說 规規 划劃 选選 录錄 织織 卖賣 买買 读讀 听聽 写寫 网網 电電 饭飯 汤湯 面麵 后後
懒懶 况況 复復 备備 尽盡 输輸 顺順 结結 张張 陆陸 亚亞 码碼 号號 页頁 简簡 单單 转轉 达達
`;

const S2T = new Map<string, string>();
const T2S = new Map<string, string>();

for (const pair of PAIRS.split(/\s+/)) {
    if (pair.length !== 2) continue;
    const [simp, trad] = [pair[0], pair[1]];
    if (!S2T.has(simp)) S2T.set(simp, trad);
    if (!T2S.has(trad)) T2S.set(trad, simp);
}

/** 需要跳过的容器：代码、行内代码、脚本等不该被当成正文转换。
 *  注意要按**祖先**判断 —— 代码高亮后文本节点的直接父级是 `<span class="hljs-*">`，
 *  只看父级会把代码块里的中文注释也转了。 */
const SKIP_SELECTOR = "pre, code, kbd, samp, script, style, textarea";

/** 纯文本转换：逐字替换，未收录的字原样保留 */
export function convertChinese(text: string, mode: "tw" | "cn"): string {
    const map = mode === "tw" ? S2T : T2S;
    let out = "";
    for (const ch of text) out += map.get(ch) ?? ch;
    return out;
}

/** 每个文本节点转换前的原文：来回切换时始终从原文重算，避免「繁→简→繁」累积误差 */
const originals = new WeakMap<Text, string>();

/**
 * 把某个容器里的**正文文本**整段转换。
 *
 * @param root 转换范围（文章正文容器）
 * @param mode `tw` = 转繁体，`cn` = 转回简体（还原时用一开始记下的原文）
 */
export function convertElementChinese(root: HTMLElement, mode: "tw" | "cn"): number {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            if (parent.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;
            if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        },
    });

    let count = 0;
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);

    for (const node of nodes) {
        const original = originals.get(node) ?? node.nodeValue ?? "";
        if (!originals.has(node)) originals.set(node, original);
        const next = mode === "cn" ? original : convertChinese(original, mode);
        if (next !== node.nodeValue) {
            node.nodeValue = next;
            count += 1;
        }
    }
    return count;
}
