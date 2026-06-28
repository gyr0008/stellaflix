/**
 * 批量导入脚本 v2 - 从多个CMS源导入视频数据（更新版）
 *
 * 使用方法：
 * npx tsx scripts/batch-import-v2.ts [起始页] [结束页] [源编号]
 *
 * 示例：
 * npx tsx scripts/batch-import-v2.ts 1 100      // 导入所有源的第1-100页
 * npx tsx scripts/batch-import-v2.ts 1 100 1    // 只导入源1（暴风影视）
 * npx tsx scripts/batch-import-v2.ts 1 100 3    // 只导入源3（非凡资源）
 */

import { createClient } from "@supabase/supabase-js";

// Supabase配置
const SUPABASE_URL = "https://bnqatjzcyttrgczhrqmk.supabase.co";
const SUPABASE_KEY = "sb_publishable_N1shVPu9YsPJFrtCgjYGjg_lnL58Gk1";

// ========== 多CMS源配置 ==========
const CMS_SOURCES = [
  { id: 1, name: "暴风影视", api: "https://bfzyapi.com/api.php/provide/vod/" },
  { id: 2, name: "量子资源", api: "https://cj.lziapi.com/api.php/provide/vod/" },
  { id: 3, name: "非凡资源", api: "https://cj.ffzyapi.com/api.php/provide/vod/" },
  { id: 4, name: "光速资源", api: "https://api.guangsuapi.com/api.php/provide/vod/" },
  { id: 5, name: "红牛资源", api: "https://www.hongniuzy2.com/api.php/provide/vod/" },
  { id: 6, name: "恋单资源", api: "https://www.lovedan.net/api.php/provide/vod/" },
  { id: 7, name: "瑞诚资源", api: "https://cj.rycjapi.com/api.php/provide/vod/" },
  { id: 8, name: "360资源", api: "https://360zy.com/api.php/provide/vod/" },
  { id: 9, name: "佳影资源", api: "https://jyzyapi.com/api.php/provide/vod/" },
];

// 类型映射
const GENRE_MAP: { [key: string]: string } = {
  "剧情": "剧情", "喜剧": "喜剧", "动作": "动作", "爱情": "爱情",
  "科幻": "科幻", "动画": "动画", "悬疑": "悬疑", "惊悚": "惊悚",
  "恐怖": "恐怖", "犯罪": "犯罪", "纪录片": "纪录片", "战争": "战争",
  "奇幻": "奇幻", "冒险": "冒险", "传记": "传记", "历史": "历史",
  "音乐": "音乐", "家庭": "家庭", "儿童": "儿童", "武侠": "武侠",
  "古装": "古装", "综艺": "综艺", "真人秀": "综艺",
};

// ========== 过滤规则（必须执行）==========

// 1. 短剧类型ID
const SKIP_TYPE_IDS = [36]; // CMS短剧分类

// 2. 标题关键词过滤（低质量视频）
const SKIP_TITLE_PATTERNS = [
  // 短剧
  /短剧/, /微短剧/, /竖屏剧/, /短大全/,
  // AI漫/漫剧
  /AI漫/, /漫剧/, /动漫短剧/,
  // 体育赛事
  /WTA/, /ATP/, /网球/, /乒乓球/, /羽毛球/,
  /NBA/, /CBA/, /篮球/, /足球/, /世界杯/, /欧冠/, /英超/, /西甲/, /意甲/, /德甲/,
  /FIFA/, /中超/, /亚冠/, /欧联/, /足协杯/,
  // 电影解说
  /电影解说/, /影片解说/, /解说版/, /【解说】/, /解说：/,
  // 韩国剧/日本剧
  /韩国剧/, /韩剧/, /日本剧/, /日剧/,
  // 台湾/泰国内容
  /台湾/, /泰国/,
  // 类型关键词
  /反转爽文/, /古装仙侠/, /都市脑洞/, /现代言情/,
  // 其他
  /甜宠/, /虐恋/,
  // ========== 新增：低质量视频关键词 ==========
  /穿越/, /重生/, /霸道/, /狂龙/, /异界/, /末法/, /师尊/, /夫君/,
  /弟弟/, /金蝉/, /外卖/, /球场/, /邪少/, /总裁/, /豪门/, /宠/,
  /修仙/, /道友/, /王妃/, /王爷/, /皇子/, /太子/, /萝莉/, /全员be/, /开局/,
];

// 3. 地区过滤
// 日本：只跳过日本剧，保留日本动画/电影/动漫
const SKIP_JAPAN_TYPES = ["连续剧", "综艺"]; // 日本跳过的类型
// 韩国：跳过综艺、电视剧，保留经典高分电影（豆瓣8+）
const KOREAN_SKIP_TYPES = ["variety", "tv"];

// 4. CMS分类ID过滤（韩国剧、日本剧等连续剧类型）
const SKIP_CMS_TYPE_IDS = [
  13, // 国产剧
  14, // 香港剧
  15, // 韩国剧
  16, // 欧美剧
  20, // 记录片（单独处理）
  21, // 台湾剧
  22, // 日本剧
  23, // 海外剧
  24, // 泰国剧
  36, // 短剧
];

