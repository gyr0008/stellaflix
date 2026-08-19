# CMS 片源候选清单（手动导入参考，非预装）

> 来源：https://github.com/puppet680/KVideo-config 的 `lite.json`（每日自动巡检，只保留 ✅ 可用、剔除成人/失效源）。
> 用途：仅供你在 Stellaflix 的「第三方音源」入口**手动逐个导入测试**，用于完成 #18 真机验收（搜片→详情→点集→HLS 出画面）。
> **合规声明**：本文件不会写入应用默认配置；出厂安装包 `api_site` 仍为空。所有源由你手动导入，符合「全部由用户手动导入」红线。

## 格式映射（重要，照抄即可）

我们的 `sources.js` 是 CMS10（苹果 CMS V10）解析：`{api}?ac=videolist&wd=关键词`。
KVideo 的 `baseUrl` 已经是完整接口路径，**直接粘贴进 Stellaflix 的「CMS10 接口地址」输入框即可，不要改路径、不要加 `?ac=`**。

正确示例：
```
https://iqiyizyapi.com/api.php/provide/vod
```
应用会自动拼成 `.../provide/vod?ac=videolist&wd=xxx` → 合法 V10 请求。

## 筛选结论

`lite.json` 共 20 个源，全部是苹果 CMS V10 格式（`/api.php/provide/vod`），**格式 100% 兼容**我们的解析层。
按仓库的 `priority`（30 天稳定性，1=最稳）分层：

### ⭐ Tier A（priority=1，最稳，建议先试这 5 个）
| 名称 | 粘贴用的接口地址 | 备注 |
|---|---|---|
| 🎬-爱奇艺- | `https://iqiyizyapi.com/api.php/provide/vod` | 大站镜像，优先试 |
| 🎬360 资源 | `https://360zyzz.com/api.php/provide/vod` | 老牌聚合，常见明文 m3u8 |
| 🎬魔都资源 | `https://www.mdzyapi.com/api.php/provide/vod` | 稳定性好 |
| 🎬非凡资源 | `https://api.ffzyapi.com/api.php/provide/vod` | 常见明文 mp4/m3u8 |
| 🎬豪华资源 | `https://hhzyapi.com/api.php/provide/vod` | 稳定性好 |

### Tier B（priority=1，其余 11 个，A 不行再试）
- 🎬iKun资源 `https://ikunzyapi.com/api.php/provide/vod`
- 🎬电影天堂 `http://caiji.dyttzyapi.com/api.php/provide/vod`（注意是 http，应用支持）
- 🎬猫眼资源 `https://api.maoyanapi.top/api.php/provide/vod`
- 🎬量子资源 `https://cj.lzcaiji.com/api.php/provide/vod`
- 🎬暴风资源 `https://bfzyapi.com/api.php/provide/vod`
- 🎬最大资源 `https://api.zuidapi.com/api.php/provide/vod`
- 🎬无尽资源 `https://api.wujinapi.me/api.php/provide/vod`
- 🎬速播资源 `https://subocaiji.com/api.php/provide/vod`
- 🎬红牛资源 `https://www.hongniuzy2.com/api.php/provide/vod`
- 🎬魔都动漫 `https://caiji.moduapi.cc/api.php/provide/vod`
- 🎬如意资源 `https://cj.rycjapi.com/api.php/provide/vod`

### Tier C（priority=5/10，稳定性较差，最后试）
- 🎬U酷影视 `https://api.ukuapi88.com/api.php/provide/vod`（priority 5）
- 🎬光速资源 `https://api.guangsuapi.com/api.php/provide/vod`（priority 5）
- 🎬极速资源 `https://jszyapi.com/api.php/provide/vod`（priority 10）
- 🎬新浪资源 `https://api.xinlangapi.com/xinlangapi.php/provide/vod`（priority 10，路径略特殊）

## 怎么测（在你自己机器上）

1. 打开 Stellaflix → 点右上角「第三方音源」图标 → 粘贴上面某个地址 → 保存。
2. 跑真实数据流验收：
   ```
   CMS_URL="https://iqiyizyapi.com/api.php/provide/vod" node scripts/step5_realsource_test.js
   ```
   脚本会自动 搜索→详情→取播放地址→经 `/api/proxy` 真拉流（m3u8 还会再拉首个 `.ts` 分片）。
3. 在 GUI 里手动搜一部片子，点进详情，点一集，确认能出画面。

## ⚠️ 已知风险（测的时候注意）

1. **播放地址加密**：许多 `*zyapi` 聚合站返回的 `vod_play_url` 是加密串（不是 `http(s)://...m3u8`）。我们的 `parsePlayUrl` 只认明文 `http(s)`，加密源会「搜得到、详情有、但播放地址为空/播不了」。这是 apple CMS 生态通病，不是我们的 bug。
   - **如何判断**：详情里点一集如果提示「无可用播放地址」或地址长得像乱码/不是以 `http` 开头 → 该源加密，换下一个。
2. **V8 老站需 `at=json`**：本清单全是 V10 站，默认 JSON，无需担心。若你日后试 V8 站（`ac=list`）报 `invalid-json`，需我给 `buildListUrl` 补 `at=json` 参数。
3. **地域/被墙**：部分站在国内直连困难，但我们的 `/api/proxy` 走服务端转发，CORS 已处理；视频分片也经 HLS proxy loader 重写，理论上能解。仍以真机为准。
4. **源随时失效**：`lite.json` 是每日巡检结果，今天 ✅ 不代表永远 ✅。

## 如果 5 个 Tier A 都播不了

大概率遇到的是「加密播放地址」普遍现象，而不是网络/代理问题。把某个源的 `vod_play_url` 原始值（在 step5 输出或详情接口里）贴给我，我据此加一个 Apple CMS 解密适配器（这是已知待办，独立于本次筛选）。
