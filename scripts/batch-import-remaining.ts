/**
 * 批量导入剩余内容（分批执行）
 * 每批1000页，避免token上限
 * 包含所有6个过滤规则
 * 支持多源合并：同一视频保留9个不同源的播放链接
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

// ====== 过滤规则 ======

// 规则2: 低质量视频关键词
const SKIP_TITLE_PATTERNS = [
  '穿越', '重生', '霸道', '狂龙', '异界', '至尊', '神医', '高手',
  '仙侠', '魔尊', '帝王', '战神', '龙王', '赘婿', '豪门',
  '甜宠', '虐恋', '总裁', '腹黑', '冰山', '傲娇'
];

// 规则5: 综艺节目关键词
const SKIP_GENRE_KEYWORDS = [
  '综艺', '真人秀', '脱口秀', '访谈', '选秀', '竞技', '挑战',
  '晚会', '盛典', '颁奖', '音乐节', '演唱会'
];

// 规则1: 地区过滤（仅对电视剧/短片生效）
const SKIP_REGIONS = ['台湾', '泰国', '大陆'];

// 规则6: 特定标签
const SKIP_TAGS = [
  '福利', '写真', '水印', '成人', '伦理', '限制级',
  '三级', 'AV', '无码', '有码', '中文字幕', '自慰',
  '做爱', '口交', '肛交'
];

function detectType(title: string, genres: string[], vodClass: string): string {
  const allText = (title + ' ' + genres.join(' ') + ' ' + (vodClass || '')).toLowerCase();

  if (allText.includes('纪录片') || allText.includes('记录片') || allText.includes('documentary')) {
    return 'documentary';
  }
  if (allText.includes('动画') || allText.includes('动漫') || allText.includes('anime')) {
    return 'anime';
  }
  if (allText.includes('儿童') || allText.includes('卡通') || allText.includes('kids')) {
    return 'kids';
  }
  if (allText.includes('电视剧') || allText.includes('剧集') || allText.includes('连载')) {
    return 'tv';
  }
  return 'movie';
}

function shouldSkip(title: string, genres: string[], region: string, type: string): { skip: boolean; reason: string } {
  // 规则2: 低质量视频
  for (const pattern of SKIP_TITLE_PATTERNS) {
    if (title.includes(pattern)) {
      return { skip: true, reason: '低质量: ' + pattern };
    }
  }

  // 规则5: 综艺节目
  for (const keyword of SKIP_GENRE_KEYWORDS) {
    if (genres.some(g => g.includes(keyword))) {
      return { skip: true, reason: '综艺: ' + keyword };
    }
  }

  // 规则1: 地区过滤（仅电视剧/短片）
  if (type === 'tv' && SKIP_REGIONS.includes(region)) {
    return { skip: true, reason: '地区过滤: ' + region };
  }

  // 规则6: 特定标签
  for (const tag of SKIP_TAGS) {
    if (genres.some(g => g.includes(tag))) {
      return { skip: true, reason: '标签过滤: ' + tag };
    }
  }

  return { skip: false, reason: '' };
}

// 获取批次范围
const args = process.argv.slice(2);
const startPage = parseInt(args[0]) || 1001;
const endPage = parseInt(args[1]) || 2000;

const startTime = Date.now();
let lastNotifyTime = startTime;
const NOTIFY_INTERVAL = 60 * 60 * 1000; // 60分钟

let totalImported = 0;
let totalMerged = 0;
let totalSkipped = 0;
let totalErrors = 0;

console.log('🚀 开始批量导入剩余内容（多源合并模式）');
console.log('   范围: 第 ' + startPage + ' - ' + endPage + ' 页');
console.log('   源数量: ' + sources.length + ' 个');
console.log('');

async function importSource(source: { id: number; name: string; api: string }) {
  console.log('📡 开始导入源: ' + source.name);
  console.log('   ──────────────────────────────────────────────────');

  let sourceImported = 0;
  let sourceMerged = 0;
  let sourceSkipped = 0;
  let sourceErrors = 0;

  const maxPage = Math.min(endPage, 9000);

  for (let page = startPage; page <= maxPage; page++) {
    try {
      const url = source.api + '?ac=detail&pg=' + page;
      const response = await fetch(url);
      const data = await response.json();

      if (!data.list || data.list.length === 0) {
        console.log('   ⏹️ ' + source.name + ' 第' + page + '页无数据，停止');
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

        const { skip, reason } = shouldSkip(title, genres, vodArea, detectedType);
        if (skip) {
          sourceSkipped++;
          continue;
        }

        // 解析播放链接
        let playUrl = '';
        if (vodPlayUrl) {
          const urls = vodPlayUrl.split('#');
          if (urls.length > 0) {
            const firstUrl = urls[0].split('$');
            if (firstUrl.length >= 2) {
              playUrl = firstUrl[1];
            }
          }
        }

        // 准备源信息
        const sourceInfo = {
          name: source.name,
          url: playUrl,
          api: source.api,
        };

        // 检查是否已存在同标题视频
        const { data: existing } = await supabase.from('movies')
          .select('id, extra_data')
          .eq('title', title)
          .limit(1);

        if (existing && existing.length > 0) {
          // 已存在 - 合并源链接
          const movie = existing[0];
          let extraData: any = {};
          try {
            extraData = movie.extra_data ? JSON.parse(movie.extra_data) : {};
          } catch (e) {
            extraData = {};
          }

          // 初始化sources数组
          if (!extraData.sources) {
            extraData.sources = [];
          }

          // 检查是否已有该源
          const sourceExists = extraData.sources.some((s: any) => s.name === source.name);
          if (!sourceExists) {
            extraData.sources.push(sourceInfo);
          }

          // 更新记录
          const { error } = await supabase.from('movies').update({
            extra_data: JSON.stringify(extraData),
          }).eq('id', movie.id);

          if (error) {
            sourceErrors++;
          } else {
            sourceMerged++;
          }
        } else {
          // 不存在 - 创建新记录
          const extraData = {
            sources: [sourceInfo],
          };

          const { error } = await supabase.from('movies').insert({
            title: title,
            description: vod.vod_content || vod.vod_remarks || '',
            poster_url: vodPic,
            backdrop_url: vodPic,
            video_url: playUrl,
            year: parseInt(vodYear) || null,
            genre: genres,
            rating: vodRating || 0,
            rating_count: 0,
            is_premium: false,
            is_published: true,
            type: detectedType,
            extra_data: JSON.stringify(extraData),
          });

          if (error) {
            sourceErrors++;
          } else {
            sourceImported++;
          }
        }
      }

      // 进度提醒
      const currentTime = Date.now();
      if (currentTime - lastNotifyTime >= NOTIFY_INTERVAL) {
        const elapsed = ((currentTime - startTime) / 1000 / 60).toFixed(1);
        const progress = ((page - startPage + 1) / (maxPage - startPage + 1) * 100).toFixed(1);
        console.log('');
        console.log('⏰ [60分钟提醒] ' + source.name + ' | 进度: ' + progress + '% | 页: ' + page + '/' + maxPage);
        console.log('   新增: ' + sourceImported + ' | 合并: ' + sourceMerged + ' | 跳过: ' + sourceSkipped + ' | 已运行: ' + elapsed + '分钟');
        console.log('');
        lastNotifyTime = currentTime;
      }

    } catch (error) {
      sourceErrors++;
    }
  }

  console.log('✅ ' + source.name + ' 完成');
  console.log('   新增: ' + sourceImported + ' | 合并: ' + sourceMerged + ' | 跳过: ' + sourceSkipped);

  totalImported += sourceImported;
  totalMerged += sourceMerged;
  totalSkipped += sourceSkipped;
  totalErrors += sourceErrors;
}

async function main() {
  for (const source of sources) {
    await importSource(source);
  }

  console.log('');
  console.log('🎉 全部导入完成！');
  console.log('   ════════════════════════════════════════════════');
  console.log('   新增视频: ' + totalImported + ' 条');
  console.log('   合并源: ' + totalMerged + ' 条');
  console.log('   跳过: ' + totalSkipped + ' 条');
  console.log('   失败: ' + totalErrors + ' 条');
  console.log('   总耗时: ' + ((Date.now() - startTime) / 1000).toFixed(0) + ' 秒');
  console.log('   ════════════════════════════════════════════════');
}

main().catch(console.error);
