# 影视播放器「画质增强」（实时超分 SR）架构记录

> 建立日期：2026-08-16 · 功能：底部控制栏「画质」按钮（`#sfv-ctrl-quality`）

## 决策与依据（勿推翻）

- **路线：WebGL2 实时滤镜链**（用户 2026-08-16 确认）。播放中逐帧 GPU 增强，边看边生效。
- **为什么不是 ncnn-vulkan**：Real-ESRGAN / SRMD / Real-CUGAN 的 ncnn-vulkan 版是**离线逐帧引擎**（每帧 100ms~秒级），物理上无法实时播放；且 Electron 24.8.8 = Chromium 112 **无 WebGPU**（Chrome 113 转正），WebSR / Anime4K-WebGPU 类库不可用。WebGL2 完全可用（`desktop/main.js:58-74` 已强制 GPU + ANGLE d3d11）。
- **为什么不是 SSimSuperRes/SSimDownscaler**：实测两支 shader 深度依赖 mpv 内部管线阶段（`POSTKERNEL`/`PREKERNEL` 钩子、`NATIVE_CROPPED`、`input_size`、`tex_offset`、`HOOKED_raw/_mul`），**无法在 RGB WebGL 管线中忠实移植**，已从 vendor 剔除。「真人·锐化」档改用 FSRCNNX + 自研轻量边缘锐化（`sr-engine.js` REFINE_FS）。

## 模块拓扑（`public/video/sr/`，经典 script + SFV 命名空间）

| 文件 | 职责 |
| --- | --- |
| `sr-hook-adapter.js` | mpv user-shader 方言纯函数层：指令解析（HOOK/BIND/SAVE/WIDTH/HEIGHT/WHEN/COMPONENTS/OFFSET）、RPN 表达式求值、WebGL2 GLSL 生成（注入 `NAME_tex/_texOff/_pos/_size/_pt` 宏 + HOOKED 别名）、静态校验 |
| `sr-engine-core.js` | WebGL2 运行时：单上下文（独立于 Three.js）、program 缓存、纹理/FBO 池（按尺寸复用 + 读写同纹理排除）、全屏三角（gl_VertexID，零 VBO）、视频帧上传；RGBA16F（无 EXT_color_buffer_float 时回落 RGBA8） |
| `sr-engine.js` | 引擎主体：rVFC 逐帧循环（暂停/seek 补帧）、letterbox contain 上屏、LUMA 链亮度增量重建、refine、性能统计与自动降档回调、生命周期（自订阅 `sfv:player-open/meta/close`，**player.js 零改动**） |
| `sr-presets.js` | 6 档定义 + shader 懒加载（fetch `vendor/sr/glsl/`，内存缓存） |
| `sr-ui.js` | 画质菜单（玻璃拟态 popover）、持久化（`stellaflix-video-sr`）、toast、自动降档执行 |

vendor 资产：`public/vendor/sr/glsl/`（9 文件，原样分发，授权见 NOTICE.md）。

## 档位表（与上游官方链一一对应）

| 档 | 链 | 模式 | tier |
| --- | --- | --- | --- |
| 关闭 | — | rgb | 0 |
| 通用 · FSRCNNX | FSRCNNX_x2_8-0-4-1 | luma | 1 |
| 真人 · 锐化 | FSRCNNX + 引擎 refine | luma | 2 |
| 动漫 · 流畅 | Clamp_Highlights + Upscale_Denoise_CNN_x2_S | rgb | 3 |
| 动漫 · 质量 | Clamp + Restore_CNN_M + Upscale_CNN_x2_M（官方 Mode A Fast） | rgb | 4 |
| 动漫 · 双倍 | 质量档 + AutoDownscalePre_x2/x4 + Upscale_CNN_x2_S（官方双倍链，最高 4×） | rgb | 5 |

自动降档方向：tier 递减（anime-4k→hq→fast→live→fsrcnnx→off）。

## mpv 语义等价要点（改引擎前必读）

1. **顺序执行模型**：pass 按文件顺序跑；`SAVE` 写纹理表，后续 pass `BIND` 可引用；无 `SAVE` 默认写回钩子纹理。
2. `PREKERNEL` 钩子按当前 MAIN 处理（Clamp_Highlights 第 3 pass 依赖此语义）；`HOOKED` 是钩子纹理别名。
3. `WHEN`/`WIDTH`/`HEIGHT` 为 RPN 表达式，`OUTPUT` = canvas 上 contain 矩形像素尺寸，`NATIVE` = 源分辨率。Anime4K 全部 upscale pass 带 `WHEN OUTPUT ≥ 1.2× MAIN`（不足 1.2× 自动直出零开销）；AutoDownscalePre 把 2× 中间结果对齐到 OUTPUT。
4. **LUMA 链（FSRCNNX）**：引擎先做亮度抽取（Rec.709），链后以「亮度增量重建」回 RGB：`rgb_out = rgb_bilinear + (Y_sr − Y_bilinear)`，色度走双线性、亮度携带全部超分细节。
5. 中间纹理池按 (w,h) 复用，`acquireTarget(exclude)` 保证同一 pass 不读写同一纹理（SAVE MAIN 场景双缓冲）。

