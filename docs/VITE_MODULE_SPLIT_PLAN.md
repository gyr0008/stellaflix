# Vite 真·分文件（Phase 2.1–2.11）切分方案（草稿 · 实证版）

> 状态：**草稿（2026-08-06）**，尚未执行抽取。本文件是 Phase 2.1–2.1 的规划与验收基线，随 2.1 预备分析结论更新。
> 前置：Phase 1（壳+单包）✅ 已落地；Step 2.0（esbuild 构建流水线）✅ 已落地，`music.js` 现为 `src/music/legacy-music.js` 经 esbuild 生成的构建产物。
> 目标：`music.js` 巨石（28,810 行）拆为 `00-state … 10-shell` 真 ES module，并在 Step 2.11 把 `index.html` 切到 `<script type="module">`。

---

## 一、实证基线（2026-08-06 实测）

- `src/music/legacy-music.js` = **28,810 行**；顶层声明 **1,876** 个（含 `async function`；`scripts/verify-music-globals.mjs` 不计 async 故报 1,795）。
- 含 `window.*` 赋值与属性后，全局符号面 ≈ **2,900**（Step 2.1 预备会精确枚举）。
- **源码几乎没有分区横幅**：全文件仅 line 4 `// Global State` 与 line 22885 `/* === 状态切换器 === */` 两处。作者未做结构划分 → 切分必须靠「依赖分析 + 机械验证」而非「按注释搬块」。
- **命名无法自聚类**：顶层符号前 10 大族为 `set(84) / shape(70) / update(68) / apply(51) / is(47) / render(47) / normalize(40) / open(36) / toggle(27) / lyric(32)`——清一色动词型小函数平铺，不按领域前缀。→ 切分按「它操作哪个领域对象」判归属，而非按名字。

---

## 二、目标模块拓扑（提案，00–10，编号可调）

