-- 检查 movies 表中的 poster_url 数据
SELECT
  id,
  title,
  poster_url,
  CASE
    WHEN poster_url IS NULL THEN '❌ NULL'
    WHEN poster_url = '' THEN '❌ 空字符串'
    WHEN poster_url LIKE 'http%' THEN '✅ 完整URL'
    WHEN poster_url LIKE '/%' THEN '⚠️ 相对路径'
    ELSE '⚠️ 其他格式'
  END as url_status
FROM movies
WHERE is_published = true
ORDER BY rating DESC
LIMIT 20;
