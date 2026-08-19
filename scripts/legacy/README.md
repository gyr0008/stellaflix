# scripts/legacy/ — 隔离的浏览器端行为测试

## 为什么隔离到这里
这 6 个脚本测试的是**浏览器 DOM 行为**（搜索面板渲染、导航切换、影视态首页网格、
tab 扁平化、autoplay / step4_online 的渲染断言等）：
- 依赖 `innerHTML` -> `children` 回读、按 id `getElementById` 找回产品创建的节点、
  事件冒泡、`IntersectionObserver` 等真实浏览器语义；
- 它们用手写 `vm` mock 试图忠实地重放上述行为，而该 mock **无法桥接**真实 DOM 语义，
  因此在 Node / vm 下必然崩溃或断言失败。

## 与 #6 抽纯层（序7）的关系
经 `git show HEAD:<file>` 取编辑前版本、复制到 `scripts/_audit_*.js` 实跑对照，
**这 6 个脚本在 #6 抽取前即已崩溃 / 失败**——属于预存的 harness 缺陷，与
`online.js -> online-core.js` 抽取（#6-序7, da52d0f）**零因果**。对齐 `-core.js`
加载序的编辑只对 `online_phase2_test.js` / `spacechange_shelf_test.js` /
`t103_integration_test.js` 有益（已并入主线），本目录 6 个脚本不在其列。

## 处置策略
- **保留不删**，待 #3（真机 e2e）在真实 Chromium 环境下验收；
- 在 Node / vm 层不再为它们投入修复（在错误的层浪费时间）。

## 许可的绿闸（canonical）
回归闸门以以下为准，与本项目录无关：
- `test/*-core.test.js`（纯逻辑单测，全绿）；
- `vm.Script` 全量解析 `public/video/*`（语法 / 加载序守门）。

## 文件清单
- autoplay_test.js
- step4_online_test.js
- t103_integration_test.js
- t126_movie_anime_grid_test.js
- t127_pages_test.js
- t128_tab_flat_test.js