## 已验证事实

### 2026-08-16 真机反馈修复（画面倒置/闪烁/跨域直链）

- **画面倒置**：根因 = DOM 源上传纹理未设 `UNPACK_FLIP_Y_WEBGL`（视频首行落在纹理 v=0，渲染到 framebuffer 底部）。已在 `uploadVideoFrame` 翻转；letterbox 视口 y 同步翻转（GL 视口原点在左下，`vp.y = ch - rect.y - rect.h`）。
- **闪烁**：`desynchronized: true`（前端缓冲直绘）在 D3D11 合成下不稳，改 `false`。
- **跨域直链源不能增强**：规则源（API/CMS10）解析出的直链为第三方域名，`texImage2D` 抛 SecurityError。修复：taint 时自动换 `/api/proxy?url=` 同源代理重载并恢复进度（`onTaint()`，每片一次，`sfv:player-open` 重置机会）；HLS/FLV（MSE）本就同源可增强。
- **embed（xpath/parser/web 规则）无法增强是硬限制**：iframe 内第三方播放器画面受浏览器安全模型保护拿不到。Kazumi 桌面端能全源超分是因为它用 libmpv 内核（shader 跑在 mpv 的 GL 管线），不走浏览器 iframe。
- **E2E 补四象限方向回归检测**（左上红亮/右上蓝亮/左下红暗/右下蓝暗非对称伪视频），并做过「检测有效性验证」：临时还原倒置 bug → 测试如实失败（ok:false）→ 恢复修复 → 通过。非恒真断言。
- **【P0】画面变红 + 竖条纹（2026-08-16 第二次真机反馈）**：根因 = `sr-engine.js` vec2s 构造 typo `1 / table.h`（应为 `table[n].h`）→ 所有纹理 `_pt` uniform 的 y 分量 = NaN → 全部 CNN pass 的 `texOff` 采样 y 坐标 NaN。SwiftShader 软件光栅对 NaN 采样宽容（clamp）故 E2E 未炸；真机 D3D11 输出驱动定义的垃圾 → 每列采错行 = 竖条纹 + 偏色。三层防御已加：① `drawPass` 对非有限 uniform 归零 + console.warn；② E2E 增加 NaN 检测断言（wrap core.drawPass），并验证过检测有效性（临时还原 typo → 抓到 MAIN_pt/NATIVE_pt NaN → ok:false）；③ FBO 完整性检查 + RGBA16F→RGBA8 自动降级（防个别驱动 16F 渲染目标不完整，第二潜在条纹源）。video 上传 internalformat 显式 gl.RGBA8（避开 unsized 歧义）。

- `node --test test/sr-core.test.js`：9/9（解析/RPN/GLSL 生成/校验/contain 几何/档位表/降档链/资产存在性/幂等）。
- `npx electron scripts/sr_shader_compile_electron.js`（SwiftShader WebGL2 真实编译）：**59/59 通过**（9 个 vendor 文件全部 55 pass + 引擎内建 4 shader），`EXT_color_buffer_float` 可用。
- `npx electron scripts/sr_render_e2e_electron.js`（渲染管线端到端实测，非仅编译）：**5/5 场景通过**——blit 基线 / Anime4K 质量 2.16×（plan=20 pass 真实执行）/ 1.0×（Upscale 的 WHEN 正确跳过、Restore 无 WHEN 仍执行，plan=11，与 mpv 行为一致）/ FSRCNNX luma 14 pass / live+refine；断言无 GL 错误、出图非黑、滤镜输出与直出基线存在像素差异（非直通空壳）。
- `npx electron scripts/sr_ui_electron.js`（UI 冒烟）：**14/14 通过**——菜单开合、6 档位行、点击应用、localStorage 持久化、引擎链装载（14 pass）、toast、按钮指示、自动降档 fsrcnnx→off 全链路。
- server.js 真实伺服 `.glsl`：HTTP 200、字节数与磁盘一致（MIME 回落 application/octet-stream，fetch 读文本不受影响）。

## 禁止回退或改坏的点

- 不要把 vendor GLSL 改成手写转译版——适配器靠解析指令保持上游原样，升级只换文件。
- 不要在 `WHEN` 求值前渲染 pass（会破坏「不足 1.2× 直出」的零开销保证）。
- 不要让 SR canvas 常驻显示——`display:none` 时视频原样直出，关档必须零视觉差异。
- embed 播放（`meta.embed`）与跨域污染源（texImage2D SecurityError）必须优雅停用并提示，不许黑屏盖 iframe。
- 自动降档默认开（菜单可关），降档 toast 必须告知从哪档降到哪档。

## 待真机验证清单（沙箱无法代劳）

1. 1080p 动漫片源开「动漫·质量」：清晰度可见提升、帧率不掉、无音画不同步。
2. 播中切档无黑闪（canvas 先绘首帧再隐 video 的顺序生效）。
3. 全屏 / 弹幕 / 字幕层级正常（canvas 在 overlay 内、弹幕层之上）。
4. 关播放器后 canvas 清理、切回音乐态粒子恢复。
5. 弱 GPU 机器自动降档链路 + 统计行数值合理。
