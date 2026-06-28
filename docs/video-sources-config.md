# 视频源配置说明

## 常见视频源格式（参考 CatVod/Kazumi）

### 1. JSON 配置格式

```json
{
  "sourceName": "GZYS",
  "sourceType": "cms",
  "sourceUrl": "https://api.example.com/api.php/provide/vod/",
  "sourceKey": "cms",
  "sourceApi": "/api.php/provide/vod/",
  "sourceSearch": "/api.php/provide/vod/?ac=detail&wd=",
  "sourceDetail": "/api.php/provide/vod/?ac=detail&ids=",
  "regions": ["全球"],
  "priority": 1
}
```

### 2. API 接口格式

```
搜索接口：https://api.example.com/api.php/provide/vod/?ac=detail&wd=关键词
详情接口：https://api.example.com/api.php/provide/vod/?ac=detail&ids=视频ID
播放接口：https://api.example.com/player/?url=视频地址
```

### 3. 返回数据格式

```json
{
  "code": 1,
  "msg": "数据列表",
  "list": [
    {
      "vod_id": 12345,
      "vod_name": "电影名称",
      "vod_year": "2024",
      "vod_area": "中国大陆",
      "vod_play_from": "m3u8",
      "vod_play_url": "第1集$url1#第2集$url2"
    }
  ]
}
```

---

## 已知的视频源网站

| 缩写 | 网站 | 类型 | 稳定性 |
|------|------|------|--------|
| GZYS | 光速影视 | CMS | ⭐⭐⭐ |
| NBY | 牛牛影视 | CMS | ⭐⭐⭐ |
| NSYS | 年少影视 | CMS | ⭐⭐⭐ |
| JPYS | 久久影视 | CMS | ⭐⭐⭐ |
| CO4K | 4K资源 | CMS | ⭐⭐ |
| YYNB | 阳光影视 | CMS | ⭐⭐ |

---

## CMS 类型接口格式

大多数第三方视频源使用类似的 CMS 接口：

### 搜索接口
```
GET /api.php/provide/vod/?ac=detail&wd=关键词
```

### 详情接口
```
GET /api.php/provide/vod/?ac=detail&ids=视频ID
```

### 分类列表
```
GET /api.php/provide/vod/?ac=detail&t=分类ID
```

---

## 视频播放地址格式

```json
{
  "vod_play_from": "hxm3u8",
  "vod_play_url": "https://example.com/play/url1.m3u8"
}
```

播放地址通常是 m3u8 格式，需要使用 HLS.js 播放。

---

## 集成步骤

1. **添加视频源配置**
2. **实现搜索接口调用**
3. **解析视频播放地址**
4. **使用 HLS.js 播放**
