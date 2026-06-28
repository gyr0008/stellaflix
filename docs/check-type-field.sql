-- 检查 movies 表是否有 type 字段
-- 用于区分电影（movie）和纪录片（documentary）

-- 查看表结构
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'movies'
ORDER BY ordinal_position;

-- 如果没有 type 字段，执行以下 SQL 添加：
-- ALTER TABLE movies
-- ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'movie'
-- CHECK (type IN ('movie', 'documentary'));

-- 查看当前电影的类型分布
SELECT
  type,
  COUNT(*) as count
FROM movies
WHERE is_published = true
GROUP BY type;

-- 将现有电影都标记为电影（如果不是纪录片的话）
-- UPDATE movies SET type = 'movie' WHERE type IS NULL OR type = '';