// 5. 类型关键词过滤（genre中包含这些关键词的内容跳过）
const SKIP_GENRE_KEYWORDS = [
  "AI漫", "漫剧", "短剧", "微短剧", "竖屏剧", "短大全",
  "反转爽文", "古装仙侠", "都市脑洞", "现代言情", "甜宠", "虐恋",
  "91探花", "福利", "网曝门", "足球", "篮球",
  "国产", "大陆综艺", "国产动漫",
  // ========== 新增：综艺和特定标签 ==========
  "综艺", "真人秀",
  "野外露出", "精品推荐", "主播直播", "可爱学生", "古装扮演",
  "韩国御姐", "兽耳系列", "国产色情", "风情旗袍", "情介绍",
  "恋腿狂魔", "cosplay", "台湾辣妹", "素人自拍",
];

// 6. 地区过滤（跳过这些地区的内容）
// 注意：仅跳过电视剧和短片，保留电影
const SKIP_REGIONS = ["台湾", "泰国", "中国大陆", "内地"];

// 7. 标题额外过滤（重生、民国等）
const SKIP_TITLE_EXTRA = [
  /重生/, /民国/, /国产/,
  /篮球/, /足球/, /乒乓球/, /羽毛球/,
  /网球/, /NBA/, /CBA/, /世界杯/,
];

