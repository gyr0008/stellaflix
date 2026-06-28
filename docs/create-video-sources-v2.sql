-- StellaFlix 视频源管理表（v2 - 支持多种类型）
-- 用途：管理用户添加的视频源
-- 依赖：movies 表存在

-- ============================================
-- 1. 视频源类型枚举
-- ============================================
DO $$ BEGIN
  CREATE TYPE video_source_type AS ENUM (
    'youtube',        -- YouTube 嵌入（免费合规）
    'vimeo',          -- Vimeo 嵌入
    'custom_embed',   -- 自定义 iframe 嵌入
    'custom_url',     -- 自定义视频 URL（m3u8/mp4）
    'local_file'      -- 本地上传文件
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- 2. 视频源表
-- ============================================
CREATE TABLE IF NOT EXISTS video_sources (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

  -- 关联的电影
  video_id UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,

  -- 视频源信息
  source_type video_source_type NOT NULL,
  source_name VARCHAR(255) NOT NULL,           -- 显示名称，如 "YouTube - 官方预告片"
  source_url TEXT NOT NULL,                     -- 视频 URL 或嵌入地址
  source_quality VARCHAR(50) DEFAULT '720p',   -- 画质：1080p, 720p, 480p

  -- 嵌入配置
  embed_width VARCHAR(20) DEFAULT '100%',
  embed_height VARCHAR(20) DEFAULT '500px',
  allow_fullscreen BOOLEAN DEFAULT true,

  -- 元数据
  language VARCHAR(10) DEFAULT 'zh-CN',        -- 语言
  region VARCHAR(10) DEFAULT '全球',           -- 地区限制（全球 = 无限制）
  is_active BOOLEAN DEFAULT true,              -- 是否启用

  -- 排序和统计
  sort_order INTEGER DEFAULT 0,
  play_count INTEGER DEFAULT 0,

  -- 时间戳
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 3. 索引
-- ============================================
CREATE INDEX idx_video_sources_video_id ON video_sources(video_id);
CREATE INDEX idx_video_sources_type ON video_sources(source_type);
CREATE INDEX idx_video_sources_active ON video_sources(is_active);

-- ============================================
-- 4. RLS 策略
-- ============================================
ALTER TABLE video_sources ENABLE ROW LEVEL SECURITY;

-- 所有人可查看启用的视频源
CREATE POLICY "所有人可查看启用的视频源" ON video_sources
  FOR SELECT USING (is_active = true);

-- 管理员可管理所有视频源
CREATE POLICY "管理员可管理视频源" ON video_sources
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- ============================================
-- 5. 示例数据（YouTube 嵌入）
-- ============================================
-- 假设 videos 表中有一部电影 id = 'xxx'
-- INSERT INTO video_sources (video_id, source_type, source_name, source_url, source_quality)
-- VALUES (
--   'xxx',
--   'youtube',
--   'YouTube - 高清版本',
--   'https://www.youtube.com/embed/dQw4w9WgXcQ',
--   '1080p'
-- );

-- ============================================
-- 6. 函数：更新播放次数
-- ============================================
CREATE OR REPLACE FUNCTION increment_play_count(source_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE video_sources
  SET play_count = play_count + 1
  WHERE id = source_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 7. 视图：获取视频源统计
-- ============================================
CREATE OR REPLACE VIEW video_source_stats AS
SELECT
  vs.*,
  m.title as movie_title,
  m.year as movie_year
FROM video_sources vs
JOIN movies m ON vs.video_id = m.id
WHERE vs.is_active = true
ORDER BY vs.sort_order, vs.play_count DESC;

COMMENT ON TABLE video_sources IS '视频源管理表 - 支持多种视频源类型';
COMMENT ON COLUMN video_sources.source_type IS '视频源类型：youtube, vimeo, custom_embed, custom_url, local_file';
COMMENT ON COLUMN video_sources.region IS '地区限制：全球 = 无限制，其他为具体地区';
