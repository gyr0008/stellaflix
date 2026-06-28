/**
 * NetflixGC 深度调试
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
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  try {
    const page = await browser.newPage();

    // 注入反检测
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // 监听控制台输出
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    // 监听错误
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

    // 监听网络请求
    page.on('request', request => {
      if (request.url().includes('ajax') || request.url().includes('api')) {
        console.log('API REQUEST:', request.url());
      }
    });

    page.on('response', response => {
      if (response.url().includes('ajax') || response.url().includes('api')) {
        console.log('API RESPONSE:', response.url(), response.status());
      }
    });

    // 访问页面
    const url = `${BASE_URL}/vodshow/1-----------.html`;
    console.log(`访问: ${url}`);

    await page.goto(url, { waitUntil: 'networkidle0' });
    console.log('页面加载完成');

    // 等待
    await new Promise(r => setTimeout(r, 8000));

    // 检查页面结构
    const pageInfo = await page.evaluate(() => {
      return {
        title: document.title,
        bodyLength: document.body.innerHTML.length,
        scripts: document.scripts.length,
        hasJQuery: typeof jQuery !== 'undefined',
        windowKeys: Object.keys(window).filter(k => k.includes('mac') || k.includes('cms') || k.includes('vod')),
      };
    });

    console.log('页面信息:', JSON.stringify(pageInfo, null, 2));

    // 尝试手动触发内容加载
    console.log('尝试手动触发加载...');
    await page.evaluate(() => {
      // 尝试触发 DOMContentLoaded
      document.dispatchEvent(new Event('DOMContentLoaded'));

      // 尝试调用可能存在的加载函数
      if (typeof window.loadList === 'function') window.loadList();
      if (typeof window.ajaxList === 'function') window.ajaxList();
    });

    await new Promise(r => setTimeout(r, 5000));

    // 再次检查
    const html = await page.content();
    const playLinks = html.match(/href="\/play\/[^"]*"/g) || [];
    console.log(`最终播放链接数: ${playLinks.length}`);

  } finally {
    await browser.close();
  }
}

test().catch(console.error);
