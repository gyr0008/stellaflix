/**
 * 测试解密播放地址
 */

const https = require('https');

const BASE_URL = 'https://www.netflixgc.org';
const PARSE_API = 'https://cjbfq.netflixgc.tv/player/ec.php';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': BASE_URL,
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ raw: data });
        }
      });
    }).on('error', reject);
  });
}

async function test() {
  // 加密的URL（从第一步获取）
  const encryptedUrl = 'JTY4JTc0JTc0JTcwJTczJTNBJTJGJTJGJTcwJTJFJTYyJTc2JTc2JTc2JTc2JTc2JTc2JTc2JTc2JTc2JTMxJTY2JTJFJTYzJTZGJTZEJTJGJTc2JTY5JTY0JTY1JTZGJTJGJTY4JTc1JTZGJTZEJTY1JTY5JTY3JTc1JTY5JTMxJTM5JTM5JTMyJTJGJXU3QjJDJTMwJTMxJXU5NkM2JTJGJTY5JTZFJTY0JTY1JTc4JTJFJTZEJTMzJTc1JTM4';

  const parseUrl = `${PARSE_API}?code=netflix&if=1&url=${encodeURIComponent(encryptedUrl)}`;
  console.log(`解析 URL: ${parseUrl}`);

  const result = await fetchJson(parseUrl);
  console.log('\n解析结果:', JSON.stringify(result, null, 2));
}

test().catch(console.error);
