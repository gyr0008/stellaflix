# StellaFlix 视频源架构设计（参考 Kazumi）

## 1. 架构概述

参考 Kazumi 的多源聚合设计，我们采用类似的架构：

```
┌─────────────────────────────────────────────────────────┐
│                    用户点击播放                          │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                   视频源管理器                           │
│  - 获取该电影的所有视频源                                │
│  - 按优先级排序                                         │
│  - 自动切换失败的源                                     │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                   视频解析器                             │
│  - YouTube 解析器                                       │
│  - Vimeo 解析器                                         │
│  - 自定义解析器（可扩展）                                │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                   播放器                                │
│  - HLS.js 播放 m3u8                                     │
│  - 原生播放 mp4                                         │
│  - iframe 嵌入                                         │
└─────────────────────────────────────────────────────────┘
```

## 2. 视频源类型定义

### 2.1 源类型枚举

```typescript
// 视频源类型
enum VideoSourceType {
  YOUTUBE = 'youtube',           // YouTube 嵌入
  VIMEO = 'vimeo',               // Vimeo 嵌入
  CUSTOM_EMBED = 'custom_embed', // 自定义 iframe 嵌入
  CUSTOM_URL = 'custom_url',     // 自定义视频 URL (m3u8/mp4)
  LOCAL_FILE = 'local_file',     // 本地上传文件
}
```

### 2.2 源配置接口

```typescript
// 视频源配置
interface VideoSourceConfig {
  id: string;
  name: string;                 // 显示名称
  type: VideoSourceType;
  priority: number;             // 优先级（数字越小优先级越高）
  regions: string[];            // 支持的地区 ['全球', '中国大陆']
  isActive: boolean;            // 是否启用
  
  // 解析配置
  config: {
    // YouTube 配置
    youtube?: {
      videoId: string;          // YouTube 视频 ID
      playlistId?: string;      // 播放列表 ID
    };
    
    // Vimeo 配置
    vimeo?: {
      videoId: string;
    };
    
    // 自定义嵌入配置
    customEmbed?: {
      embedUrl: string;         // 嵌入地址
      allowFullscreen: boolean;
    };
    
    // 自定义 URL 配置
    customUrl?: {
      videoUrl: string;         // 视频直链
      type: 'm3u8' | 'mp4' | 'webm';
      headers?: Record<string, string>;  // 自定义请求头
    };
  };
}
```

## 3. 视频解析器设计

### 3.1 解析器接口

```typescript
// 视频解析器接口
interface VideoParser {
  // 解析视频地址
  parse(source: VideoSourceConfig): Promise<VideoParseResult>;
  
  // 验证源是否可用
  validate(source: VideoSourceConfig): Promise<boolean>;
}

// 解析结果
interface VideoParseResult {
  success: boolean;
  videoUrl?: string;           // 视频播放地址
  coverUrl?: string;           // 封面图
  title?: string;              // 标题
  duration?: number;           // 时长（秒）
  quality?: string;            // 画质
  error?: string;              // 错误信息
}
```

### 3.2 YouTube 解析器

```typescript
class YouTubeParser implements VideoParser {
  async parse(source: VideoSourceConfig): Promise<VideoParseResult> {
    const videoId = source.config.youtube?.videoId;
    if (!videoId) {
      return { success: false, error: 'Missing YouTube video ID' };
    }
    
    // YouTube 嵌入 URL
    const embedUrl = `https://www.youtube.com/embed/${videoId}`;
    
    return {
      success: true,
      videoUrl: embedUrl,
      title: `YouTube - ${videoId}`,
    };
  }
  
  async validate(source: VideoSourceConfig): Promise<boolean> {
    return !!source.config.youtube?.videoId;
  }
}
```

### 3.3 自定义 URL 解析器

```typescript
class CustomUrlParser implements VideoParser {
  async parse(source: VideoSourceConfig): Promise<VideoParseResult> {
    const config = source.config.customUrl;
    if (!config) {
      return { success: false, error: 'Missing custom URL config' };
    }
    
    return {
      success: true,
      videoUrl: config.videoUrl,
      quality: config.type === 'm3u8' ? 'HLS' : 'Direct',
    };
  }
  
