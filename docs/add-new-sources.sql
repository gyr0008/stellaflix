-- 添加新的视频源（更稳定的源）
-- 请在 Supabase SQL Editor 中执行

-- 1. 暴风资源
INSERT INTO video_source_configs (name, code, type, base_url, api_format, search_path, detail_path, categories, priority, enabled, status)
VALUES (
  '暴风资源',
  'baofeng',
  'cms',
  'https://bfzyapi.com',
  'json',
  '/api.php/provide/vod/?ac=detail&wd={query}',
  '/api.php/provide/vod/?ac=detail&ids={id}',
  '["电影","电视剧","动漫","综艺"]',
  90,
  true,
  'active'
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  base_url = EXCLUDED.base_url,
  search_path = EXCLUDED.search_path,
  detail_path = EXCLUDED.detail_path,
  updated_at = NOW();

-- 2. 淘片资源
INSERT INTO video_source_configs (name, code, type, base_url, api_format, search_path, detail_path, categories, priority, enabled, status)
VALUES (
  '淘片资源',
  'taopian',
  'cms',
  'https://taopianapi.com',
  'json',
  '/home/cjapi/vod/mc/we/page/?ac=detail&wd={query}',
  '/home/cjapi/vod/mc/we/page/?ac=detail&ids={id}',
  '["电影","电视剧","动漫","综艺"]',
  85,
  true,
  'active'
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  base_url = EXCLUDED.base_url,
  search_path = EXCLUDED.search_path,
  detail_path = EXCLUDED.detail_path,
  updated_at = NOW();

-- 3. 光速资源
INSERT INTO video_source_configs (name, code, type, base_url, api_format, search_path, detail_path, categories, priority, enabled, status)
VALUES (
  '光速资源',
  'guangsu',
  'cms',
  'https://api.guangsuapi.com',
  'json',
  '/api.php/provide/vod/?ac=detail&wd={query}',
  '/api.php/provide/vod/?ac=detail&ids={id}',
  '["电影","电视剧","动漫","综艺"]',
  88,
  true,
  'active'
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  base_url = EXCLUDED.base_url,
  search_path = EXCLUDED.search_path,
  detail_path = EXCLUDED.detail_path,
  updated_at = NOW();

-- 4. 红牛资源
INSERT INTO video_source_configs (name, code, type, base_url, api_format, search_path, detail_path, categories, priority, enabled, status)
VALUES (
  '红牛资源',
  'hongniu',
  'cms',
  'https://www.hongniuzy2.com',
  'json',
  '/api.php/vod/vod/?ac=detail&wd={query}',
  '/api.php/vod/vod/?ac=detail&ids={id}',
  '["电影","电视剧","动漫","综艺"]',
  82,
  true,
  'active'
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  base_url = EXCLUDED.base_url,
  search_path = EXCLUDED.search_path,
  detail_path = EXCLUDED.detail_path,
  updated_at = NOW();

-- 5. 闪电资源
INSERT INTO video_source_configs (name, code, type, base_url, api_format, search_path, detail_path, categories, priority, enabled, status)
VALUES (
  '闪电资源',
  'shandian',
  'cms',
  'https://sdzyapi.com',
  'json',
  '/api.php/provide/vod/?ac=detail&wd={query}',
  '/api.php/provide/vod/?ac=detail&ids={id}',
  '["电影","电视剧","动漫","综艺"]',
  80,
  true,
  'active'
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  base_url = EXCLUDED.base_url,
  search_path = EXCLUDED.search_path,
  detail_path = EXCLUDED.detail_path,
  updated_at = NOW();

-- 查看所有视频源
SELECT name, code, base_url, priority, enabled, status FROM video_source_configs ORDER BY priority DESC;
