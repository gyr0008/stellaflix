/*
 * Stellaflix 打包后处理 — DanDanPlay 凭证注入（安全 no-op 桩）
 *
 * 背景：
 *   build/after-pack.js 第 4 行 require 本文件，第 69 行调用 injectForAfterPack(context)，
 *   原设计意图是：从环境变量 DANDANAPI_APPID / DANDANAPI_KEY 把 DanDanPlay 凭证注入
 *   「打包副本」，作为出厂预填的便利项（对齐 Kazumi dandan_credentials 模式）。
 *
 * 为什么是 no-op（而非重建注入逻辑）：
 *   1. 合规 —— 项目铁律「不预置任何源/凭证」。把 AppId/AppSecret 烤进分发 exe 既违反 GPL
 *      精神，也存在密钥泄露风险。弹幕凭证由用户在应用内设置面板自行配置并持久化到
 *      localStorage（stellaflix-danmaku-source-dandanplay），出厂保持空才是合规主路径。
 *   2. 原 inject-dandan-creds.cjs 在 git 历史中从未存在（悬空引用），重建需猜测 client.js
 *      中的占位符替换格式，风险大于收益。
 *
 * 本桩只保证 build/after-pack.js 可正常加载、rcedit 图标/版本注入照常执行，不写入任何凭证。
 *
 * 若未来确需构建期注入：在此处读取 DANDANAPI_APPID / DANDANAPI_KEY 环境变量，对打包后的
 * public/video/danmaku/client.js 做精确字符串替换（须与 client.js 默认凭证占位符严格对齐），
 * 且务必仅在 CI/本地构建环境设置该环境变量，绝不提交到仓库。
 */
'use strict';

/**
 * 构建期凭证注入（桩）。
 * @param {object} context electron-builder afterPack context（此处未使用）
 */
function injectForAfterPack(/* context */) {
  // 安全 no-op：保留 after-pack.js 的 rcedit 图标/版本注入，不向分发二进制写入任何凭证。
  // 弹幕凭证由用户在应用内设置面板配置（localStorage），出厂保持空。
}

module.exports = { injectForAfterPack };
