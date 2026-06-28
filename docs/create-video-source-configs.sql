-- StellaFlix 视频源配置表（参考 Kazumi 架构）
-- 用途：管理视频源配置，支持多源聚合和自动切换

-- ============================================
-- 1. 视频源类型枚举
-- ============================================
DO $$ BEGIN
  CREATE TYPE video_source_type AS ENUM (
    'youtube',        -- YouTube 嵌入（合规）
    'vimeo',          -- Vimeo 嵌入（合规）
    'custom_embed',   -- 自定义 iframe 嵌入
    'custom_url',     -- 自定义视频 URL (m3u8/mp4)
    'local_file'      -- 本地上传文件
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- 2. 视频源配置表
-- ============================================
CREATE TABLE IF NOT EXISTS video_source_configs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

  -- 关联的电影
  movie_id UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,

  -- 基本信息
  name VARCHAR(255) NOT NULL,                     -- 显示名称
  source_type video_source_type NOT NULL,         -- 源类型
  priority INTEGER DEFAULT 0,                     -- 优先级（数字越小优先级越高）
  regions TEXT[] DEFAULT '{"全球"}',               -- 支持的地区
  is_active BOOLEAN DEFAULT true,                 -- 是否启用

  -- 配置（JSON 格式，灵活扩展）
  config JSONB NOT NULL,                          -- 源配置

  -- 统计
  play_count INTEGER DEFAULT 0,                   -- 播放次数
  success_rate DECIMAL(5,2) DEFAULT 100.00,       -- 成功率
  last_played_at TIMESTAMP WITH TIME ZONE,        -- 最后播放时间
  error_message TEXT,                             -- 最后错误信息

  -- 时间戳
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 3. 索引
-- ============================================
CREATE INDEX idx_video_configs_movie ON video_source_configs(movie_id);
CREATE INDEX idx_video_configs_type ON video_source_configs(source_type);
CREATE INDEX idx_video_configs_priority ON video_source_configs(priority);
CREATE INDEX idx_video_configs_active ON video_source_configs(is_active);

-- ============================================
-- 4. RLS 策略
-- ============================================
ALTER TABLE video_source_configs ENABLE ROW LEVEL SECURITY;

-- 所有人可查看启用的视频源
CREATE POLICY "所有人可查看启用的视频源" ON video_source_configs
  FOR SELECT USING (is_active = true);

-- 管理员可管理所有视频源
CREATE POLICY "管理员可管理视频源" ON video_source_configs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- ============================================
-- 5. 示例数据
-- ============================================

-- 示例：为某部电影添加 YouTube 源
-- INSERT INTO video_source_configs (movie_id, name, source_type, priority, config)
-- VALUES (
--   '电影ID',
--   'YouTube - 预告片',
--   'youtube',
--   1,
--   '{"youtube": {"videoId": "dQw4w9WgXcQ"}}'
-- );

-- 示例：为某部电影添加自定义 URL 源
-- INSERT INTO video_source_configs (movie_id, name, source_type, priority, config)
-- VALUES (
--   '电影ID',
--   'Internet Archive - 公共领域',
--   'custom_url',
--   2,
--   '{"customUrl": {"videoUrl": "https://archive.org/xxx.mp4", "type": "mp4"}}'
-- );

-- ============================================
-- 6. 函数：更新播放统计
-- ============================================
CREATE OR REPLACE FUNCTION update_play_stats(
  source_id UUID,
  success BOOLEAN
)
RETURNS void AS $$
BEGIN
  UPDATE video_source_configs
  SET
    play_count = play_count + 1,
    success_rate = CASE
      WHEN success THEN (success_rate * play_count + 100) / (play_count + 1)
      ELSE (success_rate * play_count) / (play_count + 1)
    END,
    last_played_at = NOW(),
    updated_at = NOW()
  WHERE id = source_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 7. 视图：视频源统计
-- ============================================
CREATE OR REPLACE VIEW video_source_stats AS
SELECT
  vsc.*,
  m.title as movie_title,
  m.year as movie_year
FROM video_source_configs vsc
JOIN movies m ON vsc.movie_id = m.id
WHERE vsc.is_active = true
ORDER BY vsc.priority, vsc.success_rate DESC;

COMMENT ON TABLE video_source_configs IS '视频源配置表 - 参考 Kazumi 多源聚合架构';
