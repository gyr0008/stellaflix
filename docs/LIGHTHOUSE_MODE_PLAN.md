# 灯塔模式（Lighthouse Mode）技术方案

> 状态：**P2 · 未来立项**（影视模块 P0 完成后启动）
> 制定日期：2026-08-17（2026-08-18 更新：信标灯光 + 真实地图；2026-08-18 终审修订：Cloudflare 基建、红线偏离声明、完整性修补）
> 参考原型：[hearthere.live](https://hearthere.live) — "The world is listening."

---

## 〇、设计理念

| 维度 | HearThere | 灯塔模式 |
|---|---|---|
| 核心体验 | 听听世界都在听什么 | 看看世界都在看什么 |
| 信标含义 | 声音信标 = 一个人正在播放的音乐 | 视频信标 = 一个人正在观看的视频 |
| 互动方式 | 点击信标 → 收听 | 点击信标 → 加入一起看 |
| 地图载体 | 3D 地球（MapTiler + WebGL） | 3D 地球（MapTiler Maps API + Three.js 灯光层叠合） |
| 缩放深度 | 可缩放至市级真实地理区域 | 同 HearThere：地球 → 大洲 → 国家 → 省 → 市 → 街道 |
| 信标外观 | 每个用户 = 一盏灯（发光点） | 每个用户 = 一盏灯塔（光柱 + 光晕 + 脉冲） |
| 情绪价值 | "世界在听" — 孤独感消解 | "世界在看" — 一起看的陪伴感 |

### 从 HearThere 提取的 UI 结构参考

通过浏览器实际交互分析（2026-08-17），HearThere 的界面结构如下：

```
┌─ 全屏 3D 地球地图（MapTiler）───────────────────────────────────┐
│                                                                  │
│  ┌─左上角─┐                    "HEAR THERE" 品牌文字（大号）     │
│  │ ON AIR │                     浮动于地图上层                    │
│  │ 状态灯 │                     提示："点击地图上的声音信标开始收听"│
│  └────────┘                                                      │
│                                                                  │
│                  地图控制（右侧）：                                │
│                  · 定位按钮                                       │
│                  · 缩放 +/-                                       │
│                  · 重置朝北                                       │
│                                                                  │
│  ─── 底部导航栏 ──────────────────────────────────               │
│  [ 声音信标 ]  [ 收藏 ]  [ 个人 ]  [ 设置 ]                      │
│       ↑ 选中态：pressed + 高亮                                   │
│                                                                  │
│  面板（点击底部 tab 弹出，从底部滑入）：                           │
│  · 声音信标 = 默认视图（地图 + 信标点）                           │
│  · 收藏 = 收藏的信标列表（需登录，否则弹出登录框）                │
│  · 个人 = 登录状态 / "开始收听" 按钮 / 功能说明                  │
│  · 设置 = 语言切换 / 素材授权 / 版本号                            │
└──────────────────────────────────────────────────────────────────┘
```

**关键交互细节：**

1. **信标点**：地图上分布的发光点，每个代表一个正在播放的用户，可点击加入
2. **底部导航栏**：4 个 tab，选中态用 `pressed` 标记
3. **面板系统**：点击非信标 tab 会从底部弹出侧边/底部面板，带"关闭面板"按钮
4. **登录弹窗**：点击需要认证的功能（收藏）弹出模态登录框，邮箱+密码
5. **ON AIR 状态灯**：左上角实时指示连接状态
6. **品牌文字**："HEAR THERE" 四字竖排，大号，半透明浮层
7. **提示文案**：初始状态显示"点击地图上的声音信标开始收听"
8. **地图控件**：右下角，定位/缩放/重置，MapTiler logo 在左下角
9. **技术栈**：MapTiler 3D 地球 + WebGL，SPA 单页应用，HTML 只有一条 tagline

### 灯塔模式的差异化设计

相比 HearThere，灯塔模式有以下不同：

| 差异点 | HearThere | 灯塔模式 |
|---|---|---|
| 信标交互 | 点击 → 收听（被动） | 点击 → 加入房间一起看（双向互动） |
| 同步机制 | 无（每人独立听） | WebRTC DataChannel 播放同步 |
| 品牌文字 | "HEAR THERE" | "SEE THERE" 或 "STELLAFlix" |
| 地图技术 | MapTiler（第三方地图 SDK） | Three.js 地球（项目已有，零新依赖） |
| 房间概念 | 无 | 6 位房间码，别人可主动加入 |
| 地理精度 | 精确到城市 | 精确到城市（隐私保护，不暴露精确位置） |

---

## 一、技术架构（终审修订）

### 1.1 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│              Cloudflare Workers + Durable Objects             │
│              (免费层 · 发现 + 信令 + 轻量状态)                  │
│                                                             │
│  Durable Object `Lighthouse`                                │
│    /beacons/{deviceId}    ← 在线用户信标（发现层，公开读）    │
│    /rooms/{roomCode}      ← 房间信息 + 成员                   │
│    /rooms/{roomCode}/sync ← 播放同步状态（仅房间内可见）      │
│    /signals/{roomCode}    ← WebRTC 信令交换（仅房间内可见）   │
│                                                             │
│  Worker 边缘：                                               │
│    · Turnstile 校验（防刷灯/防垃圾写）                         │
│    · HMAC 签名匿名 deviceId 校验                              │
│    · 按 deviceId/IP 速率限制                                  │
│    · request.cf 注入地理归属（免额外 GeoIP API）              │
└──────────┬──────────────────────────────┬────────────────────┘
           │ HTTPS (REST/WS)             │ HTTPS (REST/WS)
    ┌──────▼──────┐               ┌──────▼──────┐
    │  用户 A     │               │  用户 B     │
    │  Electron   │               │  Electron   │
    │  灯塔模式    │               │  灯塔模式    │
    └──────┬──────┘               └──────┬──────┘
           │                             │
           └──── WebRTC DataChannel ──────┘
                 P2P 直连（免费）
                 播放进度 · 倍速 · 暂停同步
                 ⚠️ 绝不中继媒体流（见 §6.0）
```

> **关键约束（终审新增）**：云端**只做发现 + 信令 + 轻量状态**，HTTP 层与 WebRTC 层**均不接触任何视频媒体流**。Host 仅向已加入房间的对端转发"其自身已能播放的解析地址"（见 §6.2 / §11），绝不中继媒体字节。

### 1.2 免费组件

| 组件 | 方案 | 免费额度 | 用途 |
|---|---|---|---|
| **地图瓦片** | MapTiler Maps API | 100,000 次请求/月（矢量瓦片，暗色 basemap 免费） | 真实 3D 地图，可缩放到市级街道 |
| **发现 + 信令** | Cloudflare Workers + Durable Objects | Workers 10 万请求/天（免费层）；DO 免费层足够早期 | 房间列表、在线用户、心跳、WebRTC SDP 交换、防刷校验 |
| **NAT 穿透** | 大陆可达的公共 STUN 列表（**非 Google**） | 永久免费 | P2P 直连；Google STUN（stun.l.google.com）在大陆被墙/不稳，已弃用 |
| **地理位置** | Cloudflare `request.cf` 边缘注入 | 免费、HTTPS、随请求自动注入 | 服务端直接取 country/region/city，免第三方 GeoIP API；fallback：ipapi.co HTTPS 免费档 |
| **同步通道** | WebRTC DataChannel | 永久免费、P2P 直连 | 播放进度/倍速/暂停状态实时同步 |

**总成本：$0/月。** 地图渲染引擎 MapLibre GL JS 为开源软件（BSD），不产生服务费。Cloudflare 免费层超量后可平滑升级按量付费，仍极低。

### 1.3 免费方案的限制与应对

| 限制 | 影响 | 应对 |
|---|---|---|
| MapTiler 100K 请求/月 | 极大量用户时瓦片请求可能超 | 每用户浏览 5 分钟约耗 ~200 次瓦片请求，100K ≈ 500 用户浏览会话/天；超量可切 self-hosted TileServer 或降级低频瓦片 |
| MapTiler 需署名 | 地图右下角须显示 © OpenStreetMap contributors | UI 布局已规划署名角落 |
| MapTiler **大陆可达性待实测** | 部分网络下瓦片加载慢/失败 | 备选：self-hosted TileServer-GL / 国内合规瓦片源；Phase 1 必须实测，不可假定"尚可" |
| Cloudflare Workers 免费 10 万请求/天 | 早期足够；爆发增长需升级 | 信令+心跳极轻量：~50KB/用户/天；升级按量付费仍极低 |
| 无 TURN 服务器 | 约 10% 对称 NAT 用户可能连不上 P2P | 免费方案接受此限制；后续可按需加 TURN（~$5/月）；STUN 列表优先选大陆可达节点 |
| 无用户认证（匿名） | 无法绑定账号 | 匿名房间码制 + HMAC 签名 deviceId + Turnstile 防刷（见 §七），无账号体系 |
| GeoIP 精度 | `request.cf` 到城市级，偶发偏差 | 仅用于地图定位，不展示精确位置；介意可用 ipapi.co 校正 |

---

## 二、核心数据结构

### 2.1 Durable Object 状态结构

```
/beacons/
  /{deviceId}/
    name: "用户昵称"           // 用户自定义或匿名随机名
    city: "上海"              // request.cf 或 ipapi.co 返回
    region: "上海"
    country: "中国"
    lat: 31.23                // 城市中心点纬度
    lon: 121.47               // 城市中心点经度
    video: {                  // ★ 发现层元数据：仅用于地图卡片展示
      title: "进击的巨人",
      episode: 3,
      season: 1,
      posterUrl: "...",       // 影片海报缩略图
      quality: "1080P"
    }
    roomCode: "E7KX"          // 6 位房间码
    viewers: 2               // 当前房间人数
    isPublic: true            // 是否公开显示在地图上（默认 true，见 §2.4）
    lastSeen: 1692234000000   // 心跳时间戳
    ghost: false              // 是否为幽灵灯（离线回放，见 §2.3）

/rooms/
  /{roomCode}/
    hostId: "device-xxx"
    hostName: "用户昵称"
    video: { ... }            // 同上（发现用）
    createdAt: 1692234000000
    maxViewers: 4             // ★ 房间最大人数（终审：10 → 4）
    pending: [                // ★ Host 待确认队列（见 §6.1）
      { deviceId, name, city, requestedAt }
    ]

  /{roomCode}/members/
    /{deviceId}/
      name: "昵称"
      city: "北京"
      joinedAt: 1692234100000

/signals/
  /{roomCode}/
    /{deviceId}/
      type: "offer" | "answer" | "ice-candidate"
      sdp: "..."
      candidate: "..."
      timestamp: 1692234000000
```

> **关键边界（终审新增）**：`video` 字段（含 posterUrl）**只存在于公开 beacon，用于发现层展示**。**可解析播放地址（resolved URL）绝不写入任何云端节点**，仅在 Host 与已加入房间的 Guest 之间经 WebRTC DataChannel 点对点传输（见 §6.2）。这是 §11 红线偏离声明的核心缓冲。

### 2.2 心跳与离线判定

```
规则：
  - 在线用户每 30 秒向 /beacons/{deviceId}/lastSeen 写入当前时间戳
  - 客户端监听 /beacons/ 实时列表
  - 任何信标 lastSeen 超过 60 秒 → 判定离线
  - Host 离线 → 房间解散 → 所有成员收到通知 → /rooms/{roomCode} 节点删除（见 §2.3 孤儿清理）
  - Durable Object 原生支持 watch/websocket 实时推送，无需轮询
```

### 2.3 幽灵灯（冷启动解决）与孤儿数据清理

```
幽灵灯（终审新增 · 解决空地图冷启动）：
  - 信标离线后不立即删除，标记为 ghost:true，保留过去 24 小时
  - 幽灵灯在地图上以暗淡、低透明度、无脉冲的形态显示，提示"最近有人在此观看"
  - 新用户首屏不再是纯黑地球，能看到近期观看热力
  - 超过 24 小时 → Durable Object 定时清理（TTL）

孤儿数据清理（终审新增 · 解决 C3）：
  - /beacons/：lastSeen > 24h 或 ghost 超期 → 自动删除
  - /rooms/：Host 离线或主动解散 → 删除房间节点及其 members/sync/signals 子节点
  - /signals/：DataChannel 建立成功后 → 信令节点 TTL 清理（原 §10.3 仅提 signals，现补全 beacons/rooms）
```

### 2.4 「正在看」语义定义（终审新增 · 解决 A2）

```
在线状态三态（明确此前未定义的部分）：
  1. 播放中（playing）：beacon.video 填充，卡片显示海报+片名+进度
  2. 暂停中（paused）：★ 仍算在线，beacon 保持点亮，video.state=paused
     —— 暂停不等于离线，灯不灭
  3. 影视空间内、灯塔开着但当前无播放（idle）：★ 仍算在线，
     beacon 点亮但 video 为空（仅显示城市灯，无海报/人数）
     —— 提供"我在线但没在看"的陪伴感，也避免空播误导

离线（从地图移除）：
  - 主动关闭灯塔模式 / 退出影视空间 / 应用退出
  - lastSeen 超 60s（网络断开）→ 先转 ghost，24h 后清
```

### 2.5 隐私默认值（终审 · 与 q-1 对齐）

```
isPublic: true 为默认值（地图公开显示 片名/海报/城市/人数，作为发现层）。
但：
  - 可解析播放地址绝不进公开 beacon（仅房间内对端私下传）
  - 用户可在「设置」一键将 isPublic 改为 false（仅自己可见/仅房间内）
  - 退出灯塔即移除 beacon（原子删除，见 §6.4）
见 §11 红线偏离声明对默认公开的法律定性说明。
```

---

### 2.6 灯塔实体状态机（终审新增 · 领域模型）

灯塔（beacon）实体的生命周期由一组互斥状态 + 触发事件驱动，与 §2.4 在线语义及 §2.5 隐私默认值对齐。

**状态集合（互斥）**：
- `OFFLINE`      信标不存在 / 已删除（地图无灯）
- `IDLE`         在线但无播放（影视空间内、灯塔开着、当前无视频）→ 仅城市灯，无海报/人数
- `PLAYING`      在线播放中 → 卡片显示海报+片名+进度
- `PAUSED`       在线暂停 → 灯仍亮，video.state=paused（≠离线）
- `JOINED_HOST`  本端作为 Host 开了房间 → 灯带"主播"环
- `JOINED_GUEST` 本端作为 Guest 加入他人房间 → 灯带"观众"环
- `GHOST`        离线 24h 内回放 → 暗淡无脉冲（见 §2.3）

**事件 → 迁移**：
| 事件 | 迁移 |
|---|---|
| `open_lighthouse` | OFFLINE → IDLE（点亮，无 video） |
| `start_play` | IDLE → PLAYING |
| `pause` | PLAYING → PAUSED |
| `resume` | PAUSED → PLAYING |
| `stop_play` | PLAYING / PAUSED → IDLE |
| `create_room` | IDLE/PLAYING/PAUSED → JOINED_HOST |
| `join_room(accept)` | IDLE/PLAYING/PAUSED → JOINED_GUEST |
| `leave_room` | JOINED_* → 回退到进入房间前的状态（IDLE/PLAYING/PAUSED） |
| `heartbeat_timeout` | 任何在线态 → GHOST（lastSeen > 60s） |
| `ghost_expire` | GHOST → OFFLINE（> 24h） |
| `close_lighthouse` | 任何态 → OFFLINE（原子删除，见 §6.4） |

**视觉映射**：每个状态对应一组外观参数（颜色/亮度/光柱高度/是否有环），见 §4.9 状态驱动外观表。

## 三、客户端模块设计

### 3.1 文件结构

```
public/video/
  lighthouse/
    state.js           # 灯塔模式状态机（开关、房间状态、信标列表）
    edge.js            # Cloudflare Workers/DO 客户端（发现+信令+防刷token获取）
    geo.js             # 地理归属（优先用 edge 返回的 request.cf，fallback ipapi.co）
    webrtc.js          # WebRTC 连接管理（P2P 建立、DataChannel）
    sync.js            # 播放同步协议（Host 广播 + Guest 跟随 + 漂移补偿 + chat 占位）
    globe.js           # Three.js 3D 地球渲染（信标点、动画、交互）
    ui.js              # 灯塔模式 UI 面板（底部导航、房间卡片、信标详情）
    room.js            # 房间管理（创建、加入、离开、成员列表、Host 审批）
    security.js        # Turnstile 令牌获取 + HMAC 签名 deviceId（新增）
```

每个文件不超过 500 行，遵守影视模块硬性守则。

### 3.2 模块职责

| 模块 | 职责 | 依赖 |
|---|---|---|
| `state.js` | 灯塔模式 on/off、当前角色（host/guest/无）、房间码、信标列表缓存 | 无 |
| `edge.js` | Cloudflare Workers/DO 连接：beacon 写入/读取/监听、信令读写、心跳定时器、Turnstile 令牌交换 | `state.js`, `security.js` |
| `geo.js` | 优先消费 `edge.js` 返回的 `request.cf` 地理；fallback `fetch('https://ipapi.co/json/')` | 无 |
| `security.js` | 获取 Turnstile 令牌（创建信标/房间写操作前）、生成本地匿名 deviceId + HMAC 签名 | 无 |
| `webrtc.js` | RTCPeerConnection 创建、ICE 配置（大陆可达 STUN 列表）、DataChannel 建立 | `edge.js`, `state.js` |
| `sync.js` | Host 端每 2 秒广播 `{ time, rate, state }`；Guest 端 seek + play/pause；**漂移补偿**；保留 `chat` 消息类型占位（首版不实现） | `webrtc.js`, `video/player.js` |
| `globe.js` | MapLibre 3D 地图 + Three.js 透明灯光层叠合 + 信标灯光渲染 + latLon↔screen 坐标同步 + 自动旋转 + 缩放级别驱动 LOD + 幽灵灯暗淡渲染 | `state.js`, MapLibre GL JS, Three.js（项目已有） |
| `ui.js` | 底部导航栏、信标详情弹窗、房间成员面板（含**待确认队列**）、房间码显示/输入、隐私开关 | `state.js`, `room.js` |
| `room.js` | 创建房间（生成 6 位码）、加入房间（含 **Host 审批流**）、离开房间、成员变更事件 | `edge.js`, `webrtc.js`, `security.js` |

### 3.3 与现有影视模块的集成点

灯塔模式是影视空间的子功能，触发路径：

```
影视空间 → 导航栏「世界」Tab → 进入灯塔模式视图
```

依赖的现有模块：
- `video/player.js` — 获取当前播放进度、控制播放/暂停/seek、加载解析地址（零源 Guest 路径）
- `video/state.js` — 确认当前在影视空间
- `video/source-adapter.js` — 获取当前片源信息（片名、集数、海报）；有源 Guest 的标题匹配

---

## 四、3D 地球实现方案

> **用户核心要求（2026-08-18 确认）**：
> 1. **每个用户都是一盏灯** — 信标 = 灯光，不是普通圆点
> 2. **真实 3D 地图可放大到市级区域** — 不是贴图地球，是真实地理数据

### 4.1 技术选型：双层叠合架构

HearThere 使用 MapTiler Maps API（基于 MapLibre GL JS）渲染真实 3D 地球。该方案的优势是**缩放到市级时能显示真实城市布局、道路、街区**，这是 NASA 贴图球体做不到的。

灯塔模式采用**双层叠合**方案：底层用 MapLibre GL JS 渲染真实地图，上层用项目已有的 Three.js 渲染信标灯光效果。

```
┌─ 视觉分层（从底到顶）─────────────────────────────────────────┐
│                                                                  │
│  第 0 层：MapLibre GL JS 地图（WebGL Canvas）                    │
│    - 真实 3D 地球（MapTiler Maps API，免费额度）                 │
│    - 缩放范围：地球全景 → 大洲 → 国家 → 省 → 城市 → 街道        │
│    - 数据源：OpenStreetMap 矢量切片                               │
│    - 暗色地图风格（自定义 basemap，匹配 Stellaflix 暗色审美）     │
│    - 免费额度：MapTiler Free 100,000 次请求/月                   │
│    - ⚠️ 大陆可达性待 Phase 1 实测（见 §1.3），备选自建瓦片        │
│                                                                  │
│  第 1 层：Three.js 灯光层（WebGL Canvas，透明背景）               │
│    - 叠加在地图 Canvas 之上                                     │
│    - canvas 背景 transparent                                    │
│    - 只渲染信标灯光效果，不渲染地球球体                           │
│    - 信标的 3D 坐标由地图缩放级别实时驱动                         │
│    - 利用项目现有 Three.js + 粒子系统                             │
│    - 幽灵灯：暗淡、低透明、无脉冲                                 │
│                                                                  │
│  第 2 层：HTML UI 层                                            │
│    - 品牌文字 "SEE THERE"                                       │
│    - 底部导航栏                                                  │
│    - 信标浮动卡片                                                │
│    - ON AIR 状态灯                                               │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 MapTiler 免费额度

| 项目 | 免费额度 | 说明 |
|---|---|---|
| MapTiler Maps API | 100,000 次请求/月 | 矢量瓦片（地形 + 卫星 + 暗色街道） |
| 地图样式 | 免费 | 可自定义暗色主题 |
| GeoJSON 叠加 | 免费 | 用于信标点标注（但信标灯光用 Three.js 层实现更精致） |

> **总地图成本：$0/月**（100K 请求/月足够几百个日活用户，每人浏览灯塔页面 5 分钟约消耗 ~200 次瓦片请求）。**大陆可达性须在 Phase 1 实测，不可假定。**

### 4.3 MapLibre GL JS（免费开源，BSD 授权与 GPLv3 兼容）

```
引入方式：
  - npm: maplibre-gl（~150KB gzipped）
  - 或 CDN: <script src="https://unpkg.com/maplibre-gl/dist/maplibre-gl.js">

地图样式：
  - 使用 MapTiler 提供的暗色 basemap（maps_streets_dark_v2）
  - 可通过 MapTiler Studio 免费自定义，进一步压暗底色匹配 Stellaflix
  - 或完全自定义 MapLibre style JSON，零成本

初始化：
  const map = new maplibregl.Map({
    container: 'lighthouse-map-container',
    style: 'https://api.maptiler.com/maps/streets-dark-v2/style.json?key=YOUR_FREE_KEY',
    center: [105, 35],        // 初始中心：中国
    zoom: 1.5,                // 初始缩放：地球全景
    pitch: 0,                 // 3D 倾斜角度（可拖拽）
    maxZoom: 18,               // 最大缩放：街道级别
    minZoom: 1,                // 最小缩放：地球全景
    antialias: true,
  });

事件绑定：
  map.on('moveend', syncBeaconsToViewport);   // 地图移动后重新计算信标位置
  map.on('zoom', updateBeaconScale);           // 缩放时调整信标大小
  map.on('click', onMapClick);                 // 点击事件
```

### 4.4 信标 = 灯：灯光视觉设计

**核心理念：每个在线用户都是地球上的一盏灯。** 不是圆点、不是图标，是真正的灯光效果。幽灵灯（ghost）以暗淡、低透明、无脉冲形态区分。

```
信标灯光外观（参考 HearThere 的发光点，升级为灯塔级光效）：

  远景（地球缩放级别 1-3，看到整个地球）：
    ┌────────────────────┐
    │    ✦               │   单个发光像素点
    │    │ (微弱光柱)    │   高度 2-4px
    │    ●               │   底部光点，带 bloom
    └────────────────────┘

  中景（缩放级别 4-7，看到国家/大洲）：
    ┌────────────────────┐
    │       ✧            │
    │       │ 光柱        │   高度 8-15px，带渐变
    │       │            │
    │      (●) 底部光晕   │   光晕半径 6-10px
    │     / | \ 扩散光    │   向外扩散的光线
    └────────────────────┘

  近景（缩放级别 8+，看到城市/街区）：
    ┌────────────────────┐
    │         ⭐          │   顶部星芒
    │         │           │
    │       ╱ │ ╲         │   光柱宽度增加，带体积光
    │      ╱  │  ╲        │
    │    ( ◉ ) 底部光球    │   光球半径 12-20px
    │   ╱   │   ╲         │   大面积柔和辉光
    │  ╱    │    ╲        │
    └────────────────────┘

  幽灵灯（ghost:true，离线 24h 内回放）：
    - 同形态但透明度 ~0.25、无呼吸脉冲、无星芒
    - 提示"最近有人在此观看"

动画（持续运行）：
  - 呼吸脉冲：光晕半径 0.85x ↔ 1.15x，周期 3 秒
  - 光柱微闪：亮度随机微扰 ±5%，模拟真实灯光
  - 新信标上线：从 0 放大到 1.3x 再回落到 1.0x（入场动画 0.8 秒）
  - 信标离线：从 1.0x 缩小到 0 后消失（退场动画 0.5 秒）
  - 同城多信标：光晕边缘融合，形成"城市群光区"效果

颜色：
  - 主题色 --fc-accent 为主光色
  - 光柱：底部亮 → 顶部渐变透明
  - 光晕：中心实 → 边缘径向渐变透明
  - 可选：不同片源类型用不同光色（电影=蓝紫，动漫=青绿，纪录片=暖白）
```

### 4.5 Three.js 灯光层的实现方式

Three.js 层不渲染地球球体，只渲染灯光效果。通过 `map.project()` 将经纬度坐标实时转换为屏幕坐标，驱动灯光定位。

```
globe.js 职责（重定义）：
  - 不创建 SphereGeometry / 地球纹理
  - 创建透明背景的 Three.js 场景 + 正交相机（对齐屏幕像素）
  - 每个信标 = 一个 PointLight + 光柱 Mesh + 光晕 Sprite + 脉冲动画
  - map.on('move') / map.on('zoom') 时重新计算所有信标的屏幕坐标
  - Raycaster 点击检测（对齐地图点击区域）
  - 缩放级别 1-3 时用 Sprite（性能友好）
  - 缩放级别 4+ 时用 Mesh + PointLight（精致光效）
  - 幽灵灯：独立材质（低透明、无脉冲）

坐标同步：
  function latLonToScreen(lat, lon) {
    const point = map.project([lon, lat]);
    return new THREE.Vector3(
      (point.x / window.innerWidth) * 2 - 1,
      -(point.y / window.innerHeight) * 2 + 1,
      0
    );
  }

性能优化：
  - 视口外的信标不渲染（frustum culling）
  - 缩放级别 1-2 时光柱高度降为 0（只显示光点）
  - 同屏信标 > 200 时启用 LOD（远景只渲染 Sprite 点）
  - requestAnimationFrame 驱动动画，tab 切后台时暂停
```

### 4.6 地球 vs 平面地图（重述）

| 方案 | 优势 | 劣势 |
|---|---|---|
| **真实 3D 地球**（MapTiler + MapLibre） | 可缩放到市级真实区域、道路/建筑可见、零自建瓦片服务 | 需引入 MapLibre GL JS（~150KB） |
| 纯 Three.js 贴图球体 | 不引入新依赖、项目已有 | **缩放不到市级**，只有贴图像素无法看到真实城市 |
| 平面世界地图 | 实现最简单 | 无 3D 沉浸感，不符合"灯塔"概念 |

**选择真实 3D 地球（MapTiler + MapLibre + Three.js 叠合）**，理由：用户明确要求「真实的 3D 地图能放大看到市级区域」，纯 Three.js 贴图球体无法满足。MapLibre GL JS 为 BSD 授权，与 GPLv3 兼容。

### 4.7 缩放体验设计（逐级展示）

```
缩放级别 1-2（地球全景）：
  - 看到整个地球 + 散布的微小灯光点（含幽灵灯暗淡点）
  - 自动缓慢旋转（可被用户拖拽中断）
  - 密集区域（东亚/欧洲/北美）灯光点融合为"光区"
  - 提示文字："点击地图上的灯塔加入一起看"

缩放级别 3-5（大洲/国家）：
  - 灯光点放大为光柱 + 光晕
  - 可见国境线、海岸线
  - Hover 信标显示浮动卡片（片名+城市）
  - 城市名标签开始出现

缩放级别 6-10（省/城市）：
  - 灯光效果全开：光球 + 光柱 + 星芒 + 体积光
  - 真实城市布局可见（道路、建筑轮廓）
  - 同城信标形成"光区聚合"效果
  - 浮动卡片显示完整信息 + "加入房间"按钮

缩放级别 11-18（街区/街道）：
  - 地图显示真实街道、建筑、公园
  - 信标灯光效果持续增强（光晕更大更亮）
  - 可看到信标所在城市的真实地理环境
```

### 4.8 信标浮动卡片

```
┌──────────────────────────────────┐
│  ┌──────┐                        │
│  │ 海报 │  进击的巨人              │
│  │ 缩略 │  S1 · E3 · 1080P       │
│  └──────┘                        │
│  📍 上海 · 浦东新区               │
│  👥 2 人正在看                    │
│  ─────────────────────           │
│  [  🔦 加入灯塔  ]               │
└──────────────────────────────────┘

样式规范：
  - 背景：玻璃拟态（与 Stellaflix 控制台一致的 backdrop-filter: blur）
  - 圆角：16px
  - 最大宽度：260px
  - 卡片方向：根据信标位置自动判断（避免超出屏幕边缘）
  - 入场动画：从信标位置 scale(0) → scale(1)，200ms ease-out
```

---

### 4.9 灯塔 3D 视觉模型（可实现规格 · 终审新增）

将 §4.4 的情绪稿落地为可在 Three.js 实现的规格（与 §2.6 状态机联动）。

**几何体构成**：
- 光柱（light pillar）：`CylinderGeometry`（radiusTop < radiusBottom，略呈锥），自定义 `ShaderMaterial`；高度由缩放级别驱动（远 0 / 中 8–15 / 近 12–20 世界单位映射）；fragment 用纵向 alpha 渐变（底亮顶透）+ 轻微噪声扰动模拟真实灯光。
- 光晕（glow）：`Sprite` + 径向渐变 `CanvasTexture`（中心实→边缘透明），`AdditiveBlending`、`depthWrite:false`、`transparent:true`，半径 6–20px 随缩放。
- 星芒（near only）：2–3 个交叉 `Billboard Plane`（加性混合）模拟镜头星芒。
- 底部光球（near）：`SphereGeometry` + emissive 材质，提供 bloom 种子。
- 环（joined/host）：`TorusGeometry` 或 `Sprite` 圆环，标识主播/观众态（仅本端可见）。

**材质与混合**：
- 所有发光元素：`AdditiveBlending` + `depthWrite:false`，避免彼此硬边与遮挡地图。
- 开启 `depthTest` 以被近景地图建筑遮挡（更真实）。
- 颜色取自 `--fc-accent`（青 #00F5D4），按片源类型可覆写（电影=蓝紫 / 动漫=青绿 / 纪录片=暖白）。

**Bloom 后处理**：
- Three 层独立 `WebGLRenderer`，叠加 `UnrealBloomPass`（strength≈0.8, radius≈0.4, threshold≈0.0），仅作用于发光元素；底层 MapLibre canvas 不被 bloom 影响。
- bloom 分辨率降采样 0.5x 控 GPU 占用；tab 切后台暂停渲染。

**状态驱动外观（与 §2.6 联动）**：
| 状态 | 光柱 | 光晕 | 环 | 备注 |
|---|---|---|---|---|
| IDLE | 短·暗 | 中 | 无 | 仅城市灯 |
| PLAYING | 标准·亮 | 大·亮 | 无 | 呼吸脉冲 |
| PAUSED | 标准·暗 | 中 | 无 | 脉冲减速/半亮 |
| JOINED_HOST | 亮 | 大 | 主播环 | 青金双色 |
| JOINED_GUEST | 亮 | 大 | 观众环 | 仅本端可见环 |
| GHOST | 极暗 | 极小·透 | 无 | 透明度≈0.25，无脉冲 |

**同城光区聚合算法（§4.4 末句落地）**：
- 每帧对视口内信标按 `city` 分桶，同桶内计算质心。
- 质心处渲染"光区"合并光晕，半径 = soft-max(各灯半径) × 1.2。
- 个体光柱在桶内距离 < 阈值时透明度降至 0.4（让位给光区），避免重叠爆白。
- 阈值随缩放级别放宽（远景点密）。

**动画参数（具体数值，供实现）**：
- 呼吸脉冲：scale 0.85↔1.15，周期 3.0s，sin 缓动；GHOST/PAUSED 停或减速。
- 微闪：亮度随机 ±5%，每 200–400ms 重采样。
- 入场：scale 0 → 1.3（0.5s ease-out-back）→ 1.0（0.3s ease-out），总 0.8s。
- 退场：scale 1.0 → 0（0.5s ease-in），同时 alpha → 0。
- 状态切换过渡曲线：`cubic-bezier(0.22, 1, 0.36, 1)`（平滑减速）。

### 4.10 灯塔交互设计（可实现规格 · 终审新增）

信标自身的交互态机 + 微交互 + 失败反馈。注：「一起看」跨灯塔光束隐喻本轮未纳入（按决策范围，joined 态仅以本端灯环标识，见 §4.9）。

**交互态（与 §2.6 实体态正交，描述"用户正在对它做什么"）**：
- `DEFAULT`   默认态，无指针悬停
- `HOVER`     指针悬停 → 浮起 + 放大 1.08 + 光标 pointer + 200ms 出卡片
- `SELECTED`  卡片展开/选中
- `JOINING`   点击加入 → 灯环出现 spinner + 卡片"连接中…"
- `JOINED`    成功加入 → 本端灯加 joined 环（主播/观众），卡片"已加入"
- `REJECTED`  被 Host 拒绝 → 灯轻微 shake + 红色 toast"请求被拒绝"
- `FULL`      房间满员 → toast"房间已满（4/4）"
- `TIMEOUT`   连接超时 10s → toast"连接失败，请重试"

**微交互规格（数值）**：
- Hover 浮起：translateY -4px + scale 1.08，过渡 160ms `cubic-bezier(0.22,1,0.36,1)`
- 卡片入场：scale(0)→scale(1) 200ms ease-out，锚定信标位置
- 点击 ripple：以点击点为圆心扩散环 0→1 / 300ms，加性混合
- JOINING spinner：环旋转 1turn / 0.8s linear
- REJECTED shake：x ±6px 3 次 / 0.4s，配红色描边 0.5s
- 状态切换统一过渡曲线 `cubic-bezier(0.22,1,0.36,1)`

**失败 / 边界反馈**：
- 被拒：REJECTED 微交互 + toast，信标回 DEFAULT
- 满员：点击即拦截，FULL toast，不进入 JOINING
- 超时：TIMEOUT toast，信标回 DEFAULT，可重试
- Host 视角：待确认队列（§5.3）点接受/拒绝 → 对应 Guest 进入 JOINED / REJECTED

**「一起看」情感隐喻（待定，不在本方案强制范围）**：
- 本轮不设计跨灯塔光束；co-watching 陪伴感若需可视化（两灯间光束、同步脉冲），单独立项评估。

## 五、UI 面板设计

### 5.1 灯塔模式视图布局

```
┌─ 全屏 3D 地球 ─────────────────────────────────────────────────┐
│                                                                  │
│  ┌─左上角─┐                      "SEE THERE"                     │
│  │ 灯塔   │                      （品牌文字，半透明浮层）         │
│  │ ON AIR │                      提示："点击信标加入一起看"        │
│  └────────┘                                                      │
│                                                                  │
│                        [ 地图控件：定位 / 缩放 / 重置 ]           │
│                                                                  │
│  ─── 底部导航栏 ──────────────────────────────────────────       │
│  [ 灯塔地图 ]  [ 我的房间 ]  [ 设置 ]                            │
│       ↑ 默认选中                                                 │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 5.2 底部导航 Tab

| Tab | 内容 | 说明 |
|---|---|---|
| **灯塔地图** | 3D 地球 + 信标点（默认视图，含幽灵灯） | 对应 HearThere 的"声音信标" |
| **我的房间** | 当前房间状态 / 房间码分享 / 成员列表 / **待确认队列** | 用户作为 Host 或 Guest 时的房间管理 |
| **设置** | 昵称修改 / 公开-私密切换（isPublic）/ 离开房间 | 灯塔模式专属设置 |

### 5.3 房间面板（"我的房间" Tab 点击后弹出）

```
┌─ 我的房间 ─────────────────────────────────┐
│  ──────────────────────────────── [ 关闭 ]  │
│                                            │
│  🎬 进击的巨人 S1E3                         │
│  🕐 00:23:45 / 00:24:00                    │
│                                            │
│  房间码：E7KX          [ 复制 ]             │
│  人数：2/4                                │   ← ★ 10 → 4
│                                            │
│  ── 待确认（仅 Host）──                     │   ← ★ 新增 A3
│  · 👤 匿名用户 · 北京    [ 接受 ] [ 拒绝 ]  │
│                                            │
│  ── 成员 ──                                │
│  · 👤 主播 · 上海     (Host)               │
│  · 👤 匿名用户 · 北京  (Guest)              │
│                                            │
│  ── 同步控制 ──                              │
│  延迟：120ms                               │
│  状态：同步中 ✓                             │
│                                            │
│  [ 离开房间 ]                              │
└────────────────────────────────────────────┘
```

---

## 六、WebRTC 连接流程

### 6.0 总约束（终审新增 · 解决 C1）

```
⚠️ 灯塔模式的 WebRTC 仅用于：
  1. 信令交换（SDP / ICE，经 Cloudflare DO 中转）
  2. 播放状态同步（DataChannel，Host ↔ Guest）
  3. Host 向已加入房间的对端转发"其自身已能播放的解析地址"（见 §6.2）

⚠️ 绝不中继媒体流：Host 与 Guest 各自从自己的源站/本地拉取媒体，
  DataChannel 中不含任何视频/音频字节。任何将媒体字节经服务端或
  Host 中转的设计均被本约束禁止（防止上行 ×N + 法律升级）。
```

### 6.1 Host 创建房间（含审批流 · 解决 A3）

```
1. 用户在影视空间观看视频 → 开启灯塔模式
2. security.js 获取 Turnstile 令牌 + 本地匿名 deviceId（HMAC 签名）
3. edge.js 写入 /beacons/{deviceId}（经 Turnstile + 签名校验）
4. room.js 生成 6 位随机房间码（字母+数字，排除易混淆字符 0O1lI）
5. edge.js 写入 /rooms/{roomCode}
6. 监听 /signals/{roomCode} 等待 Guest 的 join 请求
7. 有 Guest 申请加入时：
   a. Host 收到 join 请求 → ui.js 弹出"X 想加入"【接受】【拒绝】
   b. 拒绝 → 通知 Guest "请求被拒绝"，不建立连接
   c. 接受 → 创建 RTCPeerConnection（ICE 配置大陆可达 STUN）
   d. 创建 DataChannel（命名 "sync"）
   e. 创建 Offer SDP → 写入 /signals/{roomCode}/{hostId}
   f. 等待 Guest 的 Answer SDP
   g. ICE candidates 交换完成 → DataChannel open
   h. 开始每 2 秒广播同步数据
```

### 6.2 Guest 加入房间（含零源路径 · 解决 B1）

```
1. 用户在灯塔地图上点击信标 / 输入房间码
2. edge.js 读取 /rooms/{roomCode} → 获取发现层视频信息（title/season/episode/poster）
3. 向 Host 发送 join 请求（进入 Host 待确认队列，见 §6.1）
4. Host 接受后，建立 RTCPeerConnection（ICE 配置大陆可达 STUN）
5. 监听 Host 的 Offer SDP → 设置远程描述 → 创建 Answer → 写入 /signals
6. ICE candidates 交换完成 → DataChannel open

   ★ 片源闭环（终审 · 两种路径）：
   路径 A（有源 Guest）：
     - 用 title/season/episode 在自己已导入的源中搜索
     - 命中后手动确认（防同名误匹配）→ player.js 加载
   路径 B（零源 Guest，终审新增）：
     - 若本地无匹配源，经 DataChannel 向 Host 请求解析地址
     - Host 回传"其自身已能播放的 resolved URL"
     - Guest player.js 直接 load 该地址
     - ⚠️ 此路径构成对 VIDEO_MODULE_PLAN §阶段3 红线的刻意偏离，见 §11

7. 接收同步数据 → 漂移补偿后 seek + play/pause 跟随（见 §6.3）
```

### 6.3 同步协议（含漂移补偿 · 解决 C7）

```
Host → Guest (DataChannel "sync"):
{
  type: "sync",
  currentTime: 123.456,
  playbackRate: 1.0,
  state: "playing",           // "playing" | "paused" | "ended" | "idle"
  videoInfo: {
    title: "进击的巨人",
    episode: 3,
    season: 1
  }
}

Guest → Host (DataChannel "sync"):
{
  type: "ack",
  receivedAt: 123.460,
  currentTime: 123.100
}

Host → Guest (DataChannel "control"):
{
  type: "switch",             // Host 切集/切源
  videoInfo: { ... }
}
{
  type: "resolve",            // ★ 零源 Guest 路径：Host 下发解析地址
  url: "https://.../playlist.m3u8",   // 仅房间内对端可见，绝不入云端
  sourceLabel: "用户已导入源 X"
}

// ★ 预留但未实现（首版砍掉聊天，见 q-3）：
{
  type: "chat",               // RESERVED — v1 不处理，仅占位防协议破坏
  text: "...",
  from: "deviceId"
}

漂移补偿（终审新增 · C7）：
  - Guest 收到 currentTime 后，计算偏差 delta = |local - remote|
  - delta <= 1.0s：不硬 seek，用渐进 playbackRate 微调（如 1.02x/0.98x）平滑追赶
  - delta > 1.0s：硬 seek 到 remote
  - 网络抖动期间维持 lastSync 时间戳，避免逐帧抖动
```

### 6.4 断线重连与退出原子性（解决 C8）

```
断线重连：
  - DataChannel onclose → 标记断线状态
  - 自动尝试重新走信令流程（新 Offer/Answer）
  - 重连超时 10 秒 → 显示"连接已断开"提示
  - Host 断线 → 通知所有 Guest "房间已关闭" → 删除 /rooms/{roomCode} 及子节点
  - Guest 断线 → Host 从成员列表移除

退出原子性（终审新增 · C8）：
  - 用户关闭灯塔 / 退出影视空间 / 应用退出 → 立即 edge.js.remove 本端
    /beacons/{deviceId} 及（若 Host）/rooms/{roomCode}
  - DO 访问规则禁止其他 deviceId 重写/恢复他人节点（签名校验 deviceId）
  - 防止"退出后信标被他人重新点亮"的竞态
```

---

## 七、Cloudflare 边缘层配置（终审重写 · 替代原 Firebase 章）

### 7.1 架构与部署

```
1. 创建 Cloudflare 账号（免费）
2. 新建 Worker `stellaflix-lighthouse-edge`
3. 新建 Durable Object 类 `Lighthouse`（绑定到 Worker）
4. Worker 路由：
   - POST /beacon           写/更新信标（需 Turnstile + HMAC 签名）
   - GET  /beacons         列出在线 + 幽灵灯
   - POST /room            创建房间（需 Turnstile + HMAC 签名）
   - GET  /room/:code      读取房间（公开，含发现层 video）
   - POST /room/:code/join 加入请求（入 Host 待确认队列）
   - POST /room/:code/accept|reject  Host 审批
   - WS   /signal/:code    信令通道（仅房间内成员）
5. Durable Object 持久化 beacons/rooms/signals 状态 + TTL 清理
```

### 7.2 安全模型（终审新增 · 解决 B4/C6，替代 Firebase Anonymous Auth + App Check）

```
匿名身份：
  - deviceId：客户端本地随机生成（不关联账号/硬件）
  - HMAC 签名：secret 仅存于 Worker 环境变量，客户端用 deviceId+nonce 签名
    Worker 校验签名，防止伪造 deviceId 刷写

防刷灯（Cloudflare Turnstile）：
  - 创建信标 / 创建房间等"写"操作前，客户端先取 Turnstile 令牌
  - Worker 校验令牌（免费、用户无感、有效拦截脚本刷屏）
  - 见 C6：解决"匿名+开放写入=公共垃圾桶"

速率限制：
  - Worker 按 deviceId / IP 限流（如 信标写 1 次/2s，join 1 次/3s）
  - 超限返回 429，客户端退避

访问控制（替代 Firebase read/write:true 开放规则）：
  - 读：公开（beacons 列表、room 发现层）—— 只读，无写权限
  - 写：必须 Turnstile + HMAC 签名 + 速率限制通过
  - 他人节点：签名 deviceId 不匹配则拒绝写（解决 C8 竞态）
  - 不再有任何 "read:true, write:true" 无鉴权规则
```

### 7.3 地理归属（终审 · 解决 C4）

```
优先：Worker 直接使用 request.cf 注入字段
  country = request.cf.country
  region  = request.cf.region
  city    = request.cf.city
  → 免费、HTTPS、随请求自动注入、大陆可达性优于 ip-api.com

Fallback：request.cf 缺失时
  fetch('https://ipapi.co/json/')  // HTTPS 免费档
  → 介意可换本地 GeoLite2 库（完全离线）
```

### 7.4 客户端接入示例

```javascript
// public/video/lighthouse/edge.js
const EDGE = 'https://stellaflix-lighthouse-edge.<subdomain>.workers.dev';

export async function writeBeacon(deviceId, sig, turnstile, payload) {
  const r = await fetch(`${EDGE}/beacon`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId, sig, turnstile, payload }),
  });
  if (r.status === 429) throw new Error('rate-limited');
  return r.json();
}
// 信令经 WS /signal/:code，仅在房间内成员间；可解析地址不经此通道落库
```

> **注意**：Edge 端点、Turnstile sitekey、HMAC secret 经运行时配置注入，不硬编码在源码中。

---

## 八、执行步骤（P0 完成后）

### Phase 1 — 真实 3D 地图 + 灯光信标可视化（无网络功能）

**目标**：真实地图能转能缩放到市级、信标灯光能显示、点击有反馈。用模拟数据（含幽灵灯暗淡态）。

1. MapLibre GL JS 引入 + MapTiler 免费 Key 申请 + 暗色 basemap 配置
2. **MapTiler 大陆可达性实测**（必做，不可假定"尚可"；失败则切自托管/国内瓦片）
3. `globe.js` — 地图初始化 + Three.js 透明灯光层叠合 + latLon↔screen 坐标同步 + 幽灵灯渲染
4. 灯光信标渲染 — 模拟数据的经纬度 → 灯光效果（光点/光柱/光晕按缩放级别切换）+ 幽灵灯暗淡态
5. 点击检测 + 浮动卡片（海报 + 片名 + 城市 + 加入按钮）
6. 灯塔模式入口 — 影视空间「世界」Tab → 切换到灯塔视图

**验收**：
- 地球可旋转、pitch 可倾斜、缩放到市级能看到真实道路街区（大陆网络下实测通过）
- 信标灯光随缩放级别呈现不同形态（远景光点 → 近景光柱光晕）
- 幽灵灯以暗淡无脉冲形态显示
- 点击信标卡片正确弹出，卡片不超出屏幕边缘

### Phase 2 — Cloudflare 边缘 + 信令 + 在线发现

**目标**：真实的在线用户信标灯光出现在地图上；防刷安全模型落地。

1. Cloudflare Worker + Durable Object 部署（§7.1）
2. `security.js` — Turnstile 令牌 + HMAC 签名 deviceId
3. `edge.js` — beacon 写入/监听/心跳（含 Turnstile + 签名 + 限流）
4. `geo.js` — request.cf 地理（fallback ipapi.co）
5. `room.js` — 创建/加入房间 + 房间码生成 + **Host 审批流**
6. 信标列表 → 灯光层实时更新（上线点亮 / 离线转 ghost / 24h 清）
7. 幽灵灯 24h 回放机制上线（解决冷启动）

**验收**：两台电脑同时开启灯塔模式，对方信标灯光出现在自己的地图上；脚本刷灯被 Turnstile 拦截；下线后灯光转暗淡 ghost，24h 后消失。

### Phase 3 — WebRTC + 同步播放

**目标**：点击信标加入房间，双方同步播放同一个视频（含零源路径）。

1. `webrtc.js` — RTCPeerConnection + DataChannel（大陆可达 STUN）
2. `sync.js` — 播放同步协议 + **漂移补偿** + chat 占位
3. 断线重连 + 房间关闭处理 + **退出原子性**
4. 片源闭环：路径 A（有源标题匹配+手动确认）+ 路径 B（零源 Host 转发解析地址，见 §11）
5. "我的房间"面板 UI（含待确认队列、人数 2/4）

**验收**：A 在看视频，B 加入后 B 的播放器自动同步到 A 的进度，暂停/播放/seek 都同步；零源 B 经 Host 转发地址也能播；偏差 <1s 时平滑追赶不抖动。

### Phase 4 — 体验打磨

1. 灯光动画优化（呼吸脉冲、同城光区融合、信标 >200 时的 LOD 降级）
2. 房间码分享（剪贴板复制 + 输入框手动加入）
3. 昵称自定义 + 公开/私密切换（isPublic 一键关）
4. 网络诊断面板（连接状态、延迟、P2P vs 中继、STUN 节点健康）
5. 暗色主题适配（Stellaflix 玻璃拟态风格 + 自定义 MapTiler 暗色 basemap）
6. 缩放级别逐级体验调优（第 4.7 节的四级形态切换手感）
7. 聊天功能评估（§6.3 已预留 `chat` 类型，首版不实现）

---

## 九、与 hearthere.live 的功能对照

| 功能 | HearThere | 灯塔模式 | Phase |
|---|---|---|---|
| 真实 3D 地图（可缩放到市级） | ✅ MapTiler | ✅ MapTiler + MapLibre + Three.js 灯光层 | Phase 1 |
| 每个用户 = 一盏灯 | ✅ 发光点 | ✅ 光点/光柱/光晕按缩放级别演变 + 幽灵灯 | Phase 1 |
| 底部导航栏（3-4 Tab） | ✅ | ✅ 3 Tab（灯塔地图/我的房间/设置） | Phase 1 |
| 信标浮动卡片（昵称+内容+地点） | ✅ | ✅ 海报+片名+集数+城市+人数 | Phase 1 |
| ON AIR 状态指示 | ✅ | ✅ 灯塔 ON/OFF | Phase 2 |
| 登录/注册 | ✅ 邮箱密码 | ❌ 无账号体系（匿名房间码 + HMAC 签名） | — |
| 收藏功能 | ✅ | ❌ 不在初始范围 | — |
| 点击信标 → 收听/观看 | ✅ 单向 | ✅ 双向（一起看+同步） | Phase 3 |
| 播放同步 | ❌ | ✅ WebRTC DataChannel + 漂移补偿 | Phase 3 |
| 房间码 | ❌ | ✅ 6 位码分享 | Phase 2 |
| 品牌浮层文字 | ✅ "HEAR THERE" | ✅ "SEE THERE" / "STELLAFlix" | Phase 1 |
| 多语言 | ✅ 简体中文等 | ✅ 跟随系统语言 | Phase 4 |
| Host 加入审批 | ❌ | ✅ 待确认队列（接受/拒绝） | Phase 2 |
| 幽灵灯（冷启动） | ❌ | ✅ 24h 离线回放 | Phase 2 |
| 防刷安全 | ❌（需登录） | ✅ Turnstile + HMAC + 限流（匿名） | Phase 2 |

---

## 十、GPLv3 合规与第三方服务说明

### 10.1 软件依赖授权

- **MapLibre GL JS**：BSD-2-Clause 授权，与 GPLv3 兼容（需在 NOTICE.md 列明）
- **Cloudflare Workers / Durable Objects SDK**：闭源托管服务，客户端仅用 fetch/WebSocket 标准 API，无额外授权问题
- **WebRTC**：W3C 标准 + 浏览器/Electron 原生 API，无额外授权问题
- **Three.js**（项目已有）：MIT 授权，与 GPLv3 兼容
- ~~NASA Blue Marble 地球纹理~~：不再使用（已改用 MapTiler 矢量瓦片，无需自带纹理资产）
- **Cloudflare Turnstile**：闭源托管服务，免费档用于防刷，客户端仅嵌 sitekey

### 10.2 第三方服务条款（终审修正 · 消除内部矛盾）

| 服务 | 免费计划条款要点 | 风险与应对 |
|---|---|---|
| **MapTiler Maps API** | 免费档 100K 请求/月，需署名（© OpenStreetMap contributors + MapTiler），不允许转售瓦片 | 地图右下角已规划署名 UI；**大陆可达性 Phase 1 实测**，超量后切 self-host / 国内瓦片 |
| **Cloudflare Workers/DO** | 免费档 10 万请求/天；DO 免费层；数据经 Cloudflare 处理 | 只存信令/心跳/发现层元数据（片名/海报/城市），**可解析播放地址绝不入云端** |
| **ipapi.co**（fallback） | 免费档 HTTPS、限频 | 仅 request.cf 缺失时 1 次/会话调用 |
| **STUN 列表（非 Google）** | 公共服务，无 SLA | 选大陆可达节点；约 10% 对称 NAT 需后续 TURN |

> **修正说明（消除原 §10.2 与 beacon.video 的矛盾）**：原文档称"只存信令/心跳等非个人敏感数据"，但 `beacon.video` 实际存了片名+海报。**现明确**：beacon 存的是**发现层展示元数据**（片名/海报/城市），属公开发现用途；**可解析播放地址（resolved URL）不入库、仅房间内对端经 DataChannel 传输**（见 §2.1 / §6.2 / §11）。地理仅到城市级。

### 10.3 隐私边界（发布级要求 · 终审补全）

- 信标地理位置**只精确到城市级**（request.cf / ipapi.co 返回城市中心点），不收集、不展示街道级真实位置
- `deviceId` 为本地随机生成的匿名 ID + HMAC 签名，不关联任何账号或硬件信息
- 用户可随时关闭灯塔模式（`isPublic: false` 或完全退出），信标**原子删除**立即从地图移除（见 §6.4）
- 云端节点 TTL 清理：`/beacons/`、`/rooms/`、`/signals/` 均设生命周期，避免数据长期留存与孤儿堆积（原文档仅提 signals，现补全）
- 防刷：Turnstile + HMAC + 速率限制，杜绝匿名开放写入被脚本滥用

---

## 十一、红线偏离声明（终审新增）

> **本声明记录灯塔模式对《VIDEO_MODULE_PLAN.md》§阶段3「软件本身保持中立、不提供视频资源」红线的刻意偏离，经产品决策层显式接受，风险自担。**

### 11.1 偏离内容

灯塔模式的「Host 向**已加入房间的对端**转发其自身已能播放的解析地址」功能（§6.2 路径 B），使软件从"中立播放工具（用户自己导源）"变为"向另一个已主动加入同一房间的用户供给实际可播放地址"的通道。该行为构成对 VIDEO_MODULE_PLAN §阶段3 红线的**刻意偏离**。

### 11.2 为什么仍属可控偏离（缓解措施）

1. **范围收束**：可解析播放地址**绝不进入公开信标**，仅在双方均已主动加入同一房间后点对点传输（DataChannel），非公开索引、非广播。
2. **不存储不聚合**：软件不存储、不聚合任何视频资源；转发的仅是用户本地**自身已能播放**的地址，平台不持有任何内容。
3. **发现层与供给层分离**：默认公开广播仅含发现层元数据（片名/海报/城市/人数），用户可一键将 `isPublic` 改为 false 关停公开发现。
4. **全量免责声明**：界面与文档标注"资源由用户自行导入，平台不提供任何内容；转发地址仅供已加入房间的对端使用"。
5. **绝不中继媒体流**（§6.0）：DataChannel 不含任何媒体字节，上行不为 ×N，法律风险与带宽风险均被隔离在"地址转发"层级。

### 11.3 决策记录

- 决策日期：2026-08-18
- 备选方案（已否决）：(a) 仅接受"Guest 须已导入同源+标题匹配"边界——否决理由：零源用户点击信标后播不出，闭环断裂；(b) 维持原文档"仅广播片名+一键加入"——否决理由：同样构成发现/分发入口且体验更弱。
- 接受的风险：软件定性从中立工具向"内容供给通道"偏移；以"仅房间内对端 + 不存储 + 强免责"为缓冲。
- 后续义务：若分发风险在实际运营中升级，须回退到 §11.2.1 的"仅房间内"硬约束并评估完全关闭路径 B。
