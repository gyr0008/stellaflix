/**
 * Puppeteer 测试脚本
 * 测试 Edge 浏览器是否能正常启动
 */

const puppeteer = require('puppeteer-core');

const EDGE_PATH = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

async function test() {
  console.log('正在启动 Edge 浏览器...');

  try {
    const browser = await puppeteer.launch({
      executablePath: EDGE_PATH,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    console.log('✅ 浏览器启动成功！');

    const page = await browser.newPage();
    console.log('✅ 新建页面成功！');

    await page.goto('https://www.netflixgc.org/', { waitUntil: 'networkidle2' });
    console.log('✅ 访问页面成功！');

    const title = await page.title();
    console.log(`页面标题: ${title}`);

    await browser.close();
    console.log('✅ 测试完成！');
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }
}

test();
