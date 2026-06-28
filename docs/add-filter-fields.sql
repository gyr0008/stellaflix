-- 添加筛选所需的字段到movies表
-- 执行位置：Supabase SQL编辑器

-- 1. 添加region（地区）字段
ALTER TABLE movies ADD COLUMN IF NOT EXISTS region TEXT;

-- 2. 添加language（语言）字段
ALTER TABLE movies ADD COLUMN IF NOT EXISTS language TEXT;

-- 3. 添加heat（热度）字段
ALTER TABLE movies ADD COLUMN IF NOT EXISTS heat INTEGER DEFAULT 0;

-- 4. 创建索引提高筛选性能
CREATE INDEX IF NOT EXISTS idx_movies_region ON movies(region);
CREATE INDEX IF NOT EXISTS idx_movies_language ON movies(language);
CREATE INDEX IF NOT EXISTS idx_movies_heat ON movies(heat DESC);

-- 5. 验证
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'movies'
AND column_name IN ('region', 'language', 'heat');
