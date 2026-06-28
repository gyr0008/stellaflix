/**
 * 多通道并行批量导入
 * 同时处理多个源，大幅提升导入速度
 * 每批1000页，支持多源合并
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// 读取环境变量
const envPath = path.join(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env: Record<string, string> = {};
envContent.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) env[key.trim()] = value.trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

// 视频源配置
const sources = [
  { id: 1, name: '暴风影视', api: 'https://bfzyapi.com/api.php/provide/vod/' },
  { id: 2, name: '量子资源', api: 'https://cj.lziapi.com/api.php/provide/vod/' },
  { id: 3, name: '非凡资源', api: 'https://cj.ffzyapi.com/api.php/provide/vod/' },
  { id: 4, name: '光速资源', api: 'https://api.guangsuapi.com/api.php/provide/vod/' },
  { id: 5, name: '红牛资源', api: 'https://www.hongniuzy2.com/api.php/provide/vod/' },
  { id: 6, name: '恋单资源', api: 'https://www.lovedan.net/api.php/provide/vod/' },
  { id: 7, name: '瑞诚资源', api: 'https://cj.rycjapi.com/api.php/provide/vod/' },
  { id: 8, name: '360资源', api: 'https://360zy.com/api.php/provide/vod/' },
  { id: 9, name: '佳影资源', api: 'https://jyzyapi.com/api.php/provide/vod/' },
];

// 并行通道数
const CONCURRENCY = 3;

// ====== 过滤规则 ======
const SKIP_TITLE_PATTERNS = [
  '穿越', '重生', '霸道', '狂龙', '异界', '至尊', '神医', '高手',
  '仙侠', '魔尊', '帝王', '战神', '龙王', '赘婿', '豪门',
  '甜宠', '虐恋', '总裁', '腹黑', '冰山', '傲娇'
];

const SKIP_GENRE_KEYWORDS = [
  '综艺', '真人秀', '脱口秀', '访谈', '选秀', '竞技', '挑战',
  '晚会', '盛典', '颁奖', '音乐节', '演唱会'
];

const SKIP_REGIONS = ['台湾', '泰国', '大陆'];

const SKIP_TAGS = [
  '福利', '写真', '水印', '成人', '伦理', '限制级',
  '三级', 'AV', '无码', '有码', '中文字幕', '自慰',
  '做爱', '口交', '肛交'
];

function detectType(title: string, genres: string[], vodClass: string): string {
  const allText = (title + ' ' + genres.join(' ') + ' ' + (vodClass || '')).toLowerCase();
  if (allText.includes('纪录片') || allText.includes('记录片')) return 'documentary';
  if (allText.includes('动画') || allText.includes('动漫')) return 'anime';
  if (allText.includes('儿童') || allText.includes('卡通')) return 'kids';
  if (allText.includes('电视剧') || allText.includes('剧集')) return 'tv';
  return 'movie';
}

function shouldSkip(title: string, genres: string[], region: string, type: string): boolean {
  for (const pattern of SKIP_TITLE_PATTERNS) {
    if (title.includes(pattern)) return true;
  }
  for (const keyword of SKIP_GENRE_KEYWORDS) {
    if (genres.some(g => g.includes(keyword))) return true;
  }
  if (type === 'tv' && SKIP_REGIONS.includes(region)) return true;
  for (const tag of SKIP_TAGS) {
    if (genres.some(g => g.includes(tag))) return true;
  }
  return false;
}

// 获取命令行参数
const args = process.argv.slice(2);
const startPage = parseInt(args[0]) || 2001;
const endPage = parseInt(args[1]) || 3000;

const startTime = Date.now();
let lastNotifyTime = startTime;
const NOTIFY_INTERVAL = 60 * 60 * 1000;

// 全局计数器
const globalStats = {
  imported: 0,
  merged: 0,
  skipped: 0,
  errors: 0,
};

console.log('🚀 多通道并行导入');
console.log('   范围: 第 ' + startPage + ' - ' + endPage + ' 页');
console.log('   通道数: ' + CONCURRENCY);
console.log('   源数量: ' + sources.length + ' 个');
console.log('');

// 单个源的导入任务
async function importSource(source: { id: number; name: string; api: string }) {
  let sourceImported = 0;
  let sourceMerged = 0;
  let sourceSkipped = 0;

  const maxPage = Math.min(endPage, 9000);

  for (let page = startPage; page <= maxPage; page++) {
    try {
      const url = source.api + '?ac=detail&pg=' + page;
      const response = await fetch(url);
      const data = await response.json();

      if (!data.list || data.list.length === 0) {
        break;
      }

      for (const vod of data.list) {
        const title = vod.vod_name || '';
        const vodYear = vod.vod_year || '';
        const vodArea = vod.vod_area || '';
        const vodClass = vod.vod_class || '';
        const vodRating = parseFloat(vod.vod_score || '0');
        const vodPic = vod.vod_pic || '';
        const vodPlayUrl = vod.vod_play_url || '';
        const genres = vodClass.split(',').map((g: string) => g.trim()).filter(Boolean);
        const detectedType = detectType(title, genres, vodClass);

        if (shouldSkip(title, genres, vodArea, detectedType)) {
          sourceSkipped++;
          continue;
        }

        let playUrl = '';
        if (vodPlayUrl) {
          const urls = vodPlayUrl.split('#');
          if (urls.length > 0) {
            const firstUrl = urls[0].split('$');
            if (firstUrl.length >= 2) playUrl = firstUrl[1];
          }
        }

        const sourceInfo = { name: source.name, url: playUrl, api: source.api };

        // 检查是否已存在
        const { data: existing } = await supabase.from('movies')
          .select('id, extra_data')
          .eq('title', title)
          .limit(1);

        if (existing && existing.length > 0) {
          // 合并源
          const movie = existing[0];
          let extraData: any = {};
          try { extraData = movie.extra_data ? JSON.parse(movie.extra_data) : {}; } catch (e) { extraData = {}; }
          if (!extraData.sources) extraData.sources = [];

          if (!extraData.sources.some((s: any) => s.name === source.name)) {
            extraData.sources.push(sourceInfo);
            await supabase.from('movies').update({ extra_data: JSON.stringify(extraData) }).eq('id', movie.id);
            sourceMerged++;
          }
        } else {
          // 新增
          const extraData = { sources: [sourceInfo] };
          const { error } = await supabase.from('movies').insert({
            title, description: vod.vod_content || vod.vod_remarks || '',
            poster_url: vodPic, backdrop_url: vodPic, video_url: playUrl,
            year: parseInt(vodYear) || null, genre: genres, rating: vodRating || 0,
            is_published: true, type: detectedType, extra_data: JSON.stringify(extraData),
          });
          if (!error) sourceImported++;
        }
      }

      // 进度提醒
      const currentTime = Date.now();
      if (currentTime - lastNotifyTime >= NOTIFY_INTERVAL) {
        console.log('⏰ [60分钟提醒] ' + source.name + ' | 页: ' + page + '/' + maxPage);
        lastNotifyTime = currentTime;
      }
    } catch (error) {
      // 跳过错误
    }
  }

  // 更新全局计数
  globalStats.imported += sourceImported;
  globalStats.merged += sourceMerged;
  globalStats.skipped += sourceSkipped;

  console.log('✅ ' + source.name + ' 完成: 新增 ' + sourceImported + ' | 合并 ' + sourceMerged);
}

// 并行处理
async function processInBatches(items: typeof sources, concurrency: number) {
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    console.log('🔄 并行处理第 ' + (i + 1) + '-' + Math.min(i + concurrency, items.length) + ' 个源...');

    await Promise.all(batch.map(source => importSource(source)));
  }
}

async function main() {
  await processInBatches(sources, CONCURRENCY);

  console.log('');
  console.log('🎉 全部导入完成！');
  console.log('   ════════════════════════════════════════════════');
  console.log('   新增视频: ' + globalStats.imported + ' 条');
  console.log('   合并源: ' + globalStats.merged + ' 条');
  console.log('   跳过: ' + globalStats.skipped + ' 条');
  console.log('   总耗时: ' + ((Date.now() - startTime) / 1000).toFixed(0) + ' 秒');
  console.log('   ════════════════════════════════════════════════');
}

main().catch(console.error);
