/**
 * 多源面板对齐 Kazumi — 阶段0-4 自动化验收闸门
 *
 * 把分散的 vm 解析、单测、集成测试收敛成一条命令，输出「绿/红闸门」。
 * 运行：node scripts/multisource_gate.cjs
 * （等价于手动跑下方各 node --test；不依赖 Electron / GUI）
 *
 * 覆盖：
 *   - vm.Script 全解析（public/video 全部脚本，0 失败）
 *   - detail-core 单测（P1 源隔离 / P7 跨线路对齐）
 *   - source-picker 单测（面板形态 / 流式 / 边界）
 *   - player-road-episode 单测（线路/选集切换）
 *   - detail-source-stream 集成（流式健壮性 / 多线路不丢）
 *   - player-core 单测（F5 EpisodeSelection 值对象）
 */
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const NODE = process.execPath;

// 各闸门：{ name, cmd, args }
const GATES = [
  {
    name: 'vm.Script 全解析 (public/video)',
    cmd: NODE,
    args: [path.join(ROOT, 'scripts', '_verify_video_parse.js')]
  },
  {
    name: 'detail-core 单测 (P1/P7)',
    cmd: NODE,
    args: ['--test', path.join(ROOT, 'test', 'detail-core.test.js')]
  },
  {
    name: 'source-picker 单测 (面板/流式/边界)',
    cmd: NODE,
    args: ['--test', path.join(ROOT, 'test', 'source-picker.test.js')]
  },
  {
    name: 'player-road-episode 单测 (线路/选集)',
    cmd: NODE,
    args: ['--test', path.join(ROOT, 'test', 'player-road-episode.test.js')]
  },
  {
    name: 'detail-source-stream 集成 (流式健壮性/多线路)',
    cmd: NODE,
    args: ['--test', path.join(ROOT, 'test', 'detail-source-stream.test.js')]
  },
  {
    name: 'multisource-actions (B1 验证码态/B2 错误部件)',
    cmd: NODE,
    args: ['--test', path.join(ROOT, 'test', 'multisource-actions.test.js')]
  },
  {
    name: 'player-core 单测 (F5 EpisodeSelection)',
    cmd: NODE,
    args: ['--test', path.join(ROOT, 'test', 'player-core.test.js')]
  }
];

function run(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: ROOT, env: process.env });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => resolve({ code, out }));
  });
}

function parseTap(out) {
  const m = out.match(/# (?:tests|pass|fail) (\d+)/g);
  if (!m) return { tests: 0, pass: 0, fail: 0 };
  let tests = 0, pass = 0, fail = 0;
  m.forEach((line) => {
    const mm = line.match(/# (\w+) (\d+)/);
    if (!mm) return;
    if (mm[1] === 'tests') tests = +mm[2];
    else if (mm[1] === 'pass') pass = +mm[2];
    else if (mm[1] === 'fail') fail = +mm[2];
  });
  return { tests, pass, fail };
}

(async () => {
  console.log('================================================');
  console.log(' 多源面板对齐 Kazumi · 阶段0-4 自动化验收闸门');
  console.log('================================================');
  let totalPass = 0, totalFail = 0, totalTests = 0;
  let allOk = true;

  for (const g of GATES) {
    process.stdout.write('▶ ' + g.name + ' ... ');
    const { code, out } = await run(g.cmd, g.args);
    const r = parseTap(out);
    totalTests += r.tests; totalPass += r.pass; totalFail += r.fail;
    if (code === 0 && r.fail === 0) {
      console.log('✅ ' + r.pass + '/' + r.tests + ' pass');
    } else {
      allOk = false;
      console.log('❌ fail=' + r.fail + ' (exit ' + code + ')');
      console.log(out.split('\n').filter((l) => /not ok|Error|✗/.test(l)).slice(0, 8).join('\n'));
    }
  }

  console.log('------------------------------------------------');
  console.log('合计: ' + totalPass + ' pass / ' + totalFail + ' fail (共 ' + totalTests + ' 测)');
  console.log(allOk ? '✅ 自动化闸门全绿（可进入 Electron 真机截图验收）' : '❌ 自动化闸门存在失败，需先修复');
  process.exit(allOk ? 0 : 1);
})();
