-- 添加评分来源字段到 movies 表
-- 用于存储多个来源的评分信息（TMDB、豆瓣等）

-- 添加 rating_sources 字段（JSON 格式，存储各来源评分详情）
ALTER TABLE movies
ADD COLUMN IF NOT EXISTS rating_sources JSONB DEFAULT '[]'::jsonb;

-- 添加注释
COMMENT ON COLUMN movies.rating_sources IS '评分来源列表，格式: [{source, rating, ratingCount, url}]';

-- 创建索引（用于查询高分电影）
CREATE INDEX IF NOT EXISTS idx_movies_rating ON movies(rating DESC) WHERE is_published = true AND rating >= 8.0;

-- 创建索引（用于查询需要更新评分的电影）
CREATE INDEX IF NOT EXISTS idx_movies_rating_null ON movies(rating) WHERE is_published = true AND (rating IS NULL OR rating = 0);

-- 更新现有电影的 rating_count（如果为 null）
UPDATE movies
SET rating_count = 0
WHERE rating_count IS NULL AND is_published = true;

-- 查看统计
SELECT
  COUNT(*) as total_movies,
  COUNT(CASE WHEN rating > 0 THEN 1 END) as rated_movies,
  COUNT(CASE WHEN rating >= 8.0 THEN 1 END) as high_quality_movies,
  COUNT(CASE WHEN rating IS NULL OR rating = 0 THEN 1 END) as unrated_movies
FROM movies
WHERE is_published = true;
