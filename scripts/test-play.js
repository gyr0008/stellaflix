/**
 * 测试播放页面，提取加密URL
 */

const https = require('https');
const http = require('http');

const BASE_URL = 'https://www.netflixgc.org';

function fetch(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function test() {
  const playUrl = `${BASE_URL}/play/118539-1-1.html`;
  console.log(`访问: ${playUrl}`);

  const html = await fetch(playUrl);

  // 提取 player_aaaa
  const match = html.match(/player_aaaa=(\{.*?\})<\/script>/s);

  if (match) {
    console.log('\n✅ 找到 player_aaaa');
    const playerData = JSON.parse(match[1]);
    console.log('\n加密的URL:', playerData.url);
    console.log('视频名称:', playerData.vod_data?.vod_name);
    console.log('播放源:', playerData.from);
  } else {
    console.log('\n❌ 未找到 player_aaaa');
  }
}

test().catch(console.error);
