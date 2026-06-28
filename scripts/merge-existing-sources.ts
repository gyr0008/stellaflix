/**
 * 合并已有视频的多源链接
 * 遍历所有9个CMS源，为已存在的视频追加源链接
 * 支持多通道并行导入提升速度
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
const CONCURRENCY = 3; // 同时处理3个源

// 获取命令行参数：起始源索引
const args = process.argv.slice(2);
const startSourceIndex = parseInt(args[0]) || 0;

const startTime = Date.now();

console.log('🔧 开始合并已有视频的多源链接');
console.log('   并行通道数: ' + CONCURRENCY);
console.log('');

// 从CMS获取所有视频并建立标题->源链接的映射
async function fetchSourceData(source: { id: number; name: string; api: string }, maxPages: number = 1000) {
  const titleToUrl = new Map<string, string>();

  for (let page = 1; page <= maxPages; page++) {
    try {
      const url = source.api + '?ac=detail&pg=' + page;
      const response = await fetch(url);
      const data = await response.json();

      if (!data.list || data.list.length === 0) {
        break;
      }

      for (const vod of data.list) {
        const title = vod.vod_name || '';
        const vodPlayUrl = vod.vod_play_url || '';

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

        if (title && playUrl) {
          titleToUrl.set(title, playUrl);
        }
      }

      // 每100页输出一次进度
      if (page % 100 === 0) {
        console.log('   📡 ' + source.name + ': 已扫描 ' + page + ' 页, 找到 ' + titleToUrl.size + ' 个视频');
      }
    } catch (error) {
      // 跳过错误
    }
  }

  return titleToUrl;
}

// 单个源的合并任务
async function mergeSource(source: { id: number; name: string; api: string }) {
  console.log('📡 处理源: ' + source.name);

  // 获取该源的所有视频
  const titleToUrl = await fetchSourceData(source, 1000);
  console.log('   ✅ ' + source.name + ': 找到 ' + titleToUrl.size + ' 个视频');

  // 查询数据库中已有的视频
  const { data: movies, error } = await supabase.from('movies')
    .select('id, title, extra_data')
    .limit(10000);

  if (error || !movies) {
    console.log('   ❌ 查询数据库失败');
    return { merged: 0, skipped: 0 };
  }

  let merged = 0;
  let skipped = 0;

  // 为每个已有视频添加该源的链接
  for (const movie of movies) {
    const playUrl = titleToUrl.get(movie.title);
    if (!playUrl) {
      continue; // 该源没有这个视频
    }

    // 解析现有的extra_data
    let extraData: any = {};
    try {
      extraData = movie.extra_data ? JSON.parse(movie.extra_data) : {};
    } catch (e) {
      extraData = {};
    }

    if (!extraData.sources) {
      extraData.sources = [];
    }

    // 检查是否已有该源
    const sourceExists = extraData.sources.some((s: any) => s.name === source.name);
    if (sourceExists) {
      skipped++;
      continue;
    }

    // 添加新源
    extraData.sources.push({
      name: source.name,
      url: playUrl,
      api: source.api,
    });

    // 更新数据库
    const { error: updateError } = await supabase.from('movies').update({
      extra_data: JSON.stringify(extraData),
    }).eq('id', movie.id);

    if (!updateError) {
      merged++;
    }
  }

  console.log('   ✅ ' + source.name + ' 完成: 合并 ' + merged + ' 条');
  return { merged, skipped };
}

// 并行处理多个源
async function processInBatches(items: typeof sources, concurrency: number) {
  const results = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    console.log('🔄 并行处理第 ' + (i + 1) + '-' + Math.min(i + concurrency, items.length) + ' 个源...');

    const batchResults = await Promise.all(
      batch.map(source => mergeSource(source))
    );

    results.push(...batchResults);
  }

  return results;
}

async function main() {
  // 从指定索引开始处理
  const sourcesToProcess = sources.slice(startSourceIndex);
  console.log('   从第 ' + (startSourceIndex + 1) + ' 个源开始: ' + sourcesToProcess.map(s => s.name).join(', '));
  console.log('');

  const results = await processInBatches(sourcesToProcess, CONCURRENCY);

  const totalMerged = results.reduce((sum, r) => sum + r.merged, 0);
  const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);

  console.log('');
  console.log('🎉 合并完成！');
  console.log('   ════════════════════════════════════════════════');
  console.log('   合并源链接: ' + totalMerged + ' 条');
  console.log('   已存在跳过: ' + totalSkipped + ' 条');
  console.log('   总耗时: ' + ((Date.now() - startTime) / 1000).toFixed(0) + ' 秒');
  console.log('   ════════════════════════════════════════════════');
}

main().catch(console.error);
