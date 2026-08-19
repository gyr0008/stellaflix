# 3D 歌单架「固定悬浮 + 鼠标跟随倾斜」原理与影视网格栏复刻条件

> 调研文档 · 目标产物为分析报告（不含可运行代码）
> 目标复刻容器：影视态 `.sfv-grid` / `.sfv-card`（KVideo 浅色网格，见 `public/video/player.css`）
> 复刻缓动路线：rAF 双段 lerp
> 参数基准：**全部以 3D 歌单架源码真实数值换算**，不做无依据估算

---

## 0. 结论先行

1. **3D 歌单架是 WebGL/Three.js 实现，不是 CSS 3D。**
2. **固定悬浮** = 场景图里固定局部坐标的 `THREE.Mesh` + 透视相机锁死（`static`/`centerLocked`，不绕原点 orbit）。
3. **跟随倾斜** = 全局归一化指针坐标经**双段 lerp**（`pointerTarget → pointerParallax(0.040) → group.rotation(0.045/0.075)`）驱动整组 `group` 旋转，叠加**逐卡视差微倾**（`parX*0.038*parWeight` / `parY*0.024*parWeight`）。
4. **DOM 网格栏复刻的本质**：把"整组旋转"翻译成容器 `perspective` + 容器级 `rotate`；把"逐卡视差"翻译成逐卡 `rotateX/Y + translateZ`；缓动复用歌单架同源系数 `0.040 / 0.045`。

---

## 1. 歌单架实现原理（源码实证）

### 1.1 固定悬浮：场景图固定坐标 + 透视相机不移动

| 机制 | 源码证据 | 说明 |
|------|----------|------|
| 卡片是固定坐标 Mesh | `PlaneGeometry(2.05,1.025)` + `new THREE.Mesh`（`04b:597-598`）；每帧 `card.mesh.position.set(px,py,pz)`（`04b:801` / `839`） | 坐标由 `shelfLayoutProfile()` 算出，与鼠标无关 → 卡片在 3D 空间"钉死" |
| 整组挂场景图 | `group = new THREE.Group()`（`04b:1077`）；`group.position.set(0,0,0)`（`04b:1113`） | 整架作为 scene 子节点，局部坐标固定 |
| 透视投影 | 着色器 `gl_Position = projectionMatrix * modelViewMatrix * p`（`04b:9-11`）；`camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100)`（`04a:12`） | 透视由相机 `projectionMatrix` 完成 |
| 相机锁死 | side 模式 `shelfCameraMode:'static'` / `centerLocked` | 相机不绕原点 orbit → 卡片完全固定 |
| 悬浮感来源 | `floorMirror.rotation.x = -Math.PI/2`（`04b:937`）；`py += sin(nowT*0.92+idx*0.64)*0.052*...`（`04b:791`） | 地面倒影 + 时间呼吸，制造"浮"的观感 |

### 1.2 跟随倾斜：双段 lerp 链路（丝滑根因）

```
mousemove
  → mx = (e.clientX/innerWidth)*2 - 1          [host:402 / 08-fx-visual.js:255-257]
  → pointerTarget.{x,y} ∈ [-1, 1]              [legacy-music.js:719-720]
  → 段1: pointerParallax.x += (pointerTarget.x - pointerParallax.x) * 0.040   [host:710]
  → 段2: group.rotation.y += (px*0.018 - group.rotation.y) * 0.045           [04b:1120]
         group.rotation.x += (-py*0.010 - group.rotation.x) * 0.045          [04b:1121]
         （粒子驱动分支用 0.075，见 04b:1116-1118）
  → 逐卡: card.rotation.y = sideRotY + parX*0.038*parWeight   [04b:809]
         card.rotation.x = -delta*... - parY*0.024*parWeight  [04b:811]
  parX/parY = pointerParallax.{x,y}            [04b:744-745]
  parWeight = max(0, 1 - absD*0.16)            [04b:746]   (absD=卡到中心的归一化距离)
```

- **段1（指针→缓动指针）**：`0.040`，把瞬时鼠标跳变抹平。
- **段2（缓动指针→整组旋转）**：`0.045`（粒子驱动 `0.075`），整架随鼠标轻摆。
- **逐卡视差**：段2 结果再乘每张卡系数（`0.038`/`0.024` rad）与 `parWeight`。中心卡 `parWeight≈1`，边缘卡衰减 → 纵深差异。
- **丝滑根因 = 双段 lerp + 每帧 rAF 增量逼近 + GPU transform**，零跳变、无布局抖动。

### 1.3 歌单架真实参数表（源码取证，复刻基准）

| 参数 | 真实值 | 源码位置 | 含义 |
|------|--------|----------|------|
| 透视 fov | 45° | `04a:12` | 透视相机视场角 |
| near / far | 0.1 / 100 | `04a:12` | 裁剪面 |
| 指针归一化 | `(clientX/innerWidth)*2 - 1` | `host:402` | 范围 −1..1 |
| 段1 lerp 系数 | 0.040 | `host:710` | 指针→缓动指针 |
| 段2 lerp 系数 | 0.045（粒子驱动 0.075） | `04b:1120-1122` | 缓动指针→整组旋转 |
| 整组 y 旋转系数 | 0.018 rad ≈ 1.03° | `04b:1120` | 整架最大左右摆 |
| 整组 x 旋转系数 | 0.010 rad ≈ 0.57° | `04b:1121` | 整架最大上下摆 |
| 逐卡 y 旋转系数 | 0.038 rad ≈ 2.18° | `04b:809` | 中心卡最大左右倾 |
| 逐卡 x 旋转系数 | 0.024 rad ≈ 1.38° | `04b:811` | 中心卡最大上下倾 |
| 视差权重 | `max(0, 1 - absD*0.16)` | `04b:746` | 离中心越远权重越低 |
| 呼吸幅度 | `sin(t*0.92+idx*0.64)*0.052` | `04b:791` | 悬浮呼吸 |

