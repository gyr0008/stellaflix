/**
 * 解密播放地址 - 第二层解密
 */

const https = require('https');
const crypto = require('crypto');

const BASE_URL = 'https://www.netflixgc.org';

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': BASE_URL,
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function test() {
  // 从解析结果中提取的加密URL
  const encryptedUrl = 'n/n1+OfjdH7se6tCovNC/5X8ZEoYm6cpNR5/wF/miWHX0owAe+sjTPCnrdpyvKi+bbzbG9CCSOBgPfCuMf+vywATs2Y9bk+EUko2/C3cEhKWEZuJwrjv36R3bBORvrSbNsZBvU0Wuk3jWP/pxopLI/wLcV2k1kMdZrN0OcypRReeGYZzu3kmSl0sRAkKihOAP7mDnbJXW3H/HnT3rCsrqh61sd8HJ0+ZKBkmJCneAMxhCSiUzBwQeUb1OLI44oYmsgBkhaUmGAQslJsYrhvbe0LR7bqdAe6XwV60LdwX6jrV5Ytp9DEEAfcT5oKN8ZAXxcim/izqL3tzqK66S9lTKwhpc1t7Dm3fsI1ZsCI1Ge4=';
  const id1 = '13be01d47b2a5a0d';
  const id2 = '01d47b2a5a0da3f6771b';

  console.log('加密URL:', encryptedUrl);
  console.log('id1:', id1);
  console.log('id2:', id2);

  // 尝试AES解密
  // 常见的key和iv组合
  const attempts = [
    // 使用id1作为key
    { key: id1, iv: id2.substring(0, 16) },
    // 使用id2作为key
    { key: id2.substring(0, 16), iv: id1 },
    // 固定key
    { key: 'netflixgc2024abc', iv: 'netflixgc2024abc' },
  ];

  for (const attempt of attempts) {
    try {
      const decipher = crypto.createDecipheriv('aes-128-cbc', attempt.key, attempt.iv);
      let decrypted = decipher.update(encryptedUrl, 'base64', 'utf8');
      decrypted += decipher.final('utf8');

      if (decrypted.includes('http') || decrypted.includes('m3u8')) {
        console.log('\n✅ 解密成功!');
        console.log('Key:', attempt.key);
        console.log('IV:', attempt.iv);
        console.log('解密结果:', decrypted);
        return;
      }
    } catch (e) {
      // 继续尝试
    }
  }

  console.log('\n❌ 常规解密失败，尝试其他方法...');

  // 尝试直接base64解码
  try {
    const decoded = Buffer.from(encryptedUrl, 'base64').toString('utf8');
    console.log('Base64解码:', decoded);
  } catch (e) {
    console.log('Base64解码失败');
  }
}

test().catch(console.error);