// 根据genre判断内容类型
function detectType(genres: string[]): string {
  const genreStr = genres.join(",");
  if (genreStr.includes("动画") || genreStr.includes("动漫")) return "anime";
  if (genreStr.includes("儿童")) return "kids";
  if (genreStr.includes("综艺") || genreStr.includes("真人秀")) return "variety";
  if (genreStr.includes("纪录片")) return "documentary";
  return "movie";
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function importPage(supabase: any, api: string, sourceName: string, page: number): Promise<{ imported: number; skipped: number; errors: string[] }> {
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  try {
    // 从CMS获取数据
    const response = await fetch(`${api}?ac=detail&pg=${page}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      errors.push(`HTTP ${response.status}`);
      return { imported, skipped, errors };
    }

    const data = await response.json();
    if (!data.list || data.list.length === 0) {
      return { imported, skipped, errors };
    }

    // 处理每条数据
    for (const vod of data.list) {
      try {
        // ========== 过滤规则（必须执行）==========

        // 1. 跳过短剧类型（type_id=36）
        if (SKIP_TYPE_IDS.includes(vod.type_id) || SKIP_TYPE_IDS.includes(vod.type_id_1)) {
          skipped++;
          continue;
        }

        // 2. 跳过标题包含关键词的内容
        const vodName = vod.vod_name || "";
        if (SKIP_TITLE_PATTERNS.some(pattern => pattern.test(vodName))) {
          skipped++;
          continue;
        }

        // 2.1 额外标题过滤（重生、民国、国产等）
        if (SKIP_TITLE_EXTRA.some(pattern => pattern.test(vodName))) {
          skipped++;
          continue;
        }

        // 3. 跳过CMS分类ID（韩国剧、日本剧等）
        if (SKIP_CMS_TYPE_IDS.includes(vod.type_id) || SKIP_CMS_TYPE_IDS.includes(vod.type_id_1)) {
          skipped++;
          continue;
        }

        // 4. 跳过类型关键词（AI漫、漫剧、短剧等）
        const vodClassForGenre = vod.vod_class || "";
        if (SKIP_GENRE_KEYWORDS.some(keyword => vodClassForGenre.includes(keyword))) {
          skipped++;
          continue;
        }

        // 5. 地区过滤
        const vodArea = vod.vod_area || "";
        const vodClass = vod.vod_class || "";

        // 5.1 跳过指定地区（台湾、泰国、大陆）
        // 注意：仅跳过电视剧和短片，保留电影
        if (SKIP_REGIONS.some(region => vodArea.includes(region))) {
          const isDrama = vodClass.includes("连续剧") || vodClass.includes("电视剧");
          const isShort = vod.duration && vod.duration < 900; // 小于15分钟
          if (isDrama || isShort) {
            skipped++;
            continue;
          }
        }

        // 5.2 日本内容过滤（只跳过日本剧，保留动画/电影）
        if (vodArea === "日本") {
          const isJapaneseDrama = vodClass.includes("连续剧") || vodClass.includes("日本剧");
          if (isJapaneseDrama) {
            skipped++;
            continue;
          }
        }

        // 6. 韩国内容过滤（保留所有电影，跳过综艺和电视剧）
        if (vodArea === "韩国") {
          const isKoreanVariety = vodClass.includes("综艺") || vodClass.includes("真人秀");
          const isKoreanDrama = vodClass.includes("连续剧") || vodClass.includes("电视剧");
          if (isKoreanVariety || isKoreanDrama) {
            skipped++;
            continue;
          }
          // 韩国电影保留（包括豆瓣评分>=8的经典电影）
        }

        // 解析播放地址
        let playUrl = "";
        if (vod.vod_play_url) {
          const urls = vod.vod_play_url.split("$$$");
          if (urls.length > 0) {
            const urlParts = urls[0].split("$");
            if (urlParts.length > 1) {
              playUrl = urlParts[1];
            }
          }
        }

        // 处理类型
        const genres = vod.vod_class
          ? vod.vod_class.split(",").slice(0, 3).map((g: string) => GENRE_MAP[g.trim()] || g.trim())
          : [];

        // 根据genre自动检测内容类型
        const contentType = detectType(genres);

        const movie = {
          title: vod.vod_name || "未知",
          poster_url: vod.vod_pic || "",
          backdrop_url: vod.vod_pic || "",
          rating: vod.vod_score ? parseFloat(vod.vod_score) || 0 : 0,
          rating_count: 0,
          year: parseInt(vod.vod_year) || new Date().getFullYear(),
          genre: genres,
          description: (vod.vod_content || vod.vod_blurb || "").slice(0, 500),
          type: contentType,
          region: vod.vod_area || "",
          language: vod.vod_lang || "",
          director: vod.vod_director || "",
          cast_members: vod.vod_actor ? vod.vod_actor.split(",").slice(0, 5).map((a: string) => a.trim()) : [],
          is_published: true,
          is_premium: false,
          heat: Math.floor(Math.random() * 100) + 50,
          video_url: playUrl,
        };

        // 检查是否已存在
        const { data: existing } = await supabase
          .from("movies")
          .select("id")
          .eq("title", movie.title)
          .limit(1);

        if (existing && existing.length > 0) {
          skipped++;
          continue;
        }

        // 插入数据库
        const { error } = await supabase.from("movies").insert(movie);
        if (error) {
          errors.push(`${movie.title}: ${error.message.slice(0, 50)}`);
        } else {
          imported++;
        }
      } catch (e) {
        // 单条数据错误，继续处理下一条
      }
    }
  } catch (e) {
    errors.push(`Page ${page}: ${(e as Error).message.slice(0, 50)}`);
  }

  return { imported, skipped, errors };
}

async function main() {
  const args = process.argv.slice(2);
  const startPage = parseInt(args[0]) || 1;
  const endPage = parseInt(args[1]) || 100;
  const sourceId = parseInt(args[2]) || 0; // 0=所有源，其他=指定源

  // 确定要导入的源
  const sourcesToImport = sourceId > 0
    ? CMS_SOURCES.filter(s => s.id === sourceId)
    : CMS_SOURCES;

  console.log(`\n🚀 开始批量导入（多源模式 v2）`);
  console.log(`   源数量: ${sourcesToImport.length} 个`);
  console.log(`   源列表: ${sourcesToImport.map(s => s.name).join(", ")}`);
  console.log(`   范围: 第 ${startPage} - ${endPage} 页`);
  console.log(`   预计: ${(endPage - startPage + 1) * 20 * sourcesToImport.length} 条视频\n`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  let grandTotalImported = 0;
  let grandTotalSkipped = 0;
  let grandTotalErrors = 0;
  const startTime = Date.now();
  let lastNotifyTime = startTime; // 上次通知时间
  const NOTIFY_INTERVAL = 30 * 60 * 1000; // 30分钟通知间隔

  // 遍历每个源
  for (const source of sourcesToImport) {
    console.log(`\n📡 开始导入源: ${source.name} (${source.api})`);
    console.log(`   ${"─".repeat(50)}`);

    let sourceImported = 0;
    let sourceSkipped = 0;
    let sourceErrors = 0;

    for (let page = startPage; page <= endPage; page++) {
      const result = await importPage(supabase, source.api, source.name, page);

      sourceImported += result.imported;
      sourceSkipped += result.skipped;
      sourceErrors += result.errors.length;

      // 每30分钟输出一次进度提醒
      const currentTime = Date.now();
      if (currentTime - lastNotifyTime >= NOTIFY_INTERVAL) {
        const elapsed = ((currentTime - startTime) / 1000 / 60).toFixed(1);
        const progress = ((page - startPage + 1) / (endPage - startPage + 1) * 100).toFixed(1);
        console.log(`\n⏰ [30分钟提醒] ${source.name} | 进度: ${progress}% | 页: ${page}/${endPage} | 导入: ${sourceImported} | 跳过: ${sourceSkipped} | 错误: ${sourceErrors} | 已运行: ${elapsed}分钟\n`);
        lastNotifyTime = currentTime;
      }

      // 限速：避免请求过快
      await sleep(200);
    }

    console.log(`\n✅ ${source.name} 完成: 导入 ${sourceImported} 条，跳过 ${sourceSkipped} 条`);

    grandTotalImported += sourceImported;
    grandTotalSkipped += sourceSkipped;
    grandTotalErrors += sourceErrors;
  }

  console.log(`\n\n🎉 全部导入完成！`);
  console.log(`   ${"═".repeat(50)}`);
  console.log(`   总计导入: ${grandTotalImported} 条`);
  console.log(`   总计跳过: ${grandTotalSkipped} 条`);
  console.log(`   总计失败: ${grandTotalErrors} 条`);
  console.log(`   总耗时: ${((Date.now() - startTime) / 1000).toFixed(0)} 秒`);
  console.log(`   ${"═".repeat(50)}\n`);
}

main().catch(console.error);