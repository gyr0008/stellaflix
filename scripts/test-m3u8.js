/**
 * 使用浏览器获取真实的 m3u8 地址
 */

const puppeteer = require('puppeteer-core');

const EDGE_PATH = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

async function test() {
  console.log('启动浏览器...');

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

    // 监听网络请求
    const m3u8Urls = [];
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('.m3u8') || url.includes('video')) {
        m3u8Urls.push(url);
        console.log('🎯 发现 m3u8:', url);
      }
    });

    // 访问播放页面
    const playUrl = 'https://www.netflixgc.org/play/118539-1-1.html';
    console.log(`访问: ${playUrl}`);

    await page.goto(playUrl, { waitUntil: 'networkidle0' });
    console.log('页面加载完成');

    // 等待一段时间让播放器加载
    await new Promise(r => setTimeout(r, 10000));

    // 尝试点击播放按钮
    try {
      await page.click('.artplayer-icon-play, .art-state, video');
      console.log('点击播放按钮');
    } catch (e) {
      console.log('未找到播放按钮');
    }

    await new Promise(r => setTimeout(r, 5000));

    console.log(`\n总共发现 ${m3u8Urls.length} 个 m3u8 URL`);
    m3u8Urls.forEach((url, i) => console.log(`  [${i + 1}] ${url}`));

  } finally {
    await browser.close();
  }
}

test().catch(console.error);
