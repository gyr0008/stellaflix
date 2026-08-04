#!/usr/bin/env node
'use strict';
/*
 * 构建期注入 DanDanPlay(AppId / AppSecret) 占位符。
 *
 * 设计对齐 Kazumi（dandan_credentials.dart 源码留空 + CI secrets 注入产物）：
 *   - 源码工作树中 client.js 的 DEFAULT_APP_ID / DEFAULT_APP_SECRET 永远为 ''（零污染）；
 *   - 仅在打包产物(client.js 副本)上，由 afterPack 读取环境变量替换占位符；
 *   - 未设置环境变量时保持 ''，不写任何明文凭证进仓库或源码。
 *
 * 环境变量（命名对齐 Kazumi）：
 *   DANDANAPI_APPID  —— 弹弹play 应用 Id
 *   DANDANAPI_KEY    —— 弹弹play 应用密钥(AppSecret)
 *
 * 复用点：
 *   - build/after-pack.js（Electron 打包产物 client.js 注入）
 *   - 可直接 require 做单元测试（无需文件系统副作用时使用 injectIntoSource）
 */

const fs = require('fs');
const path = require('path');

const ENV_APP_ID = 'DANDANAPI_APPID';
const ENV_APP_SECRET = 'DANDANAPI_KEY';

// 仅匹配 DEFAULT_APP_ID / DEFAULT_APP_SECRET 这两行的赋值，避免误伤其它 '' 字面量。
const RE_APP_ID = /var DEFAULT_APP_ID = '[^']*';[^\n]*/;
const RE_APP_SECRET = /var DEFAULT_APP_SECRET = '[^']*';[^\n]*/;

/**
 * 纯函数：对源码字符串做占位符替换，不触碰文件系统。
 * @param {string} source       client.js 源码
 * @param {string|undefined} appId       传入则替换，undefined 则跳过
 * @param {string|undefined} appSecret   传入则替换，undefined 则跳过
 * @returns {{ out: string, replaced: { appId: boolean, appSecret: boolean } }}
 */
function injectIntoSource(source, appId, appSecret) {
  let out = source;
  const replaced = { appId: false, appSecret: false };

  if (typeof appId === 'string') {
    out = out.replace(RE_APP_ID, `var DEFAULT_APP_ID = ${JSON.stringify(appId)};`);
    replaced.appId = true;
  }
  if (typeof appSecret === 'string') {
    out = out.replace(RE_APP_SECRET, `var DEFAULT_APP_SECRET = ${JSON.stringify(appSecret)};`);
    replaced.appSecret = true;
  }
  return { out, replaced };
}

/**
 * 对磁盘上的 client.js 副本执行注入（就地改写）。
 * @param {string} filePath  打包产物中的 client.js 绝对/相对路径
 * @param {string|undefined} appId
 * @param {string|undefined} appSecret
 * @returns {{ replaced: { appId: boolean, appSecret: boolean } }}
 */
function injectFile(filePath, appId, appSecret) {
  const source = fs.readFileSync(filePath, 'utf8');
  const { out, replaced } = injectIntoSource(source, appId, appSecret);
  fs.writeFileSync(filePath, out, 'utf8');
  return { replaced };
}

/**
 * 在打包产物目录中定位 client.js 副本并尝试注入。
 * 找不到文件或环境变量未设置时优雅跳过（不抛错）。
 * @param {object} context  electron-builder afterPack context
 * @returns {boolean} 是否执行了注入
 */
function injectForAfterPack(context) {
  const appId = process.env[ENV_APP_ID];
  const appSecret = process.env[ENV_APP_SECRET];
  if (!appId && !appSecret) {
    console.log(`  • [inject-dandan-creds] 未设置 ${ENV_APP_ID}/${ENV_APP_SECRET}，跳过注入（保持源码占位符 ''）。`);
    return false;
  }

  // asar:false 时 client.js 以真实文件落盘于 resources/app/...
  const candidate = path.join(context.appOutDir, 'resources', 'app', 'public', 'video', 'danmaku', 'client.js');
  if (!fs.existsSync(candidate)) {
    console.warn(`  • [inject-dandan-creds] 未找到打包副本：${candidate}，跳过注入。`);
    return false;
  }

  const { replaced } = injectFile(candidate, appId || undefined, appSecret || undefined);
  console.log(`  • [inject-dandan-creds] 已注入 ${path.basename(candidate)}：appId=${replaced.appId}, appSecret=${replaced.appSecret}`);
  return true;
}

// CLI 入口：node scripts/inject-dandan-creds.cjs <client.js 路径>
if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    console.error('用法: node scripts/inject-dandan-creds.cjs <client.js 路径>');
    process.exit(1);
  }
  const appId = process.env[ENV_APP_ID];
  const appSecret = process.env[ENV_APP_SECRET];
  if (!appId && !appSecret) {
    console.log(`[inject-dandan-creds] 未设置 ${ENV_APP_ID}/${ENV_APP_SECRET}，跳过注入（保持源码占位符 ''）。`);
    process.exit(0);
  }
  const { replaced } = injectFile(target, appId || undefined, appSecret || undefined);
  console.log(`[inject-dandan-creds] ${path.basename(target)} 注入完成: appId=${replaced.appId}, appSecret=${replaced.appSecret}`);
}

module.exports = { injectIntoSource, injectFile, injectForAfterPack, ENV_APP_ID, ENV_APP_SECRET, RE_APP_ID, RE_APP_SECRET };
