/**
 * NetflixGC 反爬虫绕过测试
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');

const EDGE_PATH = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE_URL = 'https://www.netflixgc.org';

async function test() {
  console.log('启动浏览器（反检测模式）...');

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: false, // 使用有头模式，更难被检测
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled', // 禁用自动化控制检测
      '--disable-infobars',
      '--window-size=1920,1080',
    ],
  });

  try {
    const page = await browser.newPage();

    // 注入反检测脚本
    await page.evaluateOnNewDocument(() => {
      // 删除 webdriver 属性
      delete navigator.__proto__.webdriver;

      // 修改 navigator.webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });

      // 修改 chrome 对象
      window.chrome = {
        runtime: {},
        loadTimes: function() {},
        csi: function() {},
        app: {},
      };

      // 修改 permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters);

      // 修改 plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // 修改 languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['zh-CN', 'zh', 'en'],
      });
    });

    // 设置真实的 User-Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0');

    // 设置视口
    await page.setViewport({ width: 1920, height: 1080 });

    // 先访问首页建立 Cookie
    console.log('访问首页...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 5000));

    // 获取 cookies
    const cookies = await page.cookies();
    console.log(`获取到 ${cookies.length} 个 Cookie`);

    // 访问电影列表
    const listUrl = `${BASE_URL}/vodshow/1-----------.html`;
    console.log(`访问: ${listUrl}`);

    await page.goto(listUrl, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 10000));

    // 滚动页面
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise(r => setTimeout(r, 5000));

    // 获取HTML
    const html = await page.content();
    fs.writeFileSync('C:/Users/Administrator/Desktop/stellaflix/debug-anti-detect.html', html);
    console.log('HTML 已保存');

    // 检查播放链接
    const playLinks = html.match(/href="\/play\/[^"]*"/g) || [];
    console.log(`找到 ${playLinks.length} 个播放链接`);

    playLinks.slice(0, 5).forEach((link, i) => {
      console.log(`  [${i + 1}] ${link}`);
    });

    // 检查页面内容
    const hasContent = html.includes('vod-detail') || html.includes('vod-img');
    console.log(`页面有视频内容: ${hasContent}`);

  } finally {
    await browser.close();
  }
}

test().catch(console.error);
