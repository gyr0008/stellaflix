/**
 * 导入日本动漫（补充之前删除的内容）
 * CMS分类：type_id=30（国产动漫）, 31（日韩动漫）, 32（欧美动漫）, 33（海外动漫）
 * 只导入日本地区的内容，跳过日本剧
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://bnqatjzcyttrgczhrqmk.supabase.co";
const SUPABASE_KEY = "sb_publishable_N1shVPu9YsPJFrtCgjYGjg_lnL58Gk1";
const CMS_API = "https://cj.ffzyapi.com/api.php/provide/vod/";

// CMS日本动漫分类ID
const JAPAN_ANIME_TYPE_IDS = [30, 31, 32, 33]; // 动漫相关分类

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function importJapanAnime(startPage: number, endPage: number) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log(`\n🚀 开始导入日本动漫`);
  console.log(`   CMS: 非凡资源`);
  console.log(`   范围: 第 ${startPage} - ${endPage} 页`);
  console.log(`   分类: 日韩动漫/欧美动漫/海外动漫\n`);

  let totalImported = 0;
  let totalSkipped = 0;
  const startTime = Date.now();

  for (let page = startPage; page <= endPage; page++) {
    try {
      // 按分类获取数据
      for (const typeId of JAPAN_ANIME_TYPE_IDS) {
        const response = await fetch(`${CMS_API}?ac=detail&pg=${page}&t=${typeId}`, {
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) continue;

        const data = await response.json();
        if (!data.list || data.list.length === 0) continue;

        for (const vod of data.list) {
          try {
            // 只导入日本地区的内容
            if (vod.vod_area !== "日本") {
              totalSkipped++;
              continue;
            }

            // 跳过日本剧（连续剧）
            if (vod.vod_class?.includes("连续剧") || vod.vod_class?.includes("日本剧")) {
              totalSkipped++;
              continue;
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
              ? vod.vod_class.split(",").slice(0, 3).map((g: string) => g.trim())
              : [];

            const movie = {
              title: vod.vod_name || "未知",
              poster_url: vod.vod_pic || "",
              backdrop_url: vod.vod_pic || "",
              rating: vod.vod_score ? parseFloat(vod.vod_score) || 0 : 0,
              rating_count: 0,
              year: parseInt(vod.vod_year) || new Date().getFullYear(),
              genre: genres,
              description: (vod.vod_content || vod.vod_blurb || "").slice(0, 500),
              type: "anime",
              region: "日本",
              language: vod.vod_lang || "日语",
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
              totalSkipped++;
              continue;
            }

            // 插入数据库
            const { error } = await supabase.from("movies").insert(movie);
            if (!error) {
              totalImported++;
              console.log(`   ✅ ${movie.title}`);
            } else {
              totalSkipped++;
            }
          } catch (e) {
            // 单条数据错误，继续处理
          }
        }
      }

      // 进度显示
      const progress = ((page - startPage + 1) / (endPage - startPage + 1) * 100).toFixed(1);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      process.stdout.write(
        `\r📊 进度: ${progress}% | 页: ${page}/${endPage} | 导入: ${totalImported} | 跳过: ${totalSkipped} | ${elapsed}s`
      );

      // 限速
      await sleep(500);

    } catch (e) {
      console.log(`\n⚠️  页 ${page} 错误: ${(e as Error).message}`);
    }
  }

  console.log(`\n\n✅ 日本动漫导入完成！`);
  console.log(`   成功导入: ${totalImported} 条`);
  console.log(`   跳过: ${totalSkipped} 条`);
  console.log(`   耗时: ${((Date.now() - startTime) / 1000).toFixed(0)} 秒\n`);
}

// 运行
const args = process.argv.slice(2);
const startPage = parseInt(args[0]) || 1;
const endPage = parseInt(args[1]) || 100;

importJapanAnime(startPage, endPage).catch(console.error);