> 注：整组最大摆角 ≈1°，逐卡叠加最大 ≈2.2°，实际可见更小（指针极少同时达 ±1，且 `parWeight` 衰减）。故歌单架是"极轻微"倾斜。

---

## 2. DOM 网格栏（`.sfv-grid` / `.sfv-card`）复刻条件

### 2.1 换算原则（以歌单架数据为基准）

- **角度**：歌单架用弧度、DOM 用度。整组 max `0.018 rad ≈ 1.03°`，逐卡 max `0.038 rad ≈ 2.18°`。DOM 卡离眼近、无真透视衰减，按 **×~3 放大** 使"轻微但可见"；**lerp 系数与歌单架同源（`0.040` / `0.045`）**，保证丝滑一致。
- **perspective**：歌单架 `fov=45`；DOM 用 `perspective` 模拟观察距离。对齐本仓库 `hall.css` 已验证的 `1800px`，网格栏取 **`1400–1600px`**（略紧，因网格卡更小、需稍强透视才显倾斜）。
- **parWeight**：公式原样复用 `max(0, 1 - absD*0.16)`，`absD` = 卡片中心到视口中心的归一化距离。

### 2.2 复刻的 9 条具体条件

| # | 条件 | 对应歌单架机制 | DOM 落地要点 |
|---|------|----------------|--------------|
| 1 | **透视容器（共享灭点）** | 整组 `group.rotation` 作为刚性平面 | `.sfv-grid{ perspective:1500px }`，所有直接子卡共享同一灭点，整片一起倾斜 |
| 2 | **卡片 3D 基点** | Mesh 的 transform 空间 | `.sfv-card{ transform-style:preserve-3d; transform-origin:center; backface-visibility:hidden; will-change:transform }` |
| 3 | **监听鼠标位移** | `host:402` 同式归一化 | 挂 `window` + **capture**（`.sfv-browse--page` host 为 `pointer-events:none`，网格自身收不到）；`nx=(clientX/innerWidth)*2-1` |
| 4 | **应用旋转变换** | 整组 + 逐卡旋转 | 容器写 `--mx/--my`（段2 结果）；卡片 `transform: rotateX(calc(var(--my)*-5deg)) rotateY(calc(var(--mx)*5deg)) translateZ(var(--lift))`（`≤~5°` 整组、`≤~7°` 逐卡） |
| 5 | **双段 lerp 缓动** | `0.040` → `0.045` | rAF：`raw → eased(×0.040) → applied(×0.045)`，统一写容器变量、卡片 `calc` 读（避免逐卡拼串） |
| 6 | **逐卡视差** | `parWeight` | 每卡按到视口中心距离算 `absD`，套 `max(0,1-absD*0.16)`；中心列权重高、边缘低 |
| 7 | **悬浮 / 呼吸（可选但最像）** | 倒影 + `sin*0.052` | `translateZ` 抬升 + 现有 `box-shadow`；可选 CSS 呼吸 keyframe 仿 `sin` 振荡 |
| 8 | **无障碍 + 性能** | — | `@media (prefers-reduced-motion:reduce){ .sfv-card{transform:none} }`；`will-change` 离屏移除；单监听 + rAF 节流 |
| 9 | **项目铁律** | — | 新图层 `z-index < 2147482099`；保持影视态粒子运行；用 `transform`/隐藏而非删节点；监听不 `preventDefault`（免吞点击） |

### 2.3 关键陷阱（落地时必避）

- **同一属性勿 `transition` 与 rAF 同时驱动 `transform`**（会打架），二选一；本路线选 rAF 双段 lerp（与歌单架一致）。
- **现有 `:hover{ transform:translateY(-3px) }` 须改为叠加变量**（如 `--hover-lift`），合成进同一条 `transform`，否则 hover 会清掉倾斜。
- **监听必须 capture 且不 `preventDefault`**，否则吞掉 FX 面板 / 卡片点击。

---

## 3. 验收口径（若后续落地实现）

1. 整片网格随鼠标轻摆，无跳变；中心卡倾斜略强、边缘弱（`parWeight` 生效）。
2. 倾角克制（整组 ≤~5°、逐卡 ≤~7°），观感为"轻微跟随"而非"翻牌"。
3. `prefers-reduced-motion` 下静止；切回音乐态无残留 `transform`。
4. 性能：30–60 卡时单 `window` 监听 + rAF 节流，无布局抖动、帧率稳定。

---

## 4. 与影视侧已有 3D 实践的关系

- `public/video/hall.css` 已用 `perspective:1800px; transform-style:preserve-3d` —— 本复刻与之同族，仅参数略紧（1500px）。
- `page-browse-3d.js` 是 WebGL 原点大平面（墙），其"固定"来自 `gridCameraMode:'static'` 锁相机；与歌单架是两套几何，但"视差/呼吸"机制同源。
- DOM 网格栏是**仿 3D（透视 + transform）**，视觉上足以复刻"固定悬浮 + 轻微跟随倾斜"，但无真倒影 / 真景深；悬浮感靠 `translateZ` + 阴影 + 可选伪倒影层补齐。

---

*文档生成依据：源码取证 `src/music/04b-shelf-3d.js`、`src/music/04a-three-host.js`、`src/music/08-fx-visual.js`、`src/music/legacy-music.js` 与 `public/video/player.css`、`public/video/hall.css`。所有参数均来自源码，未做无依据估算。*