  async validate(source: VideoSourceConfig): Promise<boolean> {
    return !!source.config.customUrl?.videoUrl;
  }
}
```

## 4. 视频源管理器

```typescript
class VideoSourceManager {
  private parsers: Map<VideoSourceType, VideoParser>;
  
  constructor() {
    this.parsers = new Map();
    this.parsers.set(VideoSourceType.YOUTUBE, new YouTubeParser());
    this.parsers.set(VideoSourceType.VIMEO, new VimeoParser());
    this.parsers.set(VideoSourceType.CUSTOM_EMBED, new CustomEmbedParser());
    this.parsers.set(VideoSourceType.CUSTOM_URL, new CustomUrlParser());
  }
  
  // 获取可用视频源
  async getAvailableSources(movieId: string): Promise<VideoSourceConfig[]> {
    // 1. 从数据库获取所有源
    const sources = await this.fetchSourcesFromDB(movieId);
    
    // 2. 过滤启用的源
    const activeSources = sources.filter(s => s.isActive);
    
    // 3. 检查地区限制
    const regionFiltered = activeSources.filter(s => 
      s.regions.includes('全球') || s.regions.includes(this.getUserRegion())
    );
    
    // 4. 按优先级排序
    return regionFiltered.sort((a, b) => a.priority - b.priority);
  }
  
  // 解析视频
  async parseVideo(source: VideoSourceConfig): Promise<VideoParseResult> {
    const parser = this.parsers.get(source.type);
    if (!parser) {
      return { success: false, error: `Unsupported source type: ${source.type}` };
    }
    
    try {
      return await parser.parse(source);
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
  
  // 自动切换源（类似 Kazumi）
  async playWithFallback(movieId: string): Promise<VideoParseResult> {
    const sources = await this.getAvailableSources(movieId);
    
    for (const source of sources) {
      console.log(`尝试源: ${source.name}`);
      const result = await this.parseVideo(source);
      
      if (result.success) {
        console.log(`成功: ${source.name}`);
        return result;
      }
      
      console.log(`失败: ${source.name} - ${result.error}`);
    }
    
    return { success: false, error: '所有源都失败了' };
  }
}
```

## 5. 数据库设计

```sql
-- 视频源配置表
CREATE TABLE video_source_configs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  movie_id UUID REFERENCES movies(id) ON DELETE CASCADE,
  
  -- 基本信息
  name VARCHAR(255) NOT NULL,
  source_type VARCHAR(50) NOT NULL,
  priority INTEGER DEFAULT 0,
  regions TEXT[] DEFAULT '{"全球"}',
  is_active BOOLEAN DEFAULT true,
  
  -- 配置（JSON 格式，灵活扩展）
  config JSONB NOT NULL,
  
  -- 统计
  play_count INTEGER DEFAULT 0,
  success_rate DECIMAL(5,2) DEFAULT 100.00,
  last_played_at TIMESTAMP WITH TIME ZONE,
  
  -- 时间戳
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_video_configs_movie ON video_source_configs(movie_id);
CREATE INDEX idx_video_configs_type ON video_source_configs(source_type);
CREATE INDEX idx_video_configs_priority ON video_source_configs(priority);
```

## 6. 合规视频源建议

| 源 | 类型 | 版权 | 优先级 |
|----|------|------|--------|
| YouTube | 嵌入 | ✅ 合规 | 高 |
| Vimeo | 嵌入 | ✅ 合规 | 高 |
| Internet Archive | URL | ✅ 公共领域 | 中 |
| 用户自定义 | 混合 | ⚠️ 视情况 | 低 |

## 7. API 设计

```
GET  /api/video-sources?movie_id=xxx     - 获取视频源列表
POST /api/video-sources                  - 添加视频源
GET  /api/video-sources/parse?id=xxx     - 解析视频地址
POST /api/video-sources/test             - 测试视频源可用性
```

---

这个架构参考了 Kazumi 的多源聚合设计，但使用合规的视频源，适合商业项目。
