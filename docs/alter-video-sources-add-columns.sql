-- 修改 video_sources 表，添加新字段
-- 用途：扩展视频源表支持更多功能

-- ============================================
-- 1. 添加新列（如果不存在）
-- ============================================

-- 添加 source_type 列
DO $$ BEGIN
  ALTER TABLE video_sources ADD COLUMN source_type text default 'youtube';
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- 添加 source_name 列（重命名 name）
DO $$ BEGIN
  ALTER TABLE video_sources ADD COLUMN source_name text;
  -- 将旧数据复制到新列
  UPDATE video_sources SET source_name = name WHERE source_name IS NULL;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- 添加 source_url 列（重命名 url）
DO $$ BEGIN
  ALTER TABLE video_sources ADD COLUMN source_url text;
  -- 将旧数据复制到新列
  UPDATE video_sources SET source_url = url WHERE source_url IS NULL;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- 添加 source_quality 列（重命名 quality）
DO $$ BEGIN
  ALTER TABLE video_sources ADD COLUMN source_quality text default '720p';
  -- 将旧数据复制到新列
  UPDATE video_sources SET source_quality = quality WHERE source_quality = 'unknown';
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- 添加地区限制
DO $$ BEGIN
  ALTER TABLE video_sources ADD COLUMN region text default '全球';
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- 添加排序和播放次数
DO $$ BEGIN
  ALTER TABLE video_sources ADD COLUMN sort_order integer default 0;
  ALTER TABLE video_sources ADD COLUMN play_count integer default 0;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- ============================================
-- 2. 创建索引
-- ============================================
CREATE INDEX IF NOT EXISTS idx_video_sources_type ON video_sources(source_type);
CREATE INDEX IF NOT EXISTS idx_video_sources_active ON video_sources(is_active);

-- ============================================
-- 3. 更新视图
-- ============================================
CREATE OR REPLACE VIEW video_source_stats AS
SELECT
  vs.*,
  m.title as movie_title,
  m.year as movie_year
FROM video_sources vs
JOIN movies m ON vs.movie_id = m.id
WHERE vs.is_active = true
ORDER BY vs.sort_order, vs.play_count DESC;

COMMENT ON TABLE video_sources IS '视频源管理表 - 支持多种视频源类型';
