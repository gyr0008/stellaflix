# 第三方授权与署名声明（Third-Party Notices）

本项目（Stellaflix，派生自 Mineradio，GPL-3.0-or-later）在运行时集成以下第三方素材与服务。
各上游作品的版权与授权条件不因本项目采用 GPL-3.0 而转移或覆盖；请遵守下列各自条款。

---

## 1. TMDB（The Movie Database）商标与数据

- **用途**：详情页使用 TMDB API 获取影片元数据（标题、评分、年份、类型、演职员、相似作品、剧照），
  并使用其商标 logo（`public/video/tmdb_logo.svg`）按 API 使用条款进行署名展示。
- **商标归属**：TMDB 名称、文字标识与 "The Movie Database" 商标归 The Movie Database 所有。
- **logo 资源**：`tmdb_logo.svg` 为依据 TMDB 品牌视觉规范手工重绘的矢量图（CC BY 4.0 允许在署名前提下重绘）。
- **API 署名要求**：依据 TMDB API 使用条款，使用其数据须展示以下声明（已在详情页底部以 8px `rgba(255,255,255,.25)` 呈现）：

  > This product uses the TMDB API but is not endorsed or certified by TMDB.
  > （本产品使用 TMDB API，但未经 TMDB 认可或认证。）

- **授权**：TMDB API 数据与商标的使用受 TMDB 服务条款约束，详见 https://www.themoviedb.org/documentation/api/terms-of-use。

---

## 2. 上游作品（Mineradio / XxHuberrr）

本项目基于 Mineradio（作者 XxHuberrr，GPL-3.0）派生扩展。原作者署名与上游许可保留，
详见项目 `LICENSE`（GPL-3.0-or-later）。

---

## 3. Kazumi 规则引擎（移植代码）

`public/video/kazumi/*` 严格移植自 Predidit/Kazumi（GPL-3.0）。其版权归原作者所有，
本项目仅作为源解析引擎引入，未改动其内部实现逻辑。

---

## 4. 弹幕数据层（DanDanPlay 移植）

`public/video/danmaku/*` 数据/协议层移植自 Kazumi 的 DanDanPlay 集成（GPL-3.0）。

---

> 如本文件与上游许可存在不一致，以上游官方许可文本为准。