| 模块 | 内容 | 依赖方向 |
|---|---|---|
| `00-state` | Global State 块（line 4 起）+ `stellaflix-*` 持久化 | 被所有人依赖（最底） |
| `01-audio-engine` | 音频上下文/解码/播放：`audio* playback* play* start* idle* beat* schedule* provider qq/kugou/FREE` | ← state |
| `02-equalizer` | `equalizer* FFT_SIZE frequencyData timeDomainData BEAT_FFT_SIZE normalize*` | ← state |
| `03-lyrics` | `lyric*`（解析/同步/容器） | ← state |
| `04-shelf-3d` | `shelf* skull* draw*`（3D 歌单架/舞台/绘制） | ← state |
| `05-custom-source` | `custom* read*`（含刚加的内置音源） | ← state |
| `06-ui-modals` | `open* close* show* make* create* build* bind* toggle* reset* clear* refresh* save* load* collect* cover* home* splash*` | ← state |
| `07-search-home` | `search* home* ensure* render*`（首页 discover/搜索） | ← state |
| `08-fx-visual` | `fx* apply* shape* particle*`（视觉预设/粒子） | ← state |
| `09-video-bridge` | 明确 video/* 契约的全局桥 | 桥接 music↔video |
| `10-shell` | init/事件/空间切换（line 22885 起），启动入口 | 顶层编排 |

---

## 三、安全切分方法论（核心，不能跳）

**不能**在 Step 2.11 一次性切 `type="module"`（会瞬间 2,900 全局全断）。采用「**壳 + 显式全局桥**」：

1. 每个抽出的 module 用 `export` 暴露符号；新增 `src/music/globals-bridge.js`，在启动早期把 **video/* 与内联 `onclick` 仍依赖的符号** `window.X = X` 回填（兼容层）。
2. `legacy-music.js` 先退化为「聚合/桥」：`import` 各 module 再挂 `window`，直到全部迁完。
3. **Step 2.11 才**把 `index.html` 切 `type="module"`；此前 `video/*` 仍是经典 script，靠桥读 `window`。

---

## 四、执行顺序（Step 2.1 → 2.11）

| 步 | 内容 |
|---|---|
| **2.1 预备** | 穷举 `window.*` 暴露集 + 扫描 `video/*` 与 `index.html` 内联 `onclick` 依赖 → 产出「**禁止改名/禁止删除**」清单（最高风险集） |
| 2.2 | 抽 `00-state`（Global State 块） |
| 2.3 | 抽叶子模块 `02-equalizer` / `03-lyrics`（跨依赖最少，先练手） |
| 2.4 | 抽 `01-audio-engine` |
| 2.5 | 抽 `04-shelf-3d` / `08-fx-visual`（粒子/3D/视觉） |
| 2.6 | 抽 `05-custom-source`（含内置音源） |
| 2.7 | 抽 `06-ui-modals` / `07-search-home` |
| 2.8 | 抽 `09-video-bridge`（钉死 video 契约） |
| 2.9 | 抽 `10-shell`（init/空间切换） |
| 2.10 | `legacy-music.js` 退化为纯桥，逻辑清零 |
| 2.11 | `index.html` 切 `type="module"`，视情况删/留最小桥 |

---

## 五、每步验收闸门

- **静态**：扩展 `scripts/verify-music-globals.mjs`，额外断言「video/* 引用的符号 + 内联 `onclick` 符号」在产物 `window` 上仍可解析。
- **动态（强制）**：**每步必须 Electron 实机冒烟**——静态分析 2,900 全局不可靠；须确认音乐/3D/歌词/粒子/双态 + 影视态搜索/详情不回归。

---

## 六、量级与风险

- 量级：1,876 顶层 + ~1,000 `window` 赋值，逐函数判归属，是 **15+ 步大工程**；建议把「提取-验证」循环存成可复用 **skill**。
- 头号风险：`video/*` 与内联 `onclick` 对全局的**隐式**依赖（2.1 预备要穷举）。
- 头号收益前提：Phase 1+2.0 已解决可维护/首屏/缓存；**真 module + 懒加载（影视态不加载音乐首屏）才是最大运行时收益**——建议先确认这是瓶颈（Electron 实机启动耗时对比）。

---

## 七、2.1 预备结论（2026-08-06 实测 · 已生成）

### 7.1 全局暴露机制真相（致命新发现，推翻「需回填 ~1900 个」假设）

- `window/globalThis` **显式赋值仅 3 个**：`__mineradioPerf`、`__mineradioPerfSnapshot`、`scheduleShelfRebuild`。
- 其余 **~1,865 个全局靠「经典 script 顶层声明天然挂 `window`」** 暴露，并非 `window.X = X` 显式赋值。
- **含义**：迁移到 ESM 后，桥接层（`globals-bridge.js`）**只需回填仍被 `video/*` 与内联 `onclick` 依赖的符号（≈ 143 个）**，而非全部 ~1,900 个。桥接工作量从「近 2000」降到「约 200 量级」——这是本次预备分析最大的减负结论。

### 7.2 内联 `onclick` 裸全局集（106 个，`type="module"` 切换前最高风险）

内联事件处理器无法访问 module 作用域，这 106 个名字是 `type="module"` 切换前必须保留在 `window` 上的最高风险集。

- **已知伪阳性（方法调用，已 `grep` 核实，桥接 `typeof` 守卫会自动跳过）**：`click`(3× `.click()`)、`remove`(1× `.remove()`)、`getElementById`(8× 全为 `document.getElementById`)、`stopPropagation`(4× `.stopPropagation()`)。外加 `setSpace`/`toggleSearchPage` 在个别 `onclick` 中出现为 `StellaflixVideo.state.setSpace` / `SFV.online.toggleSearchPage` 方法调用，但脚本无 `.` 前看故计入——桥接同样用 `typeof` 守卫安全处理。
- **工程结论**：桥接层采取「防御性全量回填」——把 106 个名字**全部** `if (typeof X !== 'undefined') window.X = X`，过度包含零成本，遗漏即内联处理器全断。故「禁止改名 / 禁止删除」清单至少覆盖这 106 个。

```
_sfvTryToggleSearch, applyHomePosterCurrentCover, cancelHomePosterQuoteEdit, cancelLocalBeatAnalysis,
clearCustomBackgroundImage, clearCustomCoverForCurrent, clearQueue, click, closeCollectModal, closeColorLab,
closeCoverColorPicker, closeCoverCropModal, closeCustomLyricModal, closeCustomSourceModal, closeLocalBeatModal,
closeLoginModal, closeMiniQueue, closeSourceFallbackNotice, closeTrackDetailModal, closeUpdatePanel, closeUploadTip,
closeUserModal, closeVisualGuide, commitCoverCrop, createPlaylistFromCollect, cyclePlayMode, deactivateCustomSource,
deleteCustomLyricForCurrent, editHomePosterQuote, enableDualAccountView, getElementById, goHome, handleLyricGlowRowClick,
importCustomSource, loadBundledSources, logoutActiveAccount, nextTrack, nextVisualGuideStep, onUserBtnClick,
openCollectModalForCurrent, openCoverColorPicker, openCustomSourceModal, openHomeLibrary, openHomePlayerConsole,
openProviderLogin, openProviderWebLogin, openTrackDetailModal, openUpdatePanel, pickCoverColorFromArt, playHomeRecent,
playHomeSong, prevTrack, refreshQr, refreshUserPlaylists, remove, requestDualLoginMode, resetCustomBackgroundColor,
resetFx, resetHomeAccentColor, resetHomeIconColor, resetHomePoster, resetShelfAccentColor, resetUiAccentColor,
resetVisualIconColor, resetVisualTintColor, saveCustomLyricForCurrent, saveHomePosterQuote, selectLocalBeatMode,
setActiveAccountProvider, setLoginProvider, setLyricColorAuto, setLyricFont, setLyricHighlightAuto, setLyricSourceMode,
setPlaybackQuality, setSearchMode, setSpace, showLoginModal, shuffleQueue, skipLoginAndFocusSearch, startLocalBeatAnalysis,
startUpdatePreviewDownload, startVisualGuide, stopPropagation, submitQQCookieLogin, switchPlaylistTab, toggle,
toggleControlsAutoHide, toggleDiyMode, toggleEqualizerPanel, toggleFullscreen, toggleFx, toggleFxFabAutoHide,
toggleImmersiveMode, toggleLikeCurrent, toggleLyricGlowLink, toggleLyricsPanel, toggleMiniQueue, togglePlay,
togglePlaylistPanelPinned, toggleQQCookiePanel, toggleQualityPanel, toggleSearchPage, toggleStartSpace,
toggleUserCapsuleAutoHide, toggleVolumePanel
```

### 7.3 `video/*` + index.html 引用的顶层名（135 个）

`video/*.js` 与 `index.html` 共引用 135 个 `music.js` 顶层符号；引用最广的（文件数）：`fx(5) / goHome(4) / audio(3) / playlist(2) / scene(2) / camera(2) / vs(2) / fs(2)` 等。

- **重点风险**：含 Three.js 短名 `fx / audio / scene / camera / vs / fs / bass / renderer / orbit / material`——名字极短且通用，**易与导入符号撞名**，桥接与拆分子模块时必须显式保留或显式 `export` 重命名，禁止随意改名。

### 7.4 禁止改名 / 禁止删除 / 必须保留在 `window` 全集（143 = 并集）

`106 内联 onclick ∪ 135 video/* 引用`，重叠 98，并集 **143** 个。这是 Phase 2.2–2.11 全部抽取步骤的「硬约束集」——任一改名或删除（含从 `window` 摘掉）都可能导致隐形断链。

```
_sfvTryToggleSearch, applyHomePosterCurrentCover, audio, bass, bindFxPanel, camera,
cancelHomePosterQuoteEdit, cancelLocalBeatAnalysis, clearCustomBackgroundImage, clearCustomCoverForCurrent,
clearQueue, clearSearchHistory, click, closeCollectModal, closeColorLab, closeCoverColorPicker,
closeCoverCropModal, closeCustomLyricModal, closeCustomSourceModal, closeLocalBeatModal, closeLoginModal,
closeMiniQueue, closeSourceFallbackNotice, closeTrackDetailModal, closeUpdatePanel, closeUploadTip,
closeUserModal, closeVisualGuide, commitCoverCrop, createPlaylistFromCollect, cyclePlayMode,
deactivateCustomSource, deleteCustomLyricForCurrent, doSearch, editHomePosterQuote, enableDualAccountView,
escHtml, fs, fx, getElementById, goHome, handleHomePosterQuoteKey, handleLyricGlowRowClick, hexToRgb,
hideCoverColorLoupe, homePosterState, immersiveMode, importCustomSource, loadBundledSources, logoutActiveAccount,
lyricColorPresets, material, moveCoverColorLoupe, nextTrack, nextVisualGuideStep, onUserBtnClick,
openCollectModalForCurrent, openCoverColorPicker, openCustomSourceModal, openHomeLibrary, openHomePlayerConsole,
openProviderLogin, openProviderWebLogin, openTrackDetailModal, openUpdatePanel, orbit, organizeFxPanel,
pickCoverColorFromArt, playHomeRecent, playHomeSong, playlist, prevTrack, readHomePosterImageFile,
refreshQr, refreshUserPlaylists, regions, remove, renderHomeDiscover, renderHomePersonalPoster,
renderHomeTiles, renderer, requestDualLoginMode, resetCustomBackgroundColor, resetFx, resetHomeAccentColor,
resetHomeIconColor, resetHomePoster, resetShelfAccentColor, resetUiAccentColor, resetVisualIconColor,
resetVisualTintColor, safePlaybackStep, saveCustomLyricForCurrent, saveHomePosterQuote, scene,
scheduleShelfRebuild, searchMode, selectLocalBeatMode, setActiveAccountProvider, setFxPanelTab,
setLoginProvider, setLyricColorAuto, setLyricFont, setLyricHighlightAuto, setLyricSourceMode, setPlayIcon,
setPlaybackQuality, setSearchMode, setSpace, setVisualTintCustom, setVolume, shelfManager, showLoginModal,
showToast, shuffleQueue, skipLoginAndFocusSearch, startLocalBeatAnalysis, startUpdatePreviewDownload,
startVisualGuide, stopPropagation, submitQQCookieLogin, switchPlaylistTab, toggle, toggleControlsAutoHide,
toggleDiyMode, toggleEqualizerPanel, toggleFullscreen, toggleFx, toggleFxFabAutoHide, toggleImmersiveMode,
toggleLikeCurrent, toggleLyricGlowLink, toggleLyricsPanel, toggleMiniQueue, togglePlay,
togglePlaylistPanelPinned, toggleQQCookiePanel, toggleQualityPanel, toggleSearchPage, toggleStartSpace,
toggleUserCapsuleAutoHide, toggleVolumePanel, vs
```

### 7.5 下一步（衔接第四节执行顺序）

- 2.2 起按第四节顺序抽取；桥接层 `src/music/globals-bridge.js` 用 `if (typeof X !== 'undefined') window.X = X` 回填上述 **143**（自动跳过 4 个方法调用伪阳性 `click/remove/getElementById/stopPropagation`）。
- **验收闸门**：扩展 `scripts/verify-music-globals.mjs`，额外断言「这 143 个名字」在产物 `window` 上仍可解析；**每步强制 Electron 实机冒烟**（音乐/3D/歌词/粒子/双态 + 影视态搜索/详情不回归）。
- 抽取时凡触及 7.4 名单内符号的改名/删除，一律先评估桥接层与 `video/*` 引用点，禁止静默改动。

---

## 八、待办

- [x] 起草模块拓扑与方法论（本文件 §二–§六）
- [x] **2.1 预备**：穷举 `window.*` 暴露集 + `video/*` + 内联 `onclick` 依赖，产出 §七「禁止改名/删除全集（143）」
- [x] **2.2 原位重排 00-state 边界**（经典脚本语义, 函数提升使调用点不变, 运行语义零变化; 见 §九）
- [x] **2.3 立桥 + 钉 equalizer/lyrics 边界（方案 A，2026-08-07 已交付，见 §十）**
- [x] **2.4 真抽取 02-equalizer 胶水（经典脚本分离 · 地基就位，2026-08-07 已交付，见 §十一）**
- [ ] **2.5 下一物理抽取 = 04-shelf-3d + 08-fx-visual + 共享 THREE 宿主（同一协调单元，体量最大/最险）**；**03-lyrics 在此单元内一并整体迁出**（用户拍板：lyrics THREE 重依赖，须随宿主整体迁，不拆纯逻辑叶子——见 §十二）；**01-audio-engine 仍最后**（最耦合，待本单元稳定后再动）

---

## 九、2.2 执行记录（原位重排 00-state，2026-08-06 已交付）

**决策**：用户选「原位重排(最低风险)」而非真分文件/懒初始化；理由：函数声明提升(hoist)使状态块 eager 调用点(line 86-214)不变，重排仅改函数定义位置、运行语义零变化。

**做法**：新增 `scripts/reorder-00state.mjs`（字符级括号匹配扫描器，正确处理 字符串/模板/注释/正则，从已知起始行号提取函数文本；esprima 在 line 7104 遇不支持语法故弃用）。将状态块(line 4-216) eager 调用的 10 个深层 loader 定义上移至 `loadEqualizerState`(217) 之前，加 `00-state region` 边界横幅。`loadEqualizerState/saveEqualizerState/scheduleEqualizerSave` 本就紧邻，保留。

**移动的函数(10)**：readDiyModePreference / readLocalBeatPrefs / readLocalBeatMapCache / readPlaybackQualityPreference / readCustomCoverMap / readHomePosterState / loadListenStatsState / readCustomLyricMap / readCustomLyricPrefs / loadPlaylistDetailSortMode。

**验证**：`node --check` ✅；esbuild 构建产物 905.5kb ✅；`scripts/verify-music-globals.mjs` 1795 顶层标识符零破坏且无 IIFE ✅；`test:video` 185-0 全绿 ✅。

**结论**：00-state 边界在单文件内已真实成立（状态+11 loader 紧邻），为后续 2.3+ 真抽取/懒初始化奠定无依赖叶。重排不依赖 ESM，Step 2.11 前保持经典脚本语义。

---

## 十、2.3 执行记录（立桥 + 钉 equalizer/lyrics 边界，2026-08-07 已交付）

### 10.1 决策回顾（用户已拍板）

- **方向**：选「**方案 A 先立桥 + 边界**」而非真物理搬迁散落代码——低风险、纯增量，是 2.4–2.11 的基石。
- **桥加载方式**：选「**index.html 独立经典 `<script>`**」——零构建改动，最稳。
- **根因（为何不宜原位整块重排）**：equalizer 跨 **3 个不连续区**（state 7–347 / UI 13195–13358 / audio-graph 16430–16507，跨度 ~16k 行）；lyrics 跨 **≥20 区**（21 → 28544）。源码几乎无分区横幅，构建不打包（esbuild 无 `--bundle`），不能像 2.2 那样原位移块。故先立桥 + 加区域横幅钉边界，真正物理搬迁推到 2.4+。

### 10.2 交付物（已落地）

| 文件 | 改动 |
|---|---|
| `src/music/globals-bridge.js` | **新建**：IIFE 桥，143 名 `typeof` 守卫回填（§七.4 全集单一真相源） |
| `package.json:24` | `build:music` 追加 `&& esbuild src/music/globals-bridge.js --minify … --outfile=public/assets/globals-bridge.js` |
| `public/index.html:3216` | 在 `music.js`(3215) 后插 `<script src="/assets/globals-bridge.js"></script>` |
| `scripts/verify-music-globals.mjs` | 扩展 **143 名校验**：从 `globals-bridge.js` 抽取 `KEEP`；合并 music+index+video 源码；逐名查顶层定义（`async function`/对象属性 `NAME:`/`window\|global.NAME =`）；`PSEUDO` 跳 6 个方法伪阳性（`click/getElementById/remove/stopPropagation/toggle/setSpace`） |
| `src/music/legacy-music.js` | 6 处 equalizer/lyrics 区域横幅（零运行时影响，仅定位锚） |

### 10.3 equalizer 符号归属清单（拟归 `02-equalizer`）

- **归本模块（不在 143，无共享冲突）**：`equalizerFilters` / `equalizerHeadroom` / `equalizerLimiter` / `equalizerAudioSupported` / `equalizerState` / `equalizerSaveTimer` / `formatEqualizerFrequency` / `formatEqualizerGain` / `renderEqualizerBands` / `updateEqualizerUi` / `setEqualizerEnabled` / `setEqualizerBand` / `setEqualizerAudioParam` / `applyEqualizerAudioStateToGraph` / `applyEqualizerAudioState`。
- **落 143 集（须保留 `window`）**：`toggleEqualizerPanel`（内联 `onclick` 绑定）。
- **共享依赖（非本模块所有，须 import/暴露）**：`audio`（音频图宿主）、`bass`（低音增益）、**`MineradioEqualizer`（外部 `public/equalizer-core.js`，已独立加载，见 §10.5）**。

> 边界结论：2.3 阶段 equalizer 真正要抽的只是「**UI 控制 + 音频图胶水**」（~400 行），核心数学已外置。

### 10.4 lyrics 符号归属清单（拟归 `03-lyrics`）

- **归本模块（不在 143，但重依赖 `THREE`）**：`lyricSun*` 状态簇、`lyricsLines`/`lyricsVisible`/`lyricsHasNativeKaraoke`/`lyricsTimingSource`、`lyricSourceMode`、`stageLyrics`、`lyricSun*Color` 等 `THREE` 对象、`lyricCameraLockFit`、`lyricsParticles`/`lyricsGeo`/`lyricsAttr*`、`readSavedLyricLayout`、`lyricFont*`/`lyricLetterSpacingPx`/`lyricLineHeightFactor`/`lyricMeasureText`/`lyricFillText`/`lyricStrokeText`、`lyricPaletteFromHex`/`lyricTextPaletteFromHsl`/`lyricThreeColor`、`lyricSunBloomTexture`、`buildLyricMesh`、`lyricTagTimeToSeconds`、`renderLyrics`、`updateLyricsHighlight`、`buildLyricColorControls`、`pushDesktopLyricsState`。
- **落 143 集（须保留 `window`）**：`toggleLyricsPanel`（`onclick`）、`lyricColorPresets`。另 `setLyricColorAuto`/`setLyricFont`/`setLyricHighlightAuto`/`setLyricSourceMode` 也在 143——属「歌词颜色/字体控制台」表面，边界与 `06-ui-modals` 重叠，2.3 标记为「歌词相关但归 06 边界」，物理搬迁时归 06。
- **共享依赖（非本模块所有，须 import/暴露）**：`THREE`（重，所有 `Vector3/Color/Quaternion/Euler/Texture/Geometry/Material`）、`audio`（节拍能量驱动 `lyricSun*`）、`scene`/`camera`/`renderer`（3D 歌词舞台，俱在 143）。

> 边界结论：lyrics 因 `THREE` 重依赖，物理搬迁须整体随 **`08-fx-visual` / `04-shelf-3d` 的 `THREE` 宿主**一起迁，不能单独 early-extract。

### 10.5 `MineradioEqualizer` 定位结论（重要修正 · 原「硬点」警报解除）

- **grep 全仓 `.js`**：定义在 **`public/equalizer-core.js:4`** `if (root) root.MineradioEqualizer = api;`，由 **`public/index.html:39`** `<script src="equalizer-core.js"></script>` 在 `music.js` 之前**独立加载**。
- `legacy-music.js` **仅引用、无声明**（329/331/13210/13235/13269/13271/13290/13298/13306/13315/16445–16481 等），原 summary 猜「在 index.html 或更后段」被证伪——它本就是**已独立封装的经典脚本模块**。
- **含义 / 风险降级**：
  1. equalizer 核心引擎（`defaultState/normalizeState/gainsForState/applyPreset/updateBand/reset/setEnabled/BAND_FREQUENCIES/PRESETS/calculateHeadroomDb/shouldEnableLimiter`）已是干净独立模块；2.3 要抽的 equalizer 实为 UI+音频图胶水（~400 行）。
  2. `MineradioEqualizer` **不在 143 集**（video/* 与 onclick 均不依赖），且**先于 `music.js` 加载** → Step 2.11 切 `module` 后它仍由 `index.html` 独立经典 script 加载，**无时序断链风险**。原 summary 标记的「2.4 前须查清的时序硬点」**已解除**。

### 10.6 桥落地结论

- **机制**：经典脚本下 `globals-bridge.js` 为**前向兼容冗余回填**（no-op，rebound≈143、skipped≈0，skipped 恰为方法伪阳性+视频侧符号）；ESM 下作**兜底**，确保漏导出关键名在 `video/*` 使用前暴露为 `undefined` 便于早现断链。
- **加载**：`index.html` 中 `music.js`(3215) → `globals-bridge.js`(3216)，零构建改动。
- **构建**：`build:music` 现产出 `music.js`(905.5kb) + `globals-bridge.js`(3.0kb)。
- **验收闸门**：`verify-music-globals.mjs` 单一真相源从 `KEEP` 抽取 143 名，扫描合并源码，覆盖 `async function`/对象属性/`window|global.` 赋值，跳 6 伪阳性。

### 10.7 验收（全绿，无回归）

- `node --check`（globals-bridge.js + legacy-music.js）✅
- `build:music`（music.js 905.5kb + globals-bridge.js 3.0kb）✅
- `verify-music-globals`（1795 顶层零破坏无 IIFE + 143 关键全局校验通过，跳过 6 伪阳性）✅
- `test:video`（Bridge 24/0 + online wiring 12/0，全退出 0）✅

### 10.8 结论

2.3 以「方案 A」低风险落地：桥接层就位、equalizer/lyrics 边界用横幅钉死、143 硬约束集接入静态闸门。真正物理抽取推到 2.4+：equalizer 仅需搬 UI+音频图胶水 ~400 行；lyrics 须随 `THREE` 宿主（04/08）整体迁。`MineradioEqualizer` 外置且独立于 143，时序风险已解除。重排不依赖 ESM，Step 2.11 前保持经典脚本语义。

---

## 十一、2.4 执行记录（真抽取 02-equalizer 胶水 · 经典脚本分离，2026-08-07 已交付）

### 11.1 决策回顾（用户已拍板）
- **路由**：选「**先打地基 + 抽叶子**」而非按 §四 原序抽 `01-audio-engine`——地基（经典脚本分离范式）先于重耦合模块，风险最低。
- **首批叶子**：选「**先抽 equalizer 胶水**」（~305 行，依赖最少，仅 `MineradioEqualizer` + 运行时 `audioCtx/analyser`）。
- **地基范式（关键）**：**经典脚本分离**，NOT esbuild `--bundle`。原因见 §11.4。

### 11.2 交付物（已落地）

| 文件 | 改动 |
|---|---|
| `src/music/02-equalizer-glue.js` | **新建**：经典脚本（无 import/export），含 equalizer 状态(7 vars) + UI 控制块 + 音频图块（共 23 顶层符号），顶层 var/function 天然挂 `window` |
| `src/music/legacy-music.js` | 剔除 5 段 equalizer 代码（行 7–10 / 213–215 / 327–346 / 13197–13389 / 16433–16517），28,897 → 28,590 行；折叠抽走后空隙 |
| `public/index.html:40` | 在 `equalizer-core.js`(39) 后插 `<script src="/assets/02-equalizer-glue.js"></script>`（早于 `music.js` 3215）；保证 `MineradioEqualizer` 就绪 + 胶水 eager `equalizerState=loadEqualizerState()` 可解析 |
| `package.json:24` | `build:music` 追加 `&& esbuild src/music/02-equalizer-glue.js --minify --legal-comments=none --outfile=public/assets/02-equalizer-glue.js`（经典，无 `--bundle`） |
| `public/assets/02-equalizer-glue.js` | **新建构建产物**（8.3kb，经典，非 IIFE） |
| `scripts/verify-music-globals.mjs` | 143 网关扩展：合并扫描新增 `src/music/*.js`（胶水顶层符号 `toggleEqualizerPanel` 等迁走后仍被校验） |
| `test/equalizer/app-wiring.test.js` | 适配：读 `02-equalizer-glue.js`；equalizer 三块（状态/UI/音频图）从 glue 切片；`audioFunctionsSource` 重建为「glue 音频图块 + legacy 的 `initAudio…resumeAudioAnalysis` 段」 |

### 11.3 抽取机制（一次性脚本 + 边界断言，可恢复）
- 用 `_extract_eq.mjs`（已清场）按 5 段已审计行范围机械抽取，带边界断言（行 7/10/213/215/346/13389/16517 正则匹配），不匹配即 `process.exit(1)` 中止——比手贴 305 行更可靠。
- 恢复路径：提交 `8994fb2` + 外部 zip 备份（工作树即真相源）。

### 11.4 关键发现：esbuild `--bundle` 陷阱（重申，地基铁律）
- 实验证伪：对经典脚本启用 `--bundle` 会把产物**包裹成 `(()=>{...})()` 且 tree-shake 掉全部 1795 个顶层全局**（无跨模块 import → 死代码消除）→ 直接摧毁整个全局 API 面，video/* 与内联 onclick 全断。
- **结论**：2.4「打地基」= **经典脚本分离**（对标已存在的 `public/equalizer-core.js`），NOT `--bundle`。各 module 经典脚本挂 `window`，顶层 var/function 全局语义不变；仅改变加载顺序。待全部 module 抽完、符号显式 export/import 后再议 `--bundle`/ESM。

### 11.5 加载顺序语义（为何安全）
- 抽取后胶水为经典脚本，顶层 `var/function` 仍挂 `window`，与留在 `legacy-music.js` 时**全局可见性零变化**。
- 唯一实质变化=加载序：`equalizer-core.js`(39) → **glue(40)** → … → `music.js`(3215)。胶水 eager `equalizerState=loadEqualizerState()`（glue L12）依赖 `MineradioEqualizer`（core 已先于 glue 加载）✅；`music.js` 对 equalizer 函数的运行时引用在 glue 加载后均可得 ✅。

### 11.6 验收（全绿，无回归）
- `node --check`（glue + legacy）✅
- `build:music`（music.js 重生成 + globals-bridge.js 3.0kb + 02-equalizer-glue.js 8.3kb）✅；胶水产物 `OK_NOT_WRAPPED`（非 IIFE）✅
- `verify-music-globals`：原始 **1768** 顶层声明零破坏（较 1795 少 23 = 合法迁出的 equalizer 名，自身一致）+ 无 IIFE + **143 关键全局校验通过**（跳 6 伪阳性）✅
- `test:video`：**185/0**（基线维持）✅
- `test:equalizer`：**39/0**（抽取初 1 文件级失败 + 9 `initAudio` 失败，源于测试源码切片标记迁至 glue，已修）✅
- `test:lyrics`：12/0 ✅；`test:custom-source`：49/0 ✅

### 11.7 结论
equalizer 是干净叶子，经典脚本分离范式已验证可行：胶水 311 行（305 抽取）、`legacy-music.js` 减至 28,590 行、运行时全局面零变化。`--bundle` 陷阱已用实验证伪并避开。下一步：**03-lyrics**（THREE 重依赖，须随 04/08 的 THREE 宿主整体迁）；**01-audio-engine 延后**（耦合最高、回归风险最大）。每步仍走「审计行范围 → 边界断言抽取 → 改 verify + 测试 → 四闸门」。

### 11.8 下一步
- 03-lyrics：依赖 `THREE`/`scene`/`camera`/`renderer`/`audio`，物理搬迁须与 `04-shelf-3d` / `08-fx-visual` 的 THREE 宿主协同；先做依赖图，确认能否独立 early-extract 或必须捆绑迁。
- 01-audio-engine：最后抽（最耦合），待管线证明稳定后再动。

---

## 十二、03-lyrics 依赖审计与搬迁决策（2026-08-07）

### 12.1 审计目标
回答 §11.8 提出的问题：**lyrics 能否作为干净叶子 early-extract（像 equalizer 那样），还是必须随 04/08 的 THREE 宿主捆绑迁？** 结论前置：用户已拍板「THREE 重依赖，物理搬迁须随 04/08 THREE 宿主整体迁」——本审计用证据确认该决策，并量化「纯逻辑桶」与「THREE 耦合桶」的拆分边界，供 04/08 里程碑一次性整体搬迁时参考。

### 12.2 THREE 宿主所有权确认（已证实）
- `scene`/`camera`/`renderer` 宿主根声明在 `legacy-music.js` **1184 / 1186 / 1238**（均为 `new THREE.*`）。
- `THREE.` 全文件出现 **241 次**，分布于以下连续区域（非 lyrics 独占）：
  - 1184–1324：宿主 + free-camera（**04/08 根**）
  - 2964–3310：FX 粒子/ripple/cover 纹理（**08**）
  - 3825–4380：FX bloom/float/skull 相机（**08**）
  - 4539–4607：FX 背景 cover group（**08**）
  - **4705–4876：lyric 太阳色 + `stageLyrics.group` + lyric 星河粒子（lyrics 3D 舞台）**
  - **6015–6538：lyric 太阳辉光纹理 + `buildLyricMesh` + 文字 mesh + sparks（lyrics 3D 舞台）**
  - 10975–12576：shelf-3d 卡片 mesh/connector/floor-mirror（**04**）
  - 12642：raycaster（**08**）
  - 19731–20088：custom-shape group（**08**）
- 结论：`scene`/`camera`/`renderer` 是 04/08 的宿主根，lyrics 的 3D 舞台（4670–6540 两段）只是 **THREE 宿主的消费者之一**，与 04/08 共用同一 `scene`/`camera`/`renderer` 与 THREE scratch buffer（`lyricCameraDir` 等 4707–4719 区）。

### 12.3 lyrics 符号分区（按是否触碰 THREE）
全量枚举 lyric 命名函数 **~135 个**，按 `THREE.` 耦合度二分：

**A. THREE 耦合桶（≈30 个，必须随宿主迁）—— 4670–6984 / 2564–2581 区：**
`setStageLyricViewBasisFromCameraOrQuaternion`(4721) `applyStageLyricLayoutOffset`(4739) `stageLyricTargetQuaternion`(4745) `getStageLyricLockBounds`(4750) `lyricCameraLockFit`(4763) `createLyricsParticles`(4789) `ensureLyricStarRiver`(4800) `updateLyricStarRiver`(4885) `disposeLyricMesh`(4915) `applyLyricPaletteToMesh`(5883) `setStageLyricPalette`(5926) `updateLyricPaletteFromCover`(5961) `lyricThreeColor`(6037) `makeLyricReadabilityTexture`(6104) `makeLyricGlowTexture`(6179) `getLyricSunBloomTexture`(6286) `makeLyricShaderMaterial`(6348) `buildLyricMesh`(6392) `buildNextLyricMesh`(6521) `updateLyricMeshProgress`(6551) `clearStageNextLyric`(6602) `refreshCurrentLyricStyle`(6609) `clearStageLyrics`(6618) `updateStageLyrics3D`(6627) `tickLyricsParticles`(6951) `disposeLyricsParticles`(6984) `shouldUseWallpaperLyricCameraLock`(2564) `requestStageLyricCameraSnap`(2567) `shouldAvoidStageLyricsForShelf`(2581)；外加 THREE scratch 变量 `lyricSunColor`(4705,`THREE.Color`) + `lyricCamera*`/`lyricLayout*`/`lyricBase*`/`lyricTilt*`/`lyricTarget*`(4707–4719)。

**B. 纯逻辑桶（≈105 个，不触碰 THREE）—— 解析/状态/自定义源/桌面同步/字体颜色/DOM 控件：**
- 解析：`parseLyricText`(17763) `finalizeLyricLineDurations`(17752) `lyricTagTimeToSeconds`(17747) `wrapLyricText`(5991) `makeLyricMask`(6052) `lyricMeasureText`/`lyricFillText`/`lyricStrokeText`(5318/5344/5347，仅 2D canvas)
- 状态/源：`setOriginalLyricsState` `applyLyricsState` `applyOriginalLyricsState` `parseCustomLyricText` `applyCustomLyricState` `preferredLyricSourceForSong` `applyPreferredLyricsForCurrent` `setLyricSourceMode` `cloneLyricLine(s)` `currentLyricSong` `getCustomLyricEntry` `hasCustomLyricForSong` `readCustomLyricMap` `readCustomLyricPrefs` `saveCustomLyricMap` `saveCustomLyricPrefs` `songCustomLyricKey` `updateCustomLyricControls` `setCustomLyricStatus` `open/closeCustomLyricModal` `save/deleteCustomLyricForCurrent` `fetchLyric`(17676,网络)
- 调色板（纯 JS，喂给 B 桶的 `applyLyricPaletteToMesh`）：`lyricPaletteFromHex`(5825) `silverBlueLyricPalette`(5847) `effectiveLyricPalette`(5901) `lyricTextPaletteFromHsl`(5934) `setLyricSparkOpacity/Size/Color`(5856/5867/5878) `applySavedLyricPaletteState`(20410)
- 字体/布局：`normalizeLyricFontKey` `lyricFontStackForKey` `lyricFontWeightValue` `lyricFontCss` `lyricLetterSpacingPx` `lyricLineHeightFactor` `packagedDefaultLyricLayoutRaw` `readSavedLyricLayout` `saveLyricLayout` `normalizeDesktopLyricsFps`
- 桌面同步（纯 JS，读 `lyricsLines`）：`currentDesktopLyricSnapshot` `desktopLyricsMotionPayload` `desktopLyricsPlaybackPayload` `desktopLyricsActiveBeatMap` `desktopLyricsBeatMapPayload` `notifyDesktopLyricsBeatMapReady` `desktopLyricsPushInterval` `desktopLyricsPayload` `pushDesktopLyricsState`(27761) `applyDesktopLyricsState`(27775) `normalizeDesktopLyricText`
- DOM 控件/面板：`renderLyrics`(17811) `toggleLyricsPanel`(17815) `buildLyricColorControls` `updateLyricColorControls` `updateLyricHighlightControls` `updateLyricGlowControls` `updateLyricFontControls` `setLyricFont` `setLyricGlowLinked` `toggleLyricGlowLink` `handleLyricGlowRowClick` `setLyricGlowCustom` `setLyricColorAuto/Custom/Preset` `setLyricHighlightAuto/Custom` `updateDesktopLyricsFpsControls` `ensureLyricPrimaryControls` `setParticleLyricsSilently` `updateLyricsHighlight`(空 stub)
- 共享状态变量：`lyricsLines`/`lyricsVisible`(23) `lyricSun*` 能量(17) `lyricsHasNativeKaraoke`/`lyricsTimingSource`(23)

### 12.4 关键发现：纯逻辑桶「技术可抽」但「决策不抽」
- **技术上可行**：B 桶 ~105 个函数全部不碰 `THREE`，且当前已全部挂在 `window`（经典脚本语义）。若仿 equalizer 经典脚本分离，可独立成一叶子——它只通过 `window.lyricsLines`/`lyricsVisible`/palette 全局与 A 桶交换状态，而全局本就在 window 上，无需改引用。
- **但决策覆盖可行性**：用户已拍板 lyrics 随 THREE 宿主整体迁。理由三层：
  1. **特性内聚**：lyrics 是一条完整链路（解析→状态→调色板→3D 舞台→桌面同步）。把 B 桶抽走、A 桶残留 legacy，会在「同一特性」上制造人为跨模块 seams，违背 Vite 切分「清晰模块归属」初衷。
  2. **宿主未就绪**：`scene`/`camera`/`renderer` + 全部 241 处 `THREE.` 属 04/08，至今未抽。现在抽 B 桶要么仍靠 window 引用宿主全局（那 lyrics 仍跨两处），要么倒逼提前抽 THREE 宿主（最大/最险模块）——两头都不划算。
  3. **风险排序**：地基优先纪律下，THREE 宿主（04/08）是 equalizer 与 lyrics 共同悬挂的基石；先做 lyrics 再后抽宿主会倒置顺序、引发返工。

### 12.5 决策（落实用户路由）
- **03-lyrics 不在本轮 early-extract**，即便纯逻辑桶技术可抽也不拆。整个 lyrics 模块（A+B 桶 + 共享状态）**作为 04/08 THREE 宿主抽取单元的同一批**整体迁出 legacy。
- 本轮（2.5 之前）**不再动 lyrics 物理代码**；保留 §10.3/§10.4 的符号归属清单作为 04/08 里程碑的搬迁依据。
- 验收闸门不变：任何后续抽取仍走「审计行范围 → 边界断言抽取 → 改 verify + 测试 → 四闸门」，且 `lyricsLines`/`lyricsVisible` 等共享全局必须留在 143 全集（§7.4）。

### 12.6 下一步排序
- **下一物理抽取 = 04-shelf-3d + 08-fx-visual + 共享 THREE 宿主（作为同一协调单元）**；03-lyrics 在此单元内一并迁出。这是体量最大、风险最高的地基件，须一次性抽到干净边界。
- 01-audio-engine 仍最后（最耦合），待 04/08+lyrics 单元稳定后再动。

---

## 十三、04/08 THREE 宿主边界审计（2026-08-07）

### 13.1 审计目标
为「04-shelf-3d + 08-fx-visual + 共享 THREE 宿主（+03 lyrics 同批）」抽取做边界地图与可行性判定。结论前置：**animate() 是全域枢纽（ROOT 编排器），host 先行抽取可形成正确的「宿主→叶子」架构，且 08/04/03 可逐个迁出而不必改 animate()**。

### 13.2 模块边界（精确行范围 · 实测）
| 模块 | 根声明 / 横幅 | 关键函数/对象 | 行范围 |
|---|---|---|---|
| **01 音频引擎（延后）** | `var audio,audioCtx,source,analyser,beatAnalyser,gainNode,audioReady` @**6**；FFT 缓冲 @10-15；beatmap 状态 @502-516；scheduledBeat* @10099-10100 | `processRealtimeBeatEngine`@1856 `scheduleBeatCamera`@2080 `tickBeatMap`@10060 `resumeAudioAnalysis`；音频初始化 `audioCtx=new AudioContext`@16215 `analyser=…createAnalyser`@16217 | 6 / 1856 / 10060 / 16215 |
| **03 lyrics** | B 纯逻辑桶 @289-27775 散落；A THREE 舞台 @4705-4876 + 6015-6538 | `tickLyricsParticles`@6951 `updateStageLyrics3D`@6627；`lyricSun*`能量@17 `lyricSunColor`@4705(THREE.Color) `lyricCamera*`/`lyricLayout*`@4707-4719 | 4705-4876 / 6015-6538 |
| **04 shelf-3d** | `// 3D 歌单架` @**10405**；`shelfManager`@**10411**(null) | 卡片 mesh 构造 @10975-12576；`// 3D 卡片交互`@12633 `// stage 模式`@12806；`shouldDimWallpaperForShelf`@2571 | 10405-12809 |
| **08 fx-visual** | `// fx 状态` @**657**；`fxDefaults`@658；`fx`@846 | `uniforms`@3274 `mouseWorld`/`mouseActive`@2964/2965 `updateParticlePointerFrame`@3021 `bloomParticles`/`particles`/`floatGroup`@3857/3861/3872 `SKULL_PRESET_INDEX`@3990 `applySkullCameraPose`@4455 `updateSkullParticleLayer`@4475 `backCoverGroup`@4534 `updateFloatLayer`@4638 `updateRipples`@7021 `isCustomShapeRenderActive`@20124 `updateCustomShapeLayer`@20135 `tickPresetTransition`@22323 `updateHomeAudioVisual`@22400；skull/shape 粒子 @19731-20088；ripple/cover 纹理 @3242-3310 | 657-4607 / 19731-20088 |
| **THREE 宿主核心** | `// Three.js 场景`@**1182**；`scene`/`camera`/`renderer`@**1184/1186/1238** | renderer init @1239-1247(`setClearColor`/`setSize`/`domElement`→`#canvas-container`)；`orbit`@1256 `freeCamera`@1317；resize@1132-1136；pointer-lock/focus@1441-1471；**`animate()`@28327-28590 + `animate()`调用@28590**；渲染循环局部态 `prevTime`@28261 `splashWarmRenderLast`@28272 `sfvRenderPaused`@28277 `isMainSceneCoveredBySplash`@28286 `shouldSkipAdaptiveRenderFrame`@28302 | 1182-1471 / 28261-28590 |
| **相机（FX/shelf 共享）** | `headParallax`@875 `pointerParallax`/`pointerTarget`@873/874 `gestureRotation`@26219 | `updateFreeCamera`@1478 `updateCinemaDynamics`@1581 `updateCinemaTrackProfile`@1656 `updateCamera`@2488 `updateCinema`@2674 `tickGestureRotation`@26568 | 873-875 / 1478-2674 |

### 13.3 枢纽：animate() 是 ROOT 编排器（决定性发现）
`animate()`（28327-28590，**260 行**）不是薄壳，而是全域心跳：
1. **内联 FFT 音频分析**（28357-28494，≈140 行）：读 `analyser`/`frequencyData`/`timeDomainData`（01 @6/11/12），写 `bass`/`mid`/`treble`/`audioEnergy`/`beatPulse`/`lyricSun*`（共享全局，被 shelf/fx/lyrics 消费）。
2. **写 `uniforms`**（uTime/uBass/uMid/uTreble/uBeat/uEnergy/uMouseXY/uParticleDim/uVinylSpin/uBurstAmt）—— FX 粒子材质。
3. **调用 ≈20 个跨模块更新函数**：`updateParticlePointerFrame`/`updateRipples`/`updateFloatLayer`(08) `shelfManager.update`(04) `tickLyricsParticles`/`updateStageLyrics3D`(03) `updateCinema*`/`updateFreeCamera`/`updateCamera`/`applySkullCameraPose`/`tickGestureRotation`(相机) `updateCustomShapeLayer`/`updateSkullParticleLayer`(08) `tickPresetTransition`(08) `updateHomeAudioVisual`(08) `syncDesktopOverlayState` + 节拍引擎 `processRealtimeBeatEngine`/`tickBeatMap`/`scheduleBeatCamera`(01)。
4. `renderer.render(scene, camera)`（28588）。

→ **依赖方向：host(animate) → {01,02(已抽),03,04,08}**。这正是最终应得架构。

### 13.4 关键耦合（抽取须处理）
- **animate() 内联音频分析引用 01 状态块 @6**（`audio`/`audioCtx`/`analyser`/`gainNode`）+ 节拍引擎。→ 01 可「延后但被引用」：host 抽走后这些仍是 window 全局，01 最后抽时只搬定义，animate() 不改。
- **`fx` 初始化 @846**：`var fx = Object.assign({}, fxDefaults, readSavedLyricLayout())` —— FX 状态 init 调 lyrics 纯逻辑 `readSavedLyricLayout`（03 B 桶 @5001）。→ 08 init 依赖一个 lyrics 全局（window，可解）。
- **renderer 挂载 `#canvas-container`**（DOM id @1247）—— DOM 依赖，安全。

### 13.5 可行性判定（核心结论）
- **host 先行抽取是干净叶子**：把 `scene`/`camera`/`renderer` + init + resize + pointer-lock + orbit/freeCamera + `animate()` + 渲染循环局部态 抽成 `04a-three-host.js`（经典脚本）。所有更新函数（shelf/fx/lyrics/相机/节拍）**留在 legacy 作 window 全局，animate() 按名调用**——经典脚本共享 window，无需改 animate()。
- **递进式叶子迁出而不改 animate()**：随后抽 08→04→03，各自定义从 legacy 迁到模块，animate() 仍按 window 名调用，**全程零改动 animate()**。最终依赖图 = host→各叶子，架构正确。
- **01 可一直留 legacy**：host 通过 window 引用其 `analyser` 等全局，01 最后抽只搬定义。
- 因此「04/08/host/03 整体迁」可落地为**同一逻辑单元内的顺序子抽取（2.5a→2.5b→2.5c→2.5d）**，每步独立验证（对齐 equalizer 纪律），而非一次性 10k+ 行巨切。

### 13.6 策略选项（待用户拍板）
- **A（推荐）= host-core 先行 + 顺序叶子迁出**：2.5a 抽 `04a-three-host`（含 animate），2.5b 抽 08，2.5c 抽 04，2.5d 抽 03；01 留 legacy 被引用。每步边界断言+四闸门。风险最低、可二分。
- **B = 一次性巨切**：host+08+04+03 同模块同提交。字面「整体迁」，但 10k+ 行单发、脆弱仓库回归风险最高、难二分。
- **C = 极简**：不搬 animate()，只抽 THREE 对象工厂 `initThreeHost()`。回避 260 行循环搬迁，但 animate() 直接读 renderer/scene/camera，需加访问层，未真正抽 host 逻辑。

### 13.7 下一步
- 待用户拍板 A/B/C。
- 若 A：先执行 **2.5a 边界断言抽取 `04a-three-host`**（scene/camera/renderer+init+resize+pointer-lock+orbit/freeCamera+animate()+渲染循环局部态），改 `verify-music-globals` + 回归测试，`node --check`+`build:music`+四套件，git 脆弱前提下增量提交；animate() 不改、其 callees 留 legacy 作 window 全局。

### 13.8 2.5a 执行计划（用户拍板 A · 已核定边界）
**策略 A 落地**：host 加载顺序 = **`04a-three-host.js` 在 `music.js` 之后**（legacy 先定义全部 update 函数/工具/常量，host 顶层 init 才能见到 `normalizePerformanceQuality`/`isDeepBackgroundMode`/`clampRange`/`FREE_CAMERA_STORE_KEY` 等；host 内 `renderer` 初始化后，迁入的顶层 `renderer.domElement` 监听才安全）。animate() 自调用留在 host 末尾（legacy 末端不再调）。

**抽取切片（legacy-music.js 1-indexed inclusive → `04a-three-host.js`，经典脚本无 import/export）**：
| # | 范围 | 内容 |
|---|---|---|
| 1 | **1182–1476** | Three.js 场景横幅 + `scene`/`camera`/`renderer` 声明+init(`#canvas-container`)+renderQualityProfile/getRenderPixelRatio 等 + `orbit` + freeCamera 子系统(`default/readFreeCameraState`/`save`/`scheduleSave`/`getDefaultResetPose`/`capture`/`applyToCamera`/`updateHint`/`reset`/`toggle`) |
| 2 | **3048–3141** | 顶层 `renderer.domElement`/`window` 画布交互接线（粒子指针拖拽/自由镜头/双击回正）— FX/free-camera |
| 3 | **12702–12909** | 顶层 `renderer.domElement` 货架卡片 click/contextmenu/wheel + `document` keydown/keyup — shelf/free-camera |
| 4 | **28261–28326** | 渲染循环局部态 `prevTime`/`splashWarmRenderLast`/`sfvRenderPaused` + `isMainSceneCoveredBySplash`/`shouldSkipAdaptiveRenderFrame`/`sampleRenderPerf` |
| 5 | **28327–28590** | `function animate()`（260 行枢纽）+ `animate();` 自调用 |

**边界断言**：host 含 `var scene = new THREE.Scene()`/`function animate()`/`renderer.domElement.addEventListener`/`var camera =`/`var renderer =`/`var orbit =`/`var freeCamera`/`prevTime`/`sfvRenderPaused`/`animate();`；legacy 移除后不再含 `function animate()` 与 `var scene = new THREE.Scene()`。

**接线（对齐 2.4）**：
- `package.json` `build:music` 追加 `esbuild src/music/04a-three-host.js --minify --legal-comments=none --outfile=public/assets/04a-three-host.js`（**无 `--bundle`**，保非 IIFE、全局存活）。
- `public/index.html` 在 `music.js` 脚本标签**之后**插入 `<script src="/assets/04a-three-host.js"></script>`。
- `scripts/verify-music-globals.mjs` 扫描集追加 `04a-three-host.js`（同 `02-equalizer-glue.js`）。
- 测试 vm 源组合：equalizer 已 glue+legacy；lyrics/custom-source/video 读 legacy——均不断言 scene/camera/renderer/animate（已核验），且 legacy 顶层无未护 `renderer` 执行引用（仅 `typeof renderer==='undefined'` 护体），vm 跑 legacy 不崩。

**验收闸门**：`node --check`(host+legacy) → `vm.Script` 全量解析 public/video + legacy + host → `npm run build`(music.js+host 重生) → `verify-music-globals` → 四套件(`test:video`/`test:equalizer`/`test:lyrics`/`test:custom-source`)。全绿后 git 脆弱前提下增量提交纯 2.5a 集（排除僵尸 tmdb_logo.* / 无关 video/*）。

**风险点**：① 切片跨非连续区，须一次性按原行号求移除集后单遍过滤；② 迁入的监听块属 04/08，2.5b/2.5c 时再随模块迁出（过渡归属，已记录）；③ 任何 vm 跑 legacy 若因缺失全局崩，立即回滚切片并定位。

## 结论（2026-08-15 · 已决策收口）

- **vite 拆分以「经典脚本分离」为实质完成标准；Step 2.11（`type="module"` 切换）刻意暂缓、不阻塞发布。**
- 已完成：02/04a-04e/08 抽取为经典 `<script>` + `globals-bridge` 守 143 硬约束全局 + `legacy-music.js` 28,810→21,330 行瘦身，全测试绿，可维护性目标达成。
- Step 2.11 前置（2.2–2.10 真 ESM 转换：模块 `export/import` 化 + `legacy-music.js` 退纯桥）未做；直接翻 `type="module"` 会使 2,900+ 全局失效（§三警告）。原方案 §5 强制的 Electron 实机冒烟闸门在无头环境无法满足。
- 若未来恢复 ESM 路线：须先补 2.2–2.10 再翻 2.11，属可选/暂缓项，非发布阻塞。
