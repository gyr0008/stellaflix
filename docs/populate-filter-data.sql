-- 填充筛选数据
-- 执行位置：Supabase SQL编辑器

-- 1. 填充地区数据（根据标题中的中文字符判断为中国大陆）
UPDATE movies SET region = '中国大陆' WHERE title ~ '[一-龥]' AND region IS NULL;
UPDATE movies SET region = '日本' WHERE genre @> '["动画"]' AND region IS NULL;
UPDATE movies SET region = '美国' WHERE (genre @> '["科幻"]' OR genre @> '["动作"]') AND region IS NULL;

-- 2. 填充语言数据
UPDATE movies SET language = '汉语' WHERE title ~ '[一-龥]' AND language IS NULL;
UPDATE movies SET language = '日语' WHERE genre @> '["动画"]' AND language IS NULL;
UPDATE movies SET language = '英语' WHERE (genre @> '["科幻"]' OR genre @> '["动作"]') AND language IS NULL;

-- 3. 生成热度数据（基于评分和年份）
UPDATE movies SET heat = FLOOR(rating * 10 + (2024 - COALESCE(year, 2000)) * 0.5)::INTEGER WHERE heat = 0;

-- 4. 验证结果
SELECT region, COUNT(*) as count FROM movies WHERE region IS NOT NULL GROUP BY region ORDER BY count DESC;
SELECT language, COUNT(*) as count FROM movies WHERE language IS NOT NULL GROUP BY language ORDER BY count DESC;
