/**
 * NetflixGC 测试脚本
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');

const EDGE_PATH = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE_URL = 'https://www.netflixgc.org';

async function test() {
  console.log('启动浏览器...');

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

    // 测试电影列表页面
    const listUrl = `${BASE_URL}/vodshow/1-----------.html`;
    console.log(`访问: ${listUrl}`);

    await page.goto(listUrl, { waitUntil: 'networkidle0' });
    console.log('等待页面加载...');
    await new Promise(r => setTimeout(r, 10000));

    // 滚动页面
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(r => setTimeout(r, 3000));

    // 获取HTML
    const html = await page.content();
    fs.writeFileSync('C:/Users/Administrator/Desktop/stellaflix/debug.html', html);
    console.log('HTML 已保存');

    // 检查播放链接
    const playLinks = html.match(/href="\/play\/[^"]*"/g) || [];
    console.log(`找到 ${playLinks.length} 个播放链接`);

    // 打印前5个
    playLinks.slice(0, 5).forEach((link, i) => {
      console.log(`  [${i + 1}] ${link}`);
    });

  } finally {
    await browser.close();
  }
}

test().catch(console.error);
